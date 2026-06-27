import { z } from "zod";
import { dedupeKeys } from "@/lib/leads/deduplication";
import {
  compactText,
  normalizeBusinessCityKey,
  normalizeEmailKey,
  normalizePhoneKey,
  normalizeWebsite,
} from "@/lib/leads/normalization";

export const IMPORT_FIELDS = [
  { key: "businessName", label: "Nome attività", required: true },
  { key: "city", label: "Città", required: false },
  { key: "region", label: "Regione", required: false },
  { key: "category", label: "Categoria", required: false },
  { key: "phone", label: "Telefono", required: false },
  { key: "email", label: "Email", required: false },
  { key: "websiteUrl", label: "Sito web", required: false },
  { key: "estimatedValue", label: "Valore stimato", required: false },
] as const;

export type ImportField = (typeof IMPORT_FIELDS)[number]["key"];
export type ImportMapping = Record<ImportField, string>;
export type RawImportRow = { rowNumber: number; values: Record<string, string> };
export type PreviewState = "valid" | "duplicate" | "invalid";

export type ImportPreviewRow = {
  rowNumber: number;
  state: PreviewState;
  errors: string[];
  duplicateLeadId: string | null;
  businessName: string;
  city: string;
  region: string;
  category: string;
  phone: string;
  email: string;
  websiteUrl: string;
  estimatedValue: number;
  emailNormalized: string | null;
  phoneNormalized: string | null;
  websiteNormalized: string | null;
  businessCityNormalized: string;
};

function parseEstimatedValue(value: string) {
  const compactValue = value.replace(/[€\s]/g, "");
  if (!compactValue) return { value: 0, valid: true };

  const normalized = compactValue.includes(",")
    ? compactValue.replace(/\./g, "").replace(",", ".")
    : compactValue;
  const number = Number(normalized);
  return {
    value: number,
    valid: Number.isFinite(number) && number >= 0 && number <= 10_000_000,
  };
}

export function normalizeImportRow(raw: RawImportRow, mapping: ImportMapping): ImportPreviewRow {
  const get = (field: ImportField) => compactText(raw.values[mapping[field]] ?? "");
  const businessName = get("businessName");
  const city = get("city");
  const region = get("region");
  const category = get("category");
  const phone = get("phone");
  const email = get("email");
  const website = normalizeWebsite(get("websiteUrl"));
  const estimated = parseEstimatedValue(get("estimatedValue"));
  const errors: string[] = [];

  if (businessName.length < 2) errors.push("Nome attività mancante o troppo breve");
  if (businessName.length > 160) errors.push("Nome attività oltre 160 caratteri");
  if (city.length > 300 || region.length > 300 || category.length > 300) {
    errors.push("Località o categoria troppo lunga");
  }
  if (phone.length > 40) errors.push("Telefono oltre 40 caratteri");
  if (email && !z.email().safeParse(email).success) errors.push("Email non valida");
  if (!website.valid) errors.push("Sito web non valido");
  if (!estimated.valid) errors.push("Valore stimato non valido");

  return {
    rowNumber: raw.rowNumber,
    state: errors.length ? "invalid" : "valid",
    errors,
    duplicateLeadId: null,
    businessName,
    city,
    region,
    category,
    phone,
    email,
    websiteUrl: website.display,
    estimatedValue: estimated.valid ? estimated.value : 0,
    emailNormalized: normalizeEmailKey(email),
    phoneNormalized: normalizePhoneKey(phone),
    websiteNormalized: website.key,
    businessCityNormalized: normalizeBusinessCityKey(businessName, city),
  };
}

export { dedupeKeys };
