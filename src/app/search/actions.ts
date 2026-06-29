"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AiAnalysisError, enrichCandidateFromOfficialWebsite } from "@/lib/ai/openai";
import { requireViewer } from "@/lib/auth";
import { findExistingLeadKeys } from "@/lib/leads/deduplication";
import {
  normalizeBusinessCityKey,
  normalizePhoneKey,
  normalizeWebsite,
} from "@/lib/leads/normalization";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import { getGooglePlaceSummary, isPlacesConfigured, PlacesError, searchGooglePlaces, type GooglePlace } from "@/lib/places/client";
import { consumeRateLimit } from "@/lib/rate-limit";
import { scoreLead, type DeterministicScoreResult } from "@/lib/scoring/deterministic";
import { createClient } from "@/lib/supabase/server";

const searchSchema = z.object({
  category: z.enum(DISCOVERY_CATEGORIES),
  location: z.string().trim().max(100).optional().default(""),
  region: z.string().trim().max(100).optional().default(""),
  pageSize: z.coerce.number().int().min(5).max(20),
}).refine((data) => (data.location.length >= 2 || data.region.length >= 2), {
  message: "Inserisci almeno una città o una regione",
});

export type DiscoveryResult = {
  placeId: string;
  businessName: string;
  address: string;
  city: string;
  region: string;
  category: string;
  phone: string;
  websiteUrl: string;
  rating: number | null;
  reviewCount: number | null;
  businessStatus: string | null;
  googleMapsUri: string;
  attributions: Array<{ provider: string; providerUri: string }>;
  score: DeterministicScoreResult;
  duplicateLeadId: string | null;
  shortlisted: boolean;
};

export type DiscoverySearchState = {
  status: "idle" | "success" | "error";
  message?: string;
  results: DiscoveryResult[];
  query?: { category: string; location: string; region: string };
};

export type ShortlistState = { status: "idle" | "saved" | "error"; message?: string };
export type CandidateEnrichmentState = {
  status: "idle" | "ready" | "error";
  message?: string;
  data?: {
    businessName: string;
    category: string;
    city: string;
    region: string;
    phone: string;
    email: string;
    address: string;
    websiteUrl: string;
    hasBooking: boolean;
    confidence: number;
    missingEvidence: string[];
    sources: string[];
    fieldSources: Record<CandidateFieldKey, string | null>;
  };
};

export type CandidateFieldKey =
  | "businessName" | "category" | "city" | "region" | "phone"
  | "email" | "address" | "websiteUrl" | "hasBooking";

const shortlistSchema = z.object({
  placeId: z.string().trim().min(1).max(2048),
  category: z.enum(DISCOVERY_CATEGORIES),
  location: z.string().trim().max(100).optional().default(""),
  region: z.string().trim().max(100).optional().default(""),
});

