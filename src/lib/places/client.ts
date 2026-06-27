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
    types: z.array(z.string()),
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
  location: string;
  region: string;
  pageSize: number;
}) {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey) throw new PlacesError("NOT_CONFIGURED", "Chiave Google Places non configurata");

  const body = {
    textQuery: `${input.category} a ${input.location}, ${input.region}, Italia`,
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
