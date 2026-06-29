import "server-only";

import { z } from "zod";

const PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.addressComponents",
  "places.nationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.businessStatus",
  "places.googleMapsUri",
  "places.reservable",
  "places.attributions",
].join(",");
const DETAILS_FIELD_MASK = [
  "id",
  "displayName",
  "formattedAddress",
  "nationalPhoneNumber",
  "websiteUri",
  "primaryTypeDisplayName",
  "businessStatus",
  "googleMapsUri",
  "attributions",
].join(",");

const localizedTextSchema = z.object({ text: z.string(), languageCode: z.string().optional() });
const placeSchema = z.object({
  id: z.string().min(1),
  displayName: localizedTextSchema,
  formattedAddress: z.string().optional(),
  addressComponents: z.array(z.object({
    longText: z.string(),
    shortText: z.string().optional(),
    // Google can omit `types` on individual address components.
    types: z.array(z.string()).default([]),
    languageCode: z.string().optional(),
  })).optional(),
  nationalPhoneNumber: z.string().optional(),
  websiteUri: z.string().url().optional(),
  rating: z.number().min(1).max(5).optional(),
  userRatingCount: z.number().int().min(0).optional(),
  primaryType: z.string().optional(),
  primaryTypeDisplayName: localizedTextSchema.optional(),
  businessStatus: z.enum(["OPERATIONAL", "CLOSED_TEMPORARILY", "CLOSED_PERMANENTLY"]).optional(),
  googleMapsUri: z.string().url().optional(),
  reservable: z.boolean().optional(),
  attributions: z.array(z.object({ provider: z.string().optional(), providerUri: z.string().url().optional() })).optional(),
});

const responseSchema = z.object({ places: z.array(placeSchema).default([]) });

export type GooglePlace = z.infer<typeof placeSchema>;

export class PlacesError extends Error {
  constructor(
    public readonly code: "NOT_CONFIGURED" | "QUOTA" | "REQUEST_FAILED" | "INVALID_RESPONSE",
    message: string,
  ) {
    super(message);
    this.name = "PlacesError";
  }
}

export function isPlacesConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
}

async function requestPlaces(body: Record<string, unknown>, apiKey: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);

  try {
    return await fetch(PLACES_SEARCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    throw new PlacesError("REQUEST_FAILED", error instanceof Error && error.name === "AbortError" ? "Timeout Google Places" : "Google Places non raggiungibile");
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchGooglePlaces(input: {
  category: string;
  location?: string | null;
  region?: string | null;
  pageSize: number;
}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) throw new PlacesError("NOT_CONFIGURED", "Chiave Google Places non configurata");

  // Build dynamic query: supports city-only, region-only, or both.
  const loc = (input.location ?? "").trim();
  const reg = (input.region ?? "").trim();
  let textQuery: string;
  if (loc && reg) {
    textQuery = `${input.category} a ${loc}, ${reg}, Italia`;
  } else if (loc) {
    textQuery = `${input.category} a ${loc}, Italia`;
  } else if (reg) {
    textQuery = `${input.category} in ${reg}, Italia`;
  } else {
    textQuery = `${input.category} in Italia`;
  }

  const body = {
    textQuery,
    languageCode: "it",
    regionCode: "IT",
    pageSize: input.pageSize,
  };

  let response = await requestPlaces(body, apiKey);
  if (response.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await requestPlaces(body, apiKey);
  }

  if (response.status === 429) throw new PlacesError("QUOTA", "Quota Google Places temporaneamente esaurita");
  if (!response.ok) throw new PlacesError("REQUEST_FAILED", `Google Places HTTP ${response.status}`);

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success) throw new PlacesError("INVALID_RESPONSE", "Risposta Google Places non valida");
  return parsed.data.places;
}

/** Batch search: makes multiple queries to collect up to targetCount unique Place IDs.
 *  Google Places Text Search caps at 20 results per call, so we vary the query
 *  formulation with sub-area modifiers to gather more candidates. */
