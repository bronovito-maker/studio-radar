"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isLeadStatus } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";

const optionalText = z.string().trim().max(300).transform((value) => value || null);

const createLeadSchema = z.object({
  businessName: z.string().trim().min(2, "Inserisci almeno 2 caratteri").max(160),
  city: optionalText,
  region: optionalText,
  category: optionalText,
  phone: z.string().trim().max(40).transform((value) => value || null),
  email: z.string().trim().max(254).refine((value) => !value || z.email().safeParse(value).success, "Email non valida").transform((value) => value || null),
  websiteUrl: z.string().trim().max(500).refine((value) => !value || z.url().safeParse(value).success, "URL non valido").transform((value) => value || null),
  estimatedValue: z.coerce.number().min(0).max(10_000_000),
});

function value(formData: FormData, key: string) {
  const candidate = formData.get(key);
  return typeof candidate === "string" ? candidate : "";
}

function withMessage(path: string, type: "error" | "success", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${type}=${encodeURIComponent(message)}`;
}

export async function createLead(formData: FormData) {
  const parsed = createLeadSchema.safeParse({
    businessName: value(formData, "businessName"),
    city: value(formData, "city"),
    region: value(formData, "region"),
    category: value(formData, "category"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    websiteUrl: value(formData, "websiteUrl"),
    estimatedValue: value(formData, "estimatedValue") || "0",
  });

  if (!parsed.success) {
    redirect(withMessage("/leads/new", "error", parsed.error.issues[0]?.message ?? "Dati non validi"));
  }

  const supabase = await createClient();
  const { data: leadId, error } = await supabase.rpc("create_manual_lead", {
    p_business_name: parsed.data.businessName,
    p_city: parsed.data.city,
    p_region: parsed.data.region,
    p_category: parsed.data.category,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_website_url: parsed.data.websiteUrl,
    p_estimated_value: parsed.data.estimatedValue,
  });

  if (error || !leadId) {
    redirect(withMessage("/leads/new", "error", "Creazione non riuscita. Verifica i dati e riprova."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  redirect(withMessage(`/leads/${leadId}`, "success", "Lead creato correttamente"));
}

export async function updateLeadStatus(formData: FormData) {
  const leadId = value(formData, "leadId");
  const status = value(formData, "status");
  const idResult = z.uuid().safeParse(leadId);

  if (!idResult.success || !isLeadStatus(status)) {
    redirect(withMessage("/leads", "error", "Richiesta non valida"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_lead_status", {
    p_lead_id: idResult.data,
    p_status: status,
  });

  if (error) {
    redirect(withMessage(`/leads/${idResult.data}`, "error", "Stato non aggiornato. Riprova."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${idResult.data}`);
  redirect(withMessage(`/leads/${idResult.data}`, "success", "Stato aggiornato"));
}

export async function updateLeadNotes(formData: FormData) {
  const idResult = z.uuid().safeParse(value(formData, "leadId"));
  const notesResult = z.string().trim().max(10_000).safeParse(value(formData, "notes"));

  if (!idResult.success || !notesResult.success) {
    redirect(withMessage("/leads", "error", "Nota non valida"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_lead_notes", {
    p_lead_id: idResult.data,
    p_notes: notesResult.data,
  });

  if (error) {
    redirect(withMessage(`/leads/${idResult.data}`, "error", "Nota non salvata. Riprova."));
  }

  revalidatePath(`/leads/${idResult.data}`);
  redirect(withMessage(`/leads/${idResult.data}`, "success", "Nota salvata"));
}
