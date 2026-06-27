"use server";

import { parse } from "csv-parse/sync";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import {
  dedupeKeys,
  IMPORT_FIELDS,
  type ImportMapping,
  normalizeImportRow,
  type RawImportRow,
} from "@/lib/lead-import";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

const MAX_FILE_SIZE = 2 * 1024 * 1024;
const MAX_ROWS = 500;
const MAX_COLUMNS = 50;

const rawRowsSchema = z.array(
  z.object({
    rowNumber: z.number().int().min(2),
    values: z.record(z.string(), z.string()),
  }),
);

function withMessage(path: string, type: "error" | "success", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${type}=${encodeURIComponent(message)}`;
}

function formValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function uploadCsv(formData: FormData) {
  const viewer = await requireViewer();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    redirect(withMessage("/import", "error", "Seleziona un file CSV"));
  }
  if (file.size > MAX_FILE_SIZE) {
    redirect(withMessage("/import", "error", "Il file supera il limite di 2 MB"));
  }
  if (!file.name.toLowerCase().endsWith(".csv")) {
    redirect(withMessage("/import", "error", "Il file deve avere estensione .csv"));
  }

  let records: string[][];
  try {
    records = parse(await file.text(), {
      bom: true,
      delimiter: [",", ";", "\t"],
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
      max_record_size: 100_000,
    }) as string[][];
  } catch {
    redirect(withMessage("/import", "error", "CSV non leggibile: controlla delimitatori, virgolette e numero di colonne"));
  }

  if (records.length < 2) {
    redirect(withMessage("/import", "error", "Il CSV deve contenere intestazioni e almeno una riga"));
  }
  if (records.length - 1 > MAX_ROWS) {
    redirect(withMessage("/import", "error", `Massimo ${MAX_ROWS} righe per import`));
  }

  const headers = records[0].map((header) => header.trim());
  if (headers.length > MAX_COLUMNS || headers.some((header) => !header)) {
    redirect(withMessage("/import", "error", "Le intestazioni devono essere compilate e non superare 50 colonne"));
  }
  if (new Set(headers.map((header) => header.toLowerCase())).size !== headers.length) {
    redirect(withMessage("/import", "error", "Le intestazioni del CSV devono essere univoche"));
  }

  const rawRows: RawImportRow[] = records.slice(1).map((record, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, record[column] ?? ""])),
  }));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_imports")
    .insert({
      filename: file.name.slice(0, 255),
      headers,
      raw_rows: rawRows as unknown as Json,
      total_count: rawRows.length,
      created_by: viewer.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(withMessage("/import", "error", "Upload non riuscito. Riprova."));
  }

  revalidatePath("/import");
  redirect(`/import/${data.id}`);
}

export async function previewImport(formData: FormData) {
  await requireViewer();
  const importId = z.uuid().safeParse(formValue(formData, "importId"));
  if (!importId.success) redirect(withMessage("/import", "error", "Import non valido"));

  const supabase = await createClient();
  const { data: importBatch, error } = await supabase
    .from("lead_imports")
    .select("id, status, headers, raw_rows")
    .eq("id", importId.data)
    .single();

  if (error || !importBatch || importBatch.status === "completed") {
    redirect(withMessage("/import", "error", "Import non disponibile"));
  }

  const mapping = Object.fromEntries(
    IMPORT_FIELDS.map((field) => [field.key, formValue(formData, field.key)]),
  ) as ImportMapping;
  const selectedHeaders = Object.values(mapping).filter(Boolean);
  if (!mapping.businessName || !importBatch.headers.includes(mapping.businessName)) {
    redirect(withMessage(`/import/${importId.data}`, "error", "Associa la colonna Nome attività"));
  }
  if (selectedHeaders.some((header) => !importBatch.headers.includes(header))) {
    redirect(withMessage(`/import/${importId.data}`, "error", "La mappatura contiene colonne non valide"));
  }
  if (new Set(selectedHeaders).size !== selectedHeaders.length) {
    redirect(withMessage(`/import/${importId.data}`, "error", "Ogni colonna può essere associata una sola volta"));
  }

  const parsedRows = rawRowsSchema.safeParse(importBatch.raw_rows);
  if (!parsedRows.success) {
    redirect(withMessage(`/import/${importId.data}`, "error", "Le righe caricate non sono più leggibili"));
  }

  const previewRows = parsedRows.data.map((row) => normalizeImportRow(row, mapping));
  const seen = new Map<string, number>();
  for (const row of previewRows) {
    if (row.state !== "valid") continue;
    const duplicateKey = dedupeKeys(row).find((key) => seen.has(key));
    if (duplicateKey) {
      row.state = "duplicate";
      row.errors.push(`Duplicato nel file: coincide con la riga ${seen.get(duplicateKey)}`);
      continue;
    }
    dedupeKeys(row).forEach((key) => seen.set(key, row.rowNumber));
  }

  const validRows = previewRows.filter((row) => row.state === "valid");
  const queries = [
    ...chunk([...new Set(validRows.flatMap((row) => row.emailNormalized ? [row.emailNormalized] : []))], 100)
      .map((values) => supabase.from("leads").select("id, email_normalized, phone_normalized, website_normalized, business_city_normalized").in("email_normalized", values)),
    ...chunk([...new Set(validRows.flatMap((row) => row.phoneNormalized ? [row.phoneNormalized] : []))], 100)
      .map((values) => supabase.from("leads").select("id, email_normalized, phone_normalized, website_normalized, business_city_normalized").in("phone_normalized", values)),
    ...chunk([...new Set(validRows.flatMap((row) => row.websiteNormalized ? [row.websiteNormalized] : []))], 100)
      .map((values) => supabase.from("leads").select("id, email_normalized, phone_normalized, website_normalized, business_city_normalized").in("website_normalized", values)),
    ...chunk([...new Set(validRows.map((row) => row.businessCityNormalized))], 100)
      .map((values) => supabase.from("leads").select("id, email_normalized, phone_normalized, website_normalized, business_city_normalized").in("business_city_normalized", values)),
  ];
  const results = await Promise.all(queries);
  if (results.some((result) => result.error)) {
    redirect(withMessage(`/import/${importId.data}`, "error", "Controllo duplicati non riuscito. Riprova."));
  }

  const existingKeys = new Map<string, string>();
  results.flatMap((result) => result.data ?? []).forEach((lead) => {
    if (lead.email_normalized) existingKeys.set(`email:${lead.email_normalized}`, lead.id);
    if (lead.phone_normalized) existingKeys.set(`phone:${lead.phone_normalized}`, lead.id);
    if (lead.website_normalized) existingKeys.set(`website:${lead.website_normalized}`, lead.id);
    if (lead.business_city_normalized) existingKeys.set(`business:${lead.business_city_normalized}`, lead.id);
  });

  for (const row of previewRows) {
    if (row.state !== "valid") continue;
    const key = dedupeKeys(row).find((candidate) => existingKeys.has(candidate));
    if (key) {
      row.state = "duplicate";
      row.duplicateLeadId = existingKeys.get(key) ?? null;
      row.errors.push("Lead già presente nel CRM");
    }
  }

  const counts = previewRows.reduce(
    (summary, row) => ({ ...summary, [row.state]: summary[row.state] + 1 }),
    { valid: 0, duplicate: 0, invalid: 0 },
  );
  const { error: updateError } = await supabase
    .from("lead_imports")
    .update({
      status: "previewed",
      mapping: mapping as unknown as Json,
      preview_rows: previewRows as unknown as Json,
      valid_count: counts.valid,
      duplicate_count: counts.duplicate,
      invalid_count: counts.invalid,
    })
    .eq("id", importId.data);

  if (updateError) {
    redirect(withMessage(`/import/${importId.data}`, "error", "Anteprima non salvata. Riprova."));
  }

  revalidatePath(`/import/${importId.data}`);
  redirect(withMessage(`/import/${importId.data}`, "success", "Anteprima aggiornata"));
}

export async function confirmImport(formData: FormData) {
  await requireViewer();
  const importId = z.uuid().safeParse(formValue(formData, "importId"));
  if (!importId.success) redirect(withMessage("/import", "error", "Import non valido"));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("confirm_lead_import", { p_import_id: importId.data });
  if (error || !data) {
    redirect(withMessage(`/import/${importId.data}`, "error", "Conferma non riuscita. Aggiorna l'anteprima e riprova."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/import");
  revalidatePath(`/import/${importId.data}`);
  redirect(withMessage(`/import/${importId.data}`, "success", "Import completato"));
}