const confirmCandidateSchema = z.object({
  candidateId: z.uuid(),
  businessName: z.string().trim().min(2, "Inserisci il nome dell'attività").max(200),
  category: z.string().trim().max(200).transform((entry) => entry || null),
  city: z.string().trim().max(120).transform((entry) => entry || null),
  region: z.string().trim().max(120).transform((entry) => entry || null),
  phone: z.string().trim().max(60).transform((entry) => entry || null),
  email: z.string().trim().max(254).refine((entry) => !entry || z.email().safeParse(entry).success, "Email non valida").transform((entry) => entry || null),
  address: z.string().trim().max(300).transform((entry) => entry || null),
  websiteUrl: z.string().trim().max(2048).refine((entry) => !entry || z.url().safeParse(entry).success, "Sito web non valido").transform((entry) => entry || null),
  hasBooking: z.boolean(),
  estimatedValue: z.coerce.number().min(0).max(10_000_000),
});

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function withMessage(path: string, type: "error" | "success", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${type}=${encodeURIComponent(message)}`;
}

function addressPart(place: GooglePlace, types: string[]) {
  return place.addressComponents?.find((component) => types.some((type) => component.types.includes(type)))?.longText ?? "";
}

export async function searchPlacesAction(
  _previousState: DiscoverySearchState,
  formData: FormData,
): Promise<DiscoverySearchState> {
  const viewer = await requireViewer();
  const parsed = searchSchema.safeParse({
    category: value(formData, "category"),
    location: value(formData, "location"),
    region: value(formData, "region"),
    pageSize: value(formData, "pageSize") || "10",
  });
  if (!parsed.success) {
    return { status: "error", message: "Controlla categoria, zona e numero di risultati.", results: [] };
  }
  if (!isPlacesConfigured()) {
    return { status: "error", message: "Google Places non è ancora configurato. Aggiungi la chiave server-side per avviare la ricerca.", results: [] };
  }

  const query = {
    category: parsed.data.category,
    location: parsed.data.location,
    region: parsed.data.region,
  };
  const supabase = await createClient();
  if (!await consumeRateLimit(supabase, "places_search")) {
    return { status: "error", message: "Hai raggiunto il limite di ricerche. Attendi un minuto e riprova.", results: [], query };
  }
  const { data: scanRun, error: scanError } = await supabase
    .from("scan_runs")
    .insert({
      trigger: "manual",
      category: parsed.data.category,
      region: `${parsed.data.location}, ${parsed.data.region}`,
      status: "running",
      created_by: viewer.id,
    })
    .select("id")
    .single();

  if (scanError || !scanRun) {
    return { status: "error", message: "Impossibile avviare la ricerca. Riprova.", results: [], query };
  }

  try {
    const places = await searchGooglePlaces(parsed.data);
    if (!places.length) {
      await supabase
        .from("scan_runs")
        .update({ status: "succeeded", found_count: 0, finished_at: new Date().toISOString() })
        .eq("id", scanRun.id);
      return { status: "success", results: [], query };
    }

    const normalized = places.map((place) => {
      const city = addressPart(place, ["locality", "postal_town", "administrative_area_level_3"]) || parsed.data.location;
      const region = addressPart(place, ["administrative_area_level_1"]) || parsed.data.region;
      const website = normalizeWebsite(place.websiteUri ?? "");
      const category = place.primaryTypeDisplayName?.text || place.primaryType || parsed.data.category;
      return {
        place,
        city,
        region,
        category,
        phoneNormalized: normalizePhoneKey(place.nationalPhoneNumber ?? ""),
        websiteNormalized: website.key,
        businessCityNormalized: normalizeBusinessCityKey(place.displayName.text, city),
      };
    });
    const [placeDuplicateResponse, shortlistResponse, existingKeys] = await Promise.all([
      supabase.from("leads").select("id, google_place_id").in("google_place_id", places.map((place) => place.id)),
      supabase.from("lead_candidates").select("google_place_id").in("google_place_id", places.map((place) => place.id)),
      findExistingLeadKeys(
        supabase,
        normalized.map((item) => ({
          emailNormalized: null,
          phoneNormalized: item.phoneNormalized,
          websiteNormalized: item.websiteNormalized,
          businessCityNormalized: item.businessCityNormalized,
        })),
      ),
    ]);
    if (placeDuplicateResponse.error || shortlistResponse.error) throw new Error("PLACE_DEDUPE_QUERY_FAILED");
    const placeDuplicates = placeDuplicateResponse.data;
    const duplicatesByPlace = new Map(placeDuplicates?.map((lead) => [lead.google_place_id, lead.id]) ?? []);
    const shortlistedPlaceIds = new Set(shortlistResponse.data?.map((candidate) => candidate.google_place_id) ?? []);

    const results: DiscoveryResult[] = normalized.map((item) => {
      const keys = [
        item.phoneNormalized ? `phone:${item.phoneNormalized}` : null,
        item.websiteNormalized ? `website:${item.websiteNormalized}` : null,
        `business:${item.businessCityNormalized}`,
      ].filter((key): key is string => Boolean(key));
      const duplicateLeadId = duplicatesByPlace.get(item.place.id)
        ?? keys.map((key) => existingKeys.get(key)).find(Boolean)
        ?? null;
      const score = scoreLead({
        businessName: item.place.displayName.text,
        region: item.region,
        category: `${parsed.data.category} ${item.place.primaryType ?? ""}`,
        phone: item.place.nationalPhoneNumber,
        websiteUrl: item.place.websiteUri,
        rating: item.place.rating,
        reviewCount: item.place.userRatingCount,
        hasBooking: item.place.reservable,
        businessStatus: item.place.businessStatus ?? null,
        source: "google_places",
        googlePlaceId: item.place.id,
        websiteVerification: item.place.websiteUri ? "verified_present" : "not_detected",
      });

      return {
        placeId: item.place.id,
        businessName: item.place.displayName.text,
        address: item.place.formattedAddress ?? "",
        city: item.city,
        region: item.region,
        category: item.category,
        phone: item.place.nationalPhoneNumber ?? "",
        websiteUrl: item.place.websiteUri ?? "",
        rating: item.place.rating ?? null,
        reviewCount: item.place.userRatingCount ?? null,
        businessStatus: item.place.businessStatus ?? null,
        googleMapsUri: item.place.googleMapsUri ?? "",
        attributions: (item.place.attributions ?? []).map((attribution) => ({
          provider: attribution.provider ?? "",
          providerUri: attribution.providerUri ?? "",
        })),
        score,
        duplicateLeadId,
        shortlisted: shortlistedPlaceIds.has(item.place.id),
      };
    });

    results.sort((a, b) =>
      b.score.opportunityScore - a.score.opportunityScore
      || b.score.components.businessViability - a.score.components.businessViability
      || b.score.confidence - a.score.confidence,
    );

    await supabase
      .from("scan_runs")
      .update({
        status: "succeeded",
        found_count: results.length,
        duplicate_count: results.filter((result) => result.duplicateLeadId).length,
        finished_at: new Date().toISOString(),
      })
      .eq("id", scanRun.id);

    return { status: "success", results, query };
  } catch (error) {
    const code = error instanceof PlacesError ? error.code : "REQUEST_FAILED";
    console.error("Google Places search failed", { code, scanRunId: scanRun.id });
    await supabase
      .from("scan_runs")
      .update({ status: "failed", error_message: code, finished_at: new Date().toISOString() })
      .eq("id", scanRun.id);

    const message = code === "QUOTA"
      ? "Quota Google Places temporaneamente esaurita. Riprova più tardi."
      : "Google Places non ha completato la ricerca. Controlla configurazione e restrizioni della chiave.";
    return { status: "error", message, results: [], query };
  }
}

export async function shortlistPlaceAction(
  _previousState: ShortlistState,
  formData: FormData,
): Promise<ShortlistState> {
  const viewer = await requireViewer();
  const parsed = shortlistSchema.safeParse({
    placeId: value(formData, "placeId"),
    category: value(formData, "category"),
    location: value(formData, "location"),
    region: value(formData, "region"),
  });
  if (!parsed.success) return { status: "error", message: "Candidato non valido." };

  const supabase = await createClient();
  const { error } = await supabase.from("lead_candidates").insert({
    google_place_id: parsed.data.placeId,
    search_category: parsed.data.category,
    search_location: parsed.data.location,
    search_region: parsed.data.region,
    created_by: viewer.id,
  });
  if (error && error.code !== "23505") {
    return { status: "error", message: "Salvataggio non riuscito." };
  }

  revalidatePath("/search");
  return { status: "saved" };
}

export async function removeCandidateAction(formData: FormData) {
  await requireViewer();
  const id = z.uuid().safeParse(value(formData, "candidateId"));
  if (!id.success) return;

  const supabase = await createClient();
  const { error } = await supabase.from("lead_candidates").delete().eq("id", id.data);
  if (error) console.error("Candidate removal failed", { code: error.code });
  revalidatePath("/search");
}

export async function enrichCandidateAction(
  _previousState: CandidateEnrichmentState,
  formData: FormData,
): Promise<CandidateEnrichmentState> {
  const viewer = await requireViewer();
  const candidateId = z.uuid().safeParse(value(formData, "candidateId"));
  if (!candidateId.success) return { status: "error", message: "Candidato non valido." };

  const supabase = await createClient();
  const { data: candidate, error } = await supabase
    .from("lead_candidates")
    .select("id, google_place_id, search_category, search_location, search_region, created_by")
    .eq("id", candidateId.data)
    .single();
  if (error || !candidate) return { status: "error", message: "Candidato non disponibile." };
  if (candidate.created_by !== viewer.id && viewer.role !== "admin") {
    return { status: "error", message: "Solo chi ha salvato il candidato o un admin può convertirlo." };
  }
  if (!await consumeRateLimit(supabase, "candidate_enrichment")) {
    return { status: "error", message: "Limite analisi raggiunto. Riprova più tardi." };
  }

  try {
    const place = await getGooglePlaceSummary(candidate.google_place_id);
    if (!place?.websiteUri) {
      return { status: "error", message: "Questo candidato non ha un sito ufficiale verificabile. Compila i dati manualmente." };
    }
    const result = await enrichCandidateFromOfficialWebsite({
      websiteUrl: place.websiteUri,
      searchCategory: candidate.search_category,
      searchLocation: candidate.search_location,
      searchRegion: candidate.search_region,
    });
    return {
      status: "ready",
      data: {
        businessName: result.enrichment.businessName,
        category: result.enrichment.category,
        city: result.enrichment.city ?? "",
        region: result.enrichment.region ?? candidate.search_region,
        phone: result.enrichment.phone ?? "",
        email: result.enrichment.email ?? "",
        address: result.enrichment.address ?? "",
        websiteUrl: result.enrichment.websiteUrl,
        hasBooking: result.enrichment.hasBooking === true,
        confidence: result.enrichment.confidence,
        missingEvidence: result.enrichment.missingEvidence,
        sources: result.enrichment.sources,
        fieldSources: result.enrichment.fieldSources,
      },
    };
  } catch (analysisError) {
    const message = analysisError instanceof AiAnalysisError && analysisError.code === "NOT_CONFIGURED"
      ? "OpenAI non è configurato sul server. Compila i dati manualmente."
      : analysisError instanceof PlacesError && analysisError.code === "QUOTA"
        ? "Quota Google Places esaurita. Riprova più tardi."
        : "Non è stato possibile verificare il sito. Puoi compilare i dati manualmente.";
    return { status: "error", message };
  }
}

export async function confirmCandidateAction(formData: FormData) {
  await requireViewer();
  const candidateId = value(formData, "candidateId");
  const parsed = confirmCandidateSchema.safeParse({
    candidateId,
    businessName: value(formData, "businessName"),
    category: value(formData, "category"),
    city: value(formData, "city"),
    region: value(formData, "region"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    address: value(formData, "address"),
    websiteUrl: value(formData, "websiteUrl"),
    hasBooking: formData.get("hasBooking") === "on",
    estimatedValue: value(formData, "estimatedValue") || "0",
  });
  if (!parsed.success) {
    redirect(withMessage(`/search/candidates/${candidateId}`, "error", parsed.error.issues[0]?.message ?? "Dati non validi"));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_candidate_to_lead", {
    p_candidate_id: parsed.data.candidateId,
    p_business_name: parsed.data.businessName,
    p_category: parsed.data.category,
    p_city: parsed.data.city,
    p_region: parsed.data.region,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_address: parsed.data.address,
    p_website_url: parsed.data.websiteUrl,
    p_has_booking: parsed.data.hasBooking,
    p_estimated_value: parsed.data.estimatedValue,
  });
  if (error || !data || Array.isArray(data) || typeof data !== "object") {
    redirect(withMessage(`/search/candidates/${parsed.data.candidateId}`, "error", "Creazione lead non riuscita."));
  }

  const leadId = typeof data.lead_id === "string" ? data.lead_id : null;
  if (!leadId) {
    redirect(withMessage(`/search/candidates/${parsed.data.candidateId}`, "error", "Risposta di conferma non valida."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/search");
  const message = data.status === "duplicate" ? "Il candidato era già presente nel CRM" : "Candidato verificato e aggiunto al CRM";
  redirect(withMessage(`/leads/${leadId}`, "success", message));
}
