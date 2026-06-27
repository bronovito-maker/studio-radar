"use server";

import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { findExistingLeadKeys } from "@/lib/leads/deduplication";
import {
  normalizeBusinessCityKey,
  normalizePhoneKey,
  normalizeWebsite,
} from "@/lib/leads/normalization";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import { isPlacesConfigured, PlacesError, searchGooglePlaces, type GooglePlace } from "@/lib/places/client";
import { scoreLead, type DeterministicScoreResult } from "@/lib/scoring/deterministic";
import { createClient } from "@/lib/supabase/server";

const searchSchema = z.object({
  category: z.enum(DISCOVERY_CATEGORIES),
  location: z.string().trim().min(2).max(100),
  region: z.enum(["Emilia-Romagna", "Toscana", "Lombardia"]),
  pageSize: z.coerce.number().int().min(5).max(20),
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
};

export type DiscoverySearchState = {
  status: "idle" | "success" | "error";
  message?: string;
  results: DiscoveryResult[];
  query?: { category: string; location: string; region: string };
};

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
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

  const supabase = await createClient();
  const query = {
    category: parsed.data.category,
    location: parsed.data.location,
    region: parsed.data.region,
  };
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
    const [placeDuplicateResponse, existingKeys] = await Promise.all([
      supabase.from("leads").select("id, google_place_id").in("google_place_id", places.map((place) => place.id)),
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
    if (placeDuplicateResponse.error) throw new Error("PLACE_DEDUPE_QUERY_FAILED");
    const placeDuplicates = placeDuplicateResponse.data;
    const duplicatesByPlace = new Map(placeDuplicates?.map((lead) => [lead.google_place_id, lead.id]) ?? []);

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
      };
    });

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