export async function searchGooglePlacesBatch(input: {
  category: string;
  location?: string | null;
  region?: string | null;
  targetCount: number;
}) {
  const perQuery = 20; // Google max pageSize for text search
  const maxQueries = Math.ceil(input.targetCount / perQuery);

  const loc = (input.location ?? "").trim();
  const reg = (input.region ?? "").trim();

  // Base query with whatever is provided.
  let baseQuery: string;
  if (loc && reg) baseQuery = `${input.category} a ${loc}, ${reg}, Italia`;
  else if (loc) baseQuery = `${input.category} a ${loc}, Italia`;
  else if (reg) baseQuery = `${input.category} in ${reg}, Italia`;
  else baseQuery = `${input.category} in Italia`;

  const queryModifiers = loc
    ? [
        "",                              // base query
        `centro ${loc}`,                 // city center
        `zona ${loc}`,                   // zone area
        `${loc} provincia`,             // province
        `vicino ${loc}`,                // near location
      ]
    : reg
      ? ["", `capoluoghi ${reg}`, `provincia ${reg}`]
      : ["", "principali città", "capoluoghi di regione"];

  const seen = new Set<string>();
  const allPlaces: GooglePlace[] = [];

  for (let i = 0; i < maxQueries && i < queryModifiers.length; i++) {
    const modifier = queryModifiers[i];
    let textQuery: string;
    if (modifier && loc) {
      // Modifier already includes the location (e.g., "centro Bologna").
      textQuery = reg
        ? `${input.category} ${modifier}, ${reg}, Italia`
        : `${input.category} ${modifier}, Italia`;
    } else if (modifier) {
      textQuery = `${input.category} ${modifier}, Italia`;
    } else {
      textQuery = baseQuery;
    }

    const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
    if (!apiKey) throw new PlacesError("NOT_CONFIGURED", "Chiave Google Places non configurata");

    const body = { textQuery, languageCode: "it", regionCode: "IT", pageSize: perQuery };

    let response = await requestPlaces(body, apiKey);
    if (response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      response = await requestPlaces(body, apiKey);
    }

    if (response.status === 429) {
      if (allPlaces.length > 0) break; // quota exhausted, return what we have
      throw new PlacesError("QUOTA", "Quota Google Places temporaneamente esaurita");
    }
    if (!response.ok) {
      if (allPlaces.length > 0) break;
      throw new PlacesError("REQUEST_FAILED", `Google Places HTTP ${response.status}`);
    }

    const parsed = responseSchema.safeParse(await response.json());
    if (!parsed.success) {
      if (allPlaces.length > 0) break;
      throw new PlacesError("INVALID_RESPONSE", "Risposta Google Places non valida");
    }

    for (const place of parsed.data.places) {
      if (!seen.has(place.id)) {
        seen.add(place.id);
        allPlaces.push(place);
      }
    }

    if (allPlaces.length >= input.targetCount) break;

    // Small delay between queries to avoid hammering the API
    if (i < maxQueries - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return allPlaces.slice(0, input.targetCount);
}

export async function getGooglePlaceSummary(placeId: string) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) throw new PlacesError("NOT_CONFIGURED", "Chiave Google Places non configurata");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const url = new URL(`${PLACES_SEARCH_URL.replace(":searchText", "")}/${encodeURIComponent(placeId)}`);
    url.searchParams.set("languageCode", "it");
    url.searchParams.set("regionCode", "IT");
    const response = await fetch(url, {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": DETAILS_FIELD_MASK,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 404) return null;
    if (response.status === 429) throw new PlacesError("QUOTA", "Quota Google Places temporaneamente esaurita");
    if (!response.ok) throw new PlacesError("REQUEST_FAILED", `Google Places HTTP ${response.status}`);

    const parsed = placeSchema.safeParse(await response.json());
    if (!parsed.success) throw new PlacesError("INVALID_RESPONSE", "Risposta Google Places non valida");
    return parsed.data;
  } catch (error) {
    if (error instanceof PlacesError) throw error;
    throw new PlacesError("REQUEST_FAILED", error instanceof Error && error.name === "AbortError" ? "Timeout Google Places" : "Google Places non raggiungibile");
  } finally {
    clearTimeout(timeout);
  }
}
