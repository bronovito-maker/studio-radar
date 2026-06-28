import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { PlacesError, searchGooglePlaces } from "@/lib/places/client";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || !provided) return false;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  const [{ data: settings }, { data: owner }] = await Promise.all([
    supabase.from("settings").select("cron_enabled, cron_category, cron_location, cron_region").eq("id", 1).single(),
    supabase.from("profiles").select("id").eq("role", "admin").order("created_at").limit(1).single(),
  ]);
  if (!settings || !owner) return NextResponse.json({ error: "CONFIGURATION_MISSING" }, { status: 503 });
  if (!settings.cron_enabled) return NextResponse.json({ status: "disabled" });

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
    const places = await searchGooglePlaces({
      category: settings.cron_category,
      location: settings.cron_location,
      region: settings.cron_region,
      pageSize: 10,
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
    const freshIds = placeIds.filter((placeId) => !existing.has(placeId));
    if (freshIds.length) {
      const { error } = await supabase.from("lead_candidates").insert(freshIds.map((placeId) => ({
        google_place_id: placeId,
        search_category: settings.cron_category,
        search_location: settings.cron_location,
        search_region: settings.cron_region,
        origin: "cron",
        created_by: owner.id,
      })));
      if (error) throw error;
    }

    await supabase.from("scan_runs").update({
      status: "succeeded",
      found_count: placeIds.length,
      imported_count: freshIds.length,
      duplicate_count: placeIds.length - freshIds.length,
      finished_at: new Date().toISOString(),
    }).eq("id", scan.id);
    return NextResponse.json({ status: "succeeded", found: placeIds.length, shortlisted: freshIds.length });
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
