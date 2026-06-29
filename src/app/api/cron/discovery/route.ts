import { NextResponse } from "next/server";
import { PlacesError, searchGooglePlacesBatch } from "@/lib/places/client";
import { hasBearerToken } from "@/lib/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { scoreLead } from "@/lib/scoring/deterministic";
import { withOptOut } from "@/lib/email-outreach";
import { mapWithConcurrency, scoutWebsite } from "@/lib/web-scout";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Deterministic outreach template — no AI cost, uses scoring data. */
function outreachTemplate(businessName: string, recommendedService: string, category: string) {
  const service = recommendedService
    ? recommendedService.replace(/-/g, " ")
    : category
      ? `migliorare la presenza digitale nel settore ${category}`
      : "migliorare la propria presenza digitale";
  return `Buongiorno,\n\nabbiamo analizzato la presenza digitale di ${businessName} e abbiamo individuato alcune opportunità concrete per ${service}.\n\nIl nostro approccio è basato su dati verificabili: osserviamo sito, recensioni, canali di prenotazione e automazione dei processi, e proponiamo solo interventi mirati e misurabili.\n\nSe desidera, possiamo condividere due spunti specifici in una breve chiamata conoscitiva, senza impegno.\n\nCordialmente,\nStudio Radar`;
}

export async function GET(request: Request) {
  if (!hasBearerToken(request, process.env.CRON_SECRET)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  const [{ data: settings }, { data: owner }] = await Promise.all([
    supabase.from("settings").select(
      "cron_enabled, cron_category, cron_location, cron_region, cron_page_size, default_score_threshold, email_auto_outreach_enabled, email_enabled, email_sender_name, email_sender_email, email_reply_to, email_daily_limit, email_follow_up_enabled"
    ).eq("id", 1).single(),
    supabase.from("profiles").select("id").eq("role", "admin").order("created_at").limit(1).single(),
  ]);
  if (!settings || !owner) return NextResponse.json({ error: "CONFIGURATION_MISSING" }, { status: 503 });
  if (!settings.cron_enabled) return NextResponse.json({ status: "disabled" });

  // Cleanup stale locks.
  await supabase
    .from("scan_runs")
    .update({ status: "failed", error_message: "STALE_LOCK", finished_at: new Date().toISOString() })
    .eq("trigger", "cron")
    .eq("status", "running")
    .lt("started_at", new Date(Date.now() - 30 * 60_000).toISOString());

  const { data: scan, error: scanError } = await supabase
    .from("scan_runs")
    .insert({
      trigger: "cron",
      category: settings.cron_category,
      region: `${settings.cron_location}, ${settings.cron_region}`,
      status: "running",
      created_by: owner.id,
    })
    .select("id")
    .single();
  if (scanError?.code === "23505") return NextResponse.json({ error: "SCAN_ALREADY_RUNNING" }, { status: 409 });
  if (scanError || !scan) return NextResponse.json({ error: "SCAN_NOT_STARTED" }, { status: 500 });

  try {
    // ── Phase 1: Discovery (Google Places batch search) ────────────────────
    const places = await searchGooglePlacesBatch({
      category: settings.cron_category,
      location: settings.cron_location,
      region: settings.cron_region,
      targetCount: settings.cron_page_size,
    });

    const placeIds = places.map((place) => place.id);
    const [{ data: leads }, { data: candidates }] = placeIds.length ? await Promise.all([
      supabase.from("leads").select("google_place_id").in("google_place_id", placeIds),
      supabase.from("lead_candidates").select("google_place_id").in("google_place_id", placeIds),
    ]) : [{ data: [] }, { data: [] }];
    const existing = new Set([
      ...(leads ?? []).map((lead) => lead.google_place_id).filter(Boolean),
      ...(candidates ?? []).map((candidate) => candidate.google_place_id),
    ]);
    const freshPlaces = places.filter((place) => !existing.has(place.id));

    // Shortlist new places.
    if (freshPlaces.length) {
      const { error: shortlistError } = await supabase.from("lead_candidates").insert(
        freshPlaces.map((place) => ({
          google_place_id: place.id,
          search_category: settings.cron_category,
          search_location: settings.cron_location,
          search_region: settings.cron_region,
          origin: "cron",
          created_by: owner.id,
        }))
      );
      if (shortlistError) throw shortlistError;
    }

    // ── Phase 2: Auto-convert, score, and queue outreach ───────────────────
    let converted = 0;
    let duplicates = 0;
    let queued = 0;
    let scouted = 0;
    const resolvedPlaceIds: string[] = [];

    const reachOutEnabled = settings.email_auto_outreach_enabled && settings.email_enabled && Boolean(settings.email_sender_email);

    const enrichedPlaces = await mapWithConcurrency(freshPlaces, 5, async (place) => ({
      place,
      scoutResult: place.websiteUri ? await scoutWebsite(place.websiteUri) : null,
    }));

    for (const { place, scoutResult } of enrichedPlaces) {
      const city = settings.cron_location;
      const region = settings.cron_region;
      const category = settings.cron_category;
      const websiteUrl = place.websiteUri ?? null;
      if (!websiteUrl) continue;
      if (!scoutResult || scoutResult.status !== "ok" || !scoutResult.businessName) continue;
      scouted += 1;
      const businessName = scoutResult.businessName;
      const phone = scoutResult.phones[0]?.number ?? null;

      // Auto-create lead via RPC (deduplication + advisory locks).
      const { data: createResult, error: createError } = await supabase.rpc("auto_create_lead_from_place", {
        p_google_place_id: place.id,
        p_business_name: businessName,
        p_city: city,
        p_region: region,
        p_category: category,
        p_phone: phone,
        p_email: scoutResult.emails[0]?.address ?? null,
        p_website_url: scoutResult.websiteUrl,
        p_address: null,
        p_has_booking: scoutResult.hasBooking,
        p_rating: null,
        p_review_count: null,
        p_estimated_value: 0,
        p_origin: "cron",
      });

      if (createError) {
        console.error("Auto-create lead failed", { placeId: place.id, code: createError.code });
        continue;
      }

      const result = createResult as { status: string; lead_id: string } | null;
      if (!result || result.status === "duplicate") {
        duplicates += 1;
        if (result?.status === "duplicate") resolvedPlaceIds.push(place.id);
        continue;
      }

      const leadId = result.lead_id;
      converted += 1;
      resolvedPlaceIds.push(place.id);

      // Save website-derived findings as a lead event for traceability.
        await supabase.from("lead_events").insert({
          lead_id: leadId,
          actor_id: owner.id,
          event_type: "scout_completed",
          payload: {
            status: scoutResult.status,
            emails: scoutResult.emails,
            phones: scoutResult.phones,
            hasBooking: scoutResult.hasBooking,
            bookingProvider: scoutResult.bookingProvider,
            hasWhatsapp: scoutResult.hasWhatsapp,
            hasChatbot: scoutResult.hasChatbot,
            chatbotProvider: scoutResult.chatbotProvider,
            socialChannels: scoutResult.socialChannels,
            locations: scoutResult.locations,
            evidenceLevel: scoutResult.evidenceLevel,
            checkedUrls: scoutResult.checkedUrls,
          } as unknown as Json,
        });

        // Append an AI-friendly summary to lead notes.
        const notesParts: string[] = [];
        if (scoutResult.emails.length) {
          notesParts.push(`📧 Email trovate: ${scoutResult.emails.map((e) => `${e.address} (${e.quality})`).join(", ")}`);
        }
        if (scoutResult.phones.length) {
          notesParts.push(`📞 Telefoni: ${scoutResult.phones.map((p) => `${p.number} (${p.type})`).join(", ")}`);
        }
        if (scoutResult.hasChatbot) {
          notesParts.push(`⚠️ Chatbot rilevato: ${scoutResult.chatbotProvider}`);
        }
        if (scoutResult.hasBooking) {
          notesParts.push(`🏨 Booking: ${scoutResult.bookingProvider || "presente"} (${scoutResult.bookingVisibility})`);
        }
        if (scoutResult.socialChannels.length) {
          notesParts.push(`📱 Social: ${scoutResult.socialChannels.map((s) => s.platform).join(", ")}`);
        }
        if (scoutResult.locations.length > 1) {
          notesParts.push(`📍 ${scoutResult.locations.length} sedi rilevate`);
        }
        if (notesParts.length) {
          await supabase.from("leads").update({ notes: notesParts.join("\n") }).eq("id", leadId);
        }

      // ── Scoring ───────────────────────────────────────────────────────────
      const scoreResult = scoreLead({
        businessName,
        region,
        category,
        phone,
        email: scoutResult.emails[0]?.address ?? null,
        websiteUrl: scoutResult.websiteUrl,
        rating: null,
        reviewCount: null,
        hasBooking: scoutResult.hasBooking,
        businessStatus: null,
        source: "google_places",
        googlePlaceId: place.id,
        websiteVerification: "verified_present",
      });

      const { error: scoreError } = await supabase.rpc("save_automated_deterministic_score", {
        p_lead_id: leadId,
        p_score: scoreResult.score,
        p_grade: scoreResult.grade,
        p_reasoning: scoreResult.reasoning,
        p_positive_signals: scoreResult.positiveSignals,
        p_negative_signals: scoreResult.negativeSignals,
        p_confidence: scoreResult.confidence / 100,
        p_version: scoreResult.version,
        p_input_snapshot: {
          input: { businessName, region, category, phone, websiteUrl: scoutResult.websiteUrl, rating: null, reviewCount: null, hasBooking: scoutResult.hasBooking, businessStatus: null, source: "google_places", googlePlaceId: place.id },
          scoringV2: scoreResult,
          scout: scoutResult ? { emails: scoutResult.emails, phones: scoutResult.phones, hasBooking: scoutResult.hasBooking, hasChatbot: scoutResult.hasChatbot, socialChannels: scoutResult.socialChannels, locations: scoutResult.locations, evidenceLevel: scoutResult.evidenceLevel } : null,
        } as unknown as Json,
        p_recommended_service_slug: scoreResult.recommendedService ?? "",
      });
      if (scoreError) {
        console.error("Automated score persistence failed", { leadId, code: scoreError.code });
        continue;
      }

      // ── Queue outreach email (NEVER auto-send — admin approves in the morning) ──
      if (!reachOutEnabled) continue;

      // Use scout email if available, otherwise skip (no guessing info@).
      const bestEmail = scoutResult?.emails[0]?.address ?? null;
      if (!bestEmail) continue; // only queue when we have a real email

      // Skip leads with competitor chatbots — they likely already have a provider.
      if (scoutResult?.hasChatbot) continue;

      // Skip leads below scoring threshold.
      if (scoreResult.nextAction !== "contact_now" || scoreResult.score < settings.default_score_threshold) continue;

      const service = scoreResult.recommendedService
        ? scoreResult.recommendedService.replace(/-/g, " ")
        : "presenza digitale";
      const body = outreachTemplate(businessName, scoreResult.recommendedService ?? "", category);

      const { error: queueError } = await supabase.from("email_messages").insert({
        lead_id: leadId,
        recipient_email: bestEmail,
        recipient_name: businessName,
        subject: `${service} per ${businessName}`,
        body: withOptOut(body),
        status: "queued",
        kind: "initial",
        created_by: owner.id,
      });

      if (!queueError) queued += 1;
    }

    // Cleanup: remove auto-converted candidates from the shortlist.
    if (resolvedPlaceIds.length) {
      await supabase.from("lead_candidates").delete().in("google_place_id", resolvedPlaceIds);
    }

    await supabase.from("scan_runs").update({
      status: "succeeded",
      found_count: placeIds.length,
      imported_count: freshPlaces.length,
      duplicate_count: placeIds.length - freshPlaces.length,
      finished_at: new Date().toISOString(),
    }).eq("id", scan.id);

    return NextResponse.json({
      status: "succeeded",
      found: placeIds.length,
      shortlisted: freshPlaces.length,
      converted,
      duplicates: duplicates + (placeIds.length - freshPlaces.length),
      scouted,
      queued,
    });
  } catch (error) {
    const code = error instanceof PlacesError ? error.code : "CRON_FAILED";
    console.error("Cron discovery failed", { scanId: scan.id, code });
    await supabase.from("scan_runs").update({
      status: "failed",
      error_message: code,
      finished_at: new Date().toISOString(),
    }).eq("id", scan.id);
    return NextResponse.json({ error: code }, { status: 502 });
  }
}
