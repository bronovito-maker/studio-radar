"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { AiAnalysisError, analyzeWebsiteDomainWithOpenAi } from "@/lib/ai/openai";
import { isLeadStatus } from "@/lib/crm";
import { scoreLead } from "@/lib/scoring/deterministic";
import { combineScores } from "@/lib/scoring/hybrid";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

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

export async function scoreLeadDeterministically(formData: FormData) {
  const idResult = z.uuid().safeParse(value(formData, "leadId"));
  if (!idResult.success) redirect(withMessage("/leads", "error", "Lead non valido"));

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, business_name, region, category, phone, email, website_url, rating, review_count, has_booking")
    .eq("id", idResult.data)
    .single();

  if (leadError || !lead) {
    redirect(withMessage(`/leads/${idResult.data}`, "error", "Dati lead non disponibili"));
  }

  const input = {
    businessName: lead.business_name,
    region: lead.region,
    category: lead.category,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.website_url,
    rating: lead.rating,
    reviewCount: lead.review_count,
    hasBooking: lead.has_booking ? true : undefined,
    businessStatus: null,
  };
  const result = scoreLead(input);
  const { error } = await supabase.rpc("save_deterministic_score", {
    p_lead_id: lead.id,
    p_score: result.score,
    p_grade: result.grade,
    p_reasoning: result.reasoning,
    p_positive_signals: result.positiveSignals,
    p_negative_signals: result.negativeSignals,
    p_confidence: result.confidence,
    p_version: result.version,
    p_input_snapshot: { input, components: result.components } as unknown as Json,
    p_recommended_service_slug: result.recommendedService,
  });

  if (error) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Score non salvato. Riprova."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  redirect(withMessage(`/leads/${lead.id}`, "success", `Score aggiornato: ${result.score}/100`));
}

export async function analyzeLeadWithOpenAi(formData: FormData) {
  const idResult = z.uuid().safeParse(value(formData, "leadId"));
  if (!idResult.success) redirect(withMessage("/leads", "error", "Lead non valido"));

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, business_name, region, category, phone, email, website_url, rating, review_count, has_booking")
    .eq("id", idResult.data)
    .single();

  if (leadError || !lead || !lead.website_url) {
    redirect(withMessage(`/leads/${idResult.data}`, "error", "Serve un sito ufficiale valido per l'analisi OpenAI"));
  }

  const input = {
    businessName: lead.business_name,
    region: lead.region,
    category: lead.category,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.website_url,
    rating: lead.rating,
    reviewCount: lead.review_count,
    hasBooking: lead.has_booking ? true : undefined,
    businessStatus: null,
  };
  const deterministic = scoreLead(input);

  let analysis: Awaited<ReturnType<typeof analyzeWebsiteDomainWithOpenAi>>;
  try {
    analysis = await analyzeWebsiteDomainWithOpenAi({
      businessName: lead.business_name,
      category: lead.category ?? "non indicata",
      websiteUrl: lead.website_url,
    });
  } catch (error) {
    const message = error instanceof AiAnalysisError && error.code === "NOT_CONFIGURED"
      ? "OpenAI non è configurato sul server"
      : error instanceof AiAnalysisError && error.code === "INVALID_OUTPUT"
        ? "Le fonti restituite da OpenAI non hanno superato i controlli"
        : "Analisi OpenAI non riuscita. Riprova tra poco.";
    redirect(withMessage(`/leads/${lead.id}`, "error", message));
  }

  const hybrid = combineScores(deterministic, analysis.assessment);
  const { error } = await supabase.rpc("save_hybrid_score", {
    p_lead_id: lead.id,
    p_score: hybrid.score,
    p_grade: hybrid.grade,
    p_deterministic_score: hybrid.deterministicScore,
    p_ai_score: analysis.assessment.advisoryScore,
    p_reasoning: hybrid.reasoning,
    p_positive_signals: deterministic.positiveSignals,
    p_negative_signals: deterministic.negativeSignals,
    p_confidence: hybrid.confidence,
    p_model: analysis.model,
    p_version: analysis.promptVersion,
    p_input_snapshot: {
      input,
      components: deterministic.components,
      assessment: analysis.assessment,
      ai: {
        domain: analysis.domain,
        responseId: analysis.responseId,
        aiWeight: hybrid.aiWeight,
        hybridVersion: hybrid.version,
      },
    } as unknown as Json,
    p_recommended_service_slug: hybrid.recommendedService,
  });

  if (error) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Analisi completata ma non salvata. Riprova."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  redirect(withMessage(`/leads/${lead.id}`, "success", `Analisi OpenAI completata: ${hybrid.score}/100`));
}
