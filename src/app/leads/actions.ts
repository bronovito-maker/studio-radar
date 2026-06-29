"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { websiteAssessmentSchema } from "@/lib/ai/contracts";
import { AiAnalysisError, analyzeWebsiteDomainWithOpenAi, generateOutreachDraftWithOpenAi } from "@/lib/ai/openai";
import { requireAdmin, requireViewer } from "@/lib/auth";
import { BrevoError, sendBrevoEmail } from "@/lib/brevo";
import { isLeadStatus } from "@/lib/crm";
import { followUpBodies, withOptOut } from "@/lib/email-outreach";
import { scoreLead } from "@/lib/scoring/deterministic";
import { isScoreSnapshotCurrent } from "@/lib/scoring/snapshot";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapWithConcurrency, scoutWebsite } from "@/lib/web-scout";
import { searchGooglePlacesBatch, PlacesError } from "@/lib/places/client";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import type { Json } from "@/types/database";

const optionalText = z.string().trim().max(300).transform((value) => value || null);
const optionalAddress = z.string().trim().max(300).transform((value) => value || null);
const optionalPhone = z.string().trim().max(40).transform((value) => value || null);
const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .refine((value) => !value || z.email().safeParse(value).success, "Email non valida")
  .transform((value) => value || null);
const optionalWebsite = z
  .string()
  .trim()
  .max(500)
  .refine((value) => !value || z.url().safeParse(value).success, "URL non valido")
  .transform((value) => value || null);

const createLeadSchema = z.object({
  businessName: z.string().trim().min(2, "Inserisci almeno 2 caratteri").max(160),
  city: optionalText,
  region: optionalText,
  category: optionalText,
  phone: optionalPhone,
  email: optionalEmail,
  websiteUrl: optionalWebsite,
  estimatedValue: z.coerce.number().min(0).max(10_000_000),
});

const leadDetailsSchema = z.object({
  leadId: z.uuid(),
  businessName: z.string().trim().min(2, "Inserisci almeno 2 caratteri").max(160),
  city: optionalText,
  region: optionalText,
  category: optionalText,
  address: optionalAddress,
  phone: optionalPhone,
  email: optionalEmail,
  websiteUrl: optionalWebsite,
  estimatedValue: z.coerce.number().min(0).max(10_000_000),
});

export type OutreachDraftState = {
  status: "idle" | "ready" | "error";
  message?: string;
  provider?: "openai" | "template";
  confidence?: number;
  cautions?: string[];
};

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

export async function updateLeadDetailsAction(formData: FormData) {
  const parsed = leadDetailsSchema.safeParse({
    leadId: value(formData, "leadId"),
    businessName: value(formData, "businessName"),
    city: value(formData, "city"),
    region: value(formData, "region"),
    category: value(formData, "category"),
    address: value(formData, "address"),
    phone: value(formData, "phone"),
    email: value(formData, "email"),
    websiteUrl: value(formData, "websiteUrl"),
    estimatedValue: value(formData, "estimatedValue") || "0",
  });

  if (!parsed.success) {
    const leadId = value(formData, "leadId");
    redirect(withMessage(leadId ? `/leads/${leadId}` : "/leads", "error", parsed.error.issues[0]?.message ?? "Dati non validi"));
  }

  const supabase = await createClient();
  const { data: current, error: readError } = await supabase
    .from("leads")
    .select("business_name, city, region, category, address, phone, email, website_url, estimated_value")
    .eq("id", parsed.data.leadId)
    .single();

  if (readError || !current) {
    redirect(withMessage(`/leads/${parsed.data.leadId}`, "error", "Lead non trovato"));
  }

  const nextValues = {
    business_name: parsed.data.businessName,
    city: parsed.data.city,
    region: parsed.data.region,
    category: parsed.data.category,
    address: parsed.data.address,
    phone: parsed.data.phone,
    email: parsed.data.email,
    website_url: parsed.data.websiteUrl,
    estimated_value: parsed.data.estimatedValue,
  };

  const isUnchanged = current.business_name === nextValues.business_name
    && current.city === nextValues.city
    && current.region === nextValues.region
    && current.category === nextValues.category
    && current.address === nextValues.address
    && current.phone === nextValues.phone
    && current.email === nextValues.email
    && current.website_url === nextValues.website_url
    && current.estimated_value === nextValues.estimated_value;

  if (isUnchanged) {
    redirect(withMessage(`/leads/${parsed.data.leadId}`, "success", "Dati già aggiornati"));
  }

  const { error } = await supabase.rpc("update_lead_details", {
    p_lead_id: parsed.data.leadId,
    p_business_name: parsed.data.businessName,
    p_city: parsed.data.city,
    p_region: parsed.data.region,
    p_category: parsed.data.category,
    p_address: parsed.data.address,
    p_phone: parsed.data.phone,
    p_email: parsed.data.email,
    p_website_url: parsed.data.websiteUrl,
    p_estimated_value: parsed.data.estimatedValue,
  });

  if (error) {
    const message = error.code === "23505"
      ? "Esiste già un lead con gli stessi dati identificativi."
      : "Dati non aggiornati. Riprova.";
    redirect(withMessage(`/leads/${parsed.data.leadId}`, "error", message));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${parsed.data.leadId}`);
  redirect(withMessage(`/leads/${parsed.data.leadId}`, "success", "Dati aggiornati"));
}

export async function assignLeadAction(formData: FormData) {
  await requireAdmin();
  const parsed = z.object({
    leadId: z.uuid(),
    assignedTo: z.union([z.uuid(), z.literal("")]),
  }).safeParse({
    leadId: value(formData, "leadId"),
    assignedTo: value(formData, "assignedTo"),
  });

  if (!parsed.success) redirect(withMessage("/leads", "error", "Assegnazione non valida"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_lead", {
    p_lead_id: parsed.data.leadId,
    p_assigned_to: parsed.data.assignedTo || null,
  });
  if (error) {
    redirect(withMessage(`/leads/${parsed.data.leadId}`, "error", "Collaboratore non assegnato. Riprova."));
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${parsed.data.leadId}`);
  redirect(withMessage(`/leads/${parsed.data.leadId}`, "success", parsed.data.assignedTo ? "Lead assegnato" : "Assegnazione rimossa"));
}

export async function scoreLeadDeterministically(formData: FormData) {
  const idResult = z.uuid().safeParse(value(formData, "leadId"));
  if (!idResult.success) redirect(withMessage("/leads", "error", "Lead non valido"));

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, business_name, region, category, phone, email, website_url, rating, review_count, has_booking, source, google_place_id")
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
    source: lead.source,
    googlePlaceId: lead.google_place_id,
  };
  const result = scoreLead(input);
  const { error } = await supabase.rpc("save_deterministic_score", {
    p_lead_id: lead.id,
    p_score: result.score,
    p_grade: result.grade,
    p_reasoning: result.reasoning,
    p_positive_signals: result.positiveSignals,
    p_negative_signals: result.negativeSignals,
    p_confidence: result.confidence / 100,
    p_version: result.version,
    p_input_snapshot: { input, scoringV2: result } as unknown as Json,
    p_recommended_service_slug: result.recommendedService ?? "",
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
    .select("id, business_name, region, category, phone, email, website_url, rating, review_count, has_booking, source, google_place_id")
    .eq("id", idResult.data)
    .single();

  if (leadError || !lead || !lead.website_url) {
    redirect(withMessage(`/leads/${idResult.data}`, "error", "Serve un sito ufficiale valido per l'analisi OpenAI"));
  }
  if (!await consumeRateLimit(supabase, "lead_ai_analysis")) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Limite analisi OpenAI raggiunto. Riprova più tardi."));
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
    source: lead.source,
    googlePlaceId: lead.google_place_id,
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

  const { error } = await supabase.rpc("save_deterministic_score", {
    p_lead_id: lead.id,
    p_score: deterministic.opportunityScore,
    p_grade: deterministic.grade,
    p_reasoning: `${deterministic.reasoning} ${analysis.assessment.summary}`,
    p_positive_signals: deterministic.positiveSignals,
    p_negative_signals: deterministic.negativeSignals,
    p_confidence: deterministic.confidence / 100,
    p_version: deterministic.version,
    p_input_snapshot: {
      input,
      scoringV2: deterministic,
      assessment: analysis.assessment,
      ai: {
        domain: analysis.domain,
        responseId: analysis.responseId,
        model: analysis.model,
        promptVersion: analysis.promptVersion,
      },
    } as unknown as Json,
    p_recommended_service_slug: deterministic.recommendedService ?? "",
  });

  if (error) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Analisi completata ma non salvata. Riprova."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${lead.id}`);
  redirect(withMessage(`/leads/${lead.id}`, "success", `Interpretazione OpenAI completata. Opportunity invariata: ${deterministic.opportunityScore}/100`));
}

export async function generateOutreachDraftAction(
  _previousState: OutreachDraftState,
  formData: FormData,
): Promise<OutreachDraftState> {
  await requireViewer();
  const idResult = z.uuid().safeParse(value(formData, "leadId"));
  if (!idResult.success) return { status: "error", message: "Lead non valido." };

  const supabase = await createClient();
  const [{ data: lead }, { data: latestScore }, { data: settings }] = await Promise.all([
    supabase.from("leads").select("id, business_name, category, city, region, phone, email, website_url, rating, review_count, has_booking, recommended_service_id").eq("id", idResult.data).single(),
    supabase.from("lead_scores").select("input_snapshot, recommended_service_id").eq("lead_id", idResult.data).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("settings").select("booking_url").eq("id", 1).single(),
  ]);
  if (!lead) return { status: "error", message: "Lead non disponibile." };
  if (!await consumeRateLimit(supabase, "outreach_draft")) {
    return { status: "error", message: "Limite bozze raggiunto. Riprova più tardi." };
  }

  const currentScore = latestScore && isScoreSnapshotCurrent(latestScore.input_snapshot, lead) ? latestScore : null;
  const serviceId = currentScore?.recommended_service_id ?? (!latestScore ? lead.recommended_service_id : null);
  const { data: service } = serviceId
    ? await supabase.from("services").select("name").eq("id", serviceId).maybeSingle()
    : { data: null };
  const snapshot = currentScore?.input_snapshot;
  const assessmentValue = snapshot && !Array.isArray(snapshot) && typeof snapshot === "object"
    ? snapshot.assessment
    : null;
  const assessment = websiteAssessmentSchema.safeParse(assessmentValue);
  const evidence = assessment.success ? assessment.data : null;
  const recommendedService = service?.name ?? "miglioramento della presenza digitale";
  const fallback = `Buongiorno, ho osservato la presenza digitale di ${lead.business_name} e credo possa esserci spazio per rendere più efficace il percorso online. In Studio Radar lavoriamo su ${recommendedService.toLowerCase()} con un approccio concreto e misurabile. Mi farebbe piacere condividere due spunti mirati: può avere senso un breve confronto?`;

  let draft = fallback;
  let provider: "openai" | "template" = "template";
  let confidence = 0.45;
  let cautions: string[] = evidence ? [] : ["Bozza basata sui soli dati anagrafici del lead"];
  try {
    const result = await generateOutreachDraftWithOpenAi({
      businessName: lead.business_name,
      category: lead.category ?? "non indicata",
      city: lead.city ?? "non indicata",
      recommendedService,
      evidenceSummary: evidence?.summary ?? "Nessuna analisi del sito ancora disponibile",
      opportunities: evidence?.opportunities.map((opportunity) => `${opportunity.evidence} — ${opportunity.rationale}`) ?? [],
      outreachAngle: evidence?.outreachAngle ?? "Proporre un confronto esplorativo senza affermazioni non verificate",
    });
    draft = result.draft.message;
    provider = "openai";
    confidence = result.draft.confidence;
    cautions = result.draft.cautions;
  } catch {
    // The deterministic template keeps outreach available when the provider is unavailable.
  }

  if (settings?.booking_url) {
    draft = `${draft}\n\nSe preferisce, può scegliere qui un momento comodo: ${settings.booking_url}`;
  }
  return { status: "ready", message: draft, provider, confidence, cautions };
}

export async function recordManualOutreachAction(formData: FormData) {
  await requireViewer();
  const parsed = z.object({
    leadId: z.uuid(),
    message: z.string().trim().min(10).max(2000),
  }).safeParse({
    leadId: value(formData, "leadId"),
    message: value(formData, "message"),
  });
  if (!parsed.success) redirect(withMessage("/leads", "error", "Messaggio outreach non valido"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_manual_outreach", {
    p_lead_id: parsed.data.leadId,
    p_channel: "whatsapp",
    p_message: parsed.data.message,
  });
  if (error) {
    redirect(withMessage(`/leads/${parsed.data.leadId}`, "error", "Contatto non registrato. Verifica lo stato del lead."));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/outreach");
  revalidatePath(`/leads/${parsed.data.leadId}`);
  redirect(withMessage(`/leads/${parsed.data.leadId}`, "success", "Contatto WhatsApp registrato"));
}

export async function sendLeadEmailAction(formData: FormData) {
  const viewer = await requireViewer();
  const parsed = z.object({
    leadId: z.uuid(),
    subject: z.string().trim().min(2).max(200),
    message: z.string().trim().min(20).max(9000),
  }).safeParse({
    leadId: value(formData, "leadId"),
    subject: value(formData, "subject"),
    message: value(formData, "message"),
  });
  if (!parsed.success) redirect(withMessage("/leads", "error", parsed.error.issues[0]?.message ?? "Email non valida"));

  const supabase = await createClient();
  const [{ data: lead }, { data: settings }] = await Promise.all([
    supabase.from("leads").select("id, business_name, email, status, email_suppressed_at").eq("id", parsed.data.leadId).single(),
    supabase.from("settings").select("email_enabled, email_sender_name, email_sender_email, email_reply_to, email_daily_limit").eq("id", 1).single(),
  ]);
  if (!lead?.email) redirect(withMessage(`/leads/${parsed.data.leadId}`, "error", "Il lead non ha un indirizzo email valido"));
  if (lead.email_suppressed_at || ["booked", "client", "discarded"].includes(lead.status)) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Questo lead non è contattabile via email"));
  }
  if (!settings?.email_enabled || !settings.email_sender_email) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Configura e abilita Brevo nelle Impostazioni prima dell'invio"));
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await supabase.from("email_messages")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", startOfDay.toISOString());
  if ((count ?? 0) >= settings.email_daily_limit) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Limite email giornaliero raggiunto"));
  }

  const body = withOptOut(parsed.data.message);
  const { data: emailMessage, error: createError } = await supabase.from("email_messages").insert({
    lead_id: lead.id,
    recipient_email: lead.email,
    recipient_name: lead.business_name,
    subject: parsed.data.subject,
    body,
    status: "sending",
    created_by: viewer.id,
  }).select("id").single();
  if (createError || !emailMessage) {
    redirect(withMessage(`/leads/${lead.id}`, "error", "Email non preparata. Riprova."));
  }

  let providerMessageId: string;
  try {
    const result = await sendBrevoEmail({
      id: emailMessage.id,
      toEmail: lead.email,
      toName: lead.business_name,
      senderEmail: settings.email_sender_email,
      senderName: settings.email_sender_name,
      replyTo: settings.email_reply_to,
      subject: parsed.data.subject,
      body,
    });
    providerMessageId = result.messageId;
  } catch (error) {
    const code = error instanceof BrevoError ? error.code : "SEND_FAILED";
    await supabase.from("email_messages").update({
      status: "failed",
      failed_at: new Date().toISOString(),
      error_code: code,
      attempt_count: 1,
    }).eq("id", emailMessage.id);
    const message = code === "NOT_CONFIGURED" ? "Chiave Brevo non configurata sul server"
      : code === "RATE_LIMITED" ? "Brevo ha applicato un limite temporaneo. Riprova più tardi."
        : "Invio Brevo non riuscito. Nessuna email è stata registrata come inviata.";
    redirect(withMessage(`/leads/${lead.id}`, "error", message));
  }

  const { error: recordError } = await supabase.rpc("record_email_sent", {
    p_email_id: emailMessage.id,
    p_provider_message_id: providerMessageId,
    p_follow_up_bodies: followUpBodies(lead.business_name),
  });
  if (recordError) {
    await supabase.from("email_messages").update({
      status: "sent",
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
      attempt_count: 1,
      error_code: "AUDIT_INCOMPLETE",
    }).eq("id", emailMessage.id);
    redirect(withMessage(`/leads/${lead.id}`, "error", "Email inviata, ma audit e follow-up non sono stati completati: non reinviarla"));
  }

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath("/outreach");
  revalidatePath(`/leads/${lead.id}`);
  redirect(withMessage(`/leads/${lead.id}`, "success", "Email inviata con Brevo e follow-up pianificati"));
}

export async function recordEmailReplyAction(formData: FormData) {
  await requireViewer();
  const leadId = z.uuid().safeParse(value(formData, "leadId"));
  if (!leadId.success) redirect(withMessage("/leads", "error", "Lead non valido"));

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_email_reply", { p_lead_id: leadId.data });
  if (error) redirect(withMessage(`/leads/${leadId.data}`, "error", "Risposta non registrata"));

  revalidatePath("/");
  revalidatePath("/outreach");
  revalidatePath(`/leads/${leadId.data}`);
  redirect(withMessage(`/leads/${leadId.data}`, "success", "Risposta registrata: follow-up automatici fermati"));
}

export async function anonymizeLeadAction(formData: FormData) {
  await requireAdmin();
  const leadId = z.uuid().safeParse(value(formData, "leadId"));
  const confirmation = value(formData, "confirmation");
  if (!leadId.success || confirmation !== "ANONIMIZZA") {
    redirect(withMessage("/leads", "error", "Conferma anonimizzazione non valida"));
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("anonymize_lead", { p_lead_id: leadId.data });
  if (error) redirect(withMessage(`/leads/${leadId.data}`, "error", "Anonimizzazione non riuscita"));

  revalidatePath("/");
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId.data}`);
  redirect(withMessage(`/leads/${leadId.data}`, "success", "Lead anonimizzato"));
}

// ── Batch send queued discovery emails (admin-only, manual trigger) ────────

export async function sendQueuedEmailsAction() {
  await requireAdmin();

  const supabase = await createClient();
  const [{ data: settings }, { data: owner }] = await Promise.all([
    supabase.from("settings").select(
      "email_enabled, email_sender_name, email_sender_email, email_reply_to, email_daily_limit, email_follow_up_enabled"
    ).eq("id", 1).single(),
    supabase.from("profiles").select("id").eq("role", "admin").order("created_at").limit(1).single(),
  ]);

  if (!settings?.email_enabled || !settings.email_sender_email || !owner) {
    redirect("/outreach?error=Configurazione%20email%20incompleta");
  }

  type ClaimedMessage = {
    id: string; lead_id: string; recipient_email: string; recipient_name: string;
    subject: string; body: string; kind: string; attempt_count: number;
  };
  const { data: claimedBatch, error: claimError } = await supabase.rpc("claim_queued_initial_emails", {
    p_requested_limit: 50,
  });
  if (claimError) redirect("/outreach?error=Impossibile%20prenotare%20la%20coda");
  const queued = Array.isArray(claimedBatch) ? claimedBatch as ClaimedMessage[] : [];

  if (!queued?.length) redirect("/outreach?error=Nessuna%20email%20in%20coda");

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const [messageIndex, message] of queued.entries()) {
    // Verify lead is still contactable.
    const { data: lead } = await supabase.from("leads")
      .select("status, email_suppressed_at, email_replied_at")
      .eq("id", message.lead_id)
      .single();
    if (!lead || lead.email_suppressed_at || lead.email_replied_at || ["booked", "client", "discarded"].includes(lead.status)) {
      await supabase.from("email_messages").update({
        status: "cancelled", cancelled_at: new Date().toISOString(), error_code: "LEAD_NOT_CONTACTABLE"
      }).eq("id", message.id);
      skipped += 1;
      continue;
    }

    // Send via Brevo with delay between sends (anti-ban).
    try {
      const result = await sendBrevoEmail({
        id: message.id,
        toEmail: message.recipient_email,
        toName: message.recipient_name,
        senderEmail: settings.email_sender_email,
        senderName: settings.email_sender_name,
        replyTo: settings.email_reply_to,
        subject: message.subject,
        body: message.body,
      });

      const { error: recordError } = await supabase.rpc("record_email_sent", {
        p_email_id: message.id,
        p_provider_message_id: result.messageId,
        p_follow_up_bodies: settings.email_follow_up_enabled ? followUpBodies(message.recipient_name) : [],
      });
      if (recordError) {
        console.error("Email sent but audit RPC failed", { messageId: message.id, code: recordError.code });
        await supabase.from("email_messages").update({
          status: "sent",
          provider_message_id: result.messageId,
          sent_at: new Date().toISOString(),
          attempt_count: Math.min(message.attempt_count + 1, 5),
          error_code: "AUDIT_PERSISTENCE_FAILED",
        }).eq("id", message.id).eq("status", "sending");
      }
      sent += 1;

      // Anti-ban delay: 1.5 seconds between sends.
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (error) {
      const retryable = error instanceof BrevoError && error.retryable;
      await supabase.from("email_messages").update(retryable ? {
        status: "queued",
        scheduled_for: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        attempt_count: Math.min(message.attempt_count + 1, 5),
        error_code: error instanceof BrevoError ? error.code : "SEND_FAILED",
      } : {
        status: "failed",
        failed_at: new Date().toISOString(),
        attempt_count: Math.min(message.attempt_count + 1, 5),
        error_code: error instanceof BrevoError ? error.code : "SEND_FAILED",
      }).eq("id", message.id);
      failed += 1;

      // Stop on rate limit.
      if (error instanceof BrevoError && error.code === "RATE_LIMITED") {
        const unprocessedIds = queued.slice(messageIndex + 1).map((entry) => entry.id);
        if (unprocessedIds.length) {
          await supabase.from("email_messages")
            .update({ status: "queued" })
            .in("id", unprocessedIds)
            .eq("status", "sending");
        }
        break;
      }
    }
  }

  revalidatePath("/");
  revalidatePath("/outreach");
  redirect(`/outreach?success=Inviate%20${sent}%20email%20${failed ? `·%20${failed}%20fallite%20` : ""}${skipped ? `·%20${skipped}%20saltate` : ""}`);
}

// ── Manual discovery trigger (admin-only, on-demand) ─────────────────────

const manualDiscoverySchema = z.object({
  category: z.enum(DISCOVERY_CATEGORIES),
  location: z.string().trim().max(100).optional().default(""),
  region: z.string().trim().max(100).optional().default(""),
  pageSize: z.coerce.number().int().min(1).max(50),
}).refine((data) => (data.location.length >= 2 || data.region.length >= 2), {
  message: "Inserisci almeno una città o una regione",
});

export async function triggerManualDiscoveryAction(formData: FormData) {
  await requireAdmin();

  const parsed = manualDiscoverySchema.safeParse({
    category: value(formData, "category"),
    location: value(formData, "location"),
    region: value(formData, "region"),
    pageSize: value(formData, "pageSize") || "20",
  });

  if (!parsed.success) {
    redirect(`/search?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dati non validi")}`);
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    redirect("/search?error=Configurazione%20server%20incompleta");
  }

  const { data: owner } = await supabase
    .from("profiles").select("id").eq("role", "admin").order("created_at").limit(1).single();
  if (!owner) redirect("/search?error=Nessun%20admin%20trovato");

  const { data: settings } = await supabase.from("settings").select(
    "default_score_threshold, email_auto_outreach_enabled, email_enabled, email_sender_name, email_sender_email, email_reply_to, email_follow_up_enabled"
  ).eq("id", 1).single();

  // Create scan run.
  const { data: scan, error: scanError } = await supabase.from("scan_runs").insert({
    trigger: "manual",
    category: parsed.data.category,
    region: `${parsed.data.location}, ${parsed.data.region}`,
    status: "running",
    created_by: owner.id,
  }).select("id").single();

  if (scanError || !scan) redirect("/search?error=Scansione%20non%20avviata");

  try {
    const places = await searchGooglePlacesBatch({
      category: parsed.data.category,
      location: parsed.data.location,
      region: parsed.data.region,
      targetCount: parsed.data.pageSize,
    });

    const placeIds = places.map((p) => p.id);
    const [{ data: leads }, { data: candidates }] = placeIds.length ? await Promise.all([
      supabase.from("leads").select("google_place_id").in("google_place_id", placeIds),
      supabase.from("lead_candidates").select("google_place_id").in("google_place_id", placeIds),
    ]) : [{ data: [] }, { data: [] }];
    const existingIds = new Set([
      ...(leads ?? []).map((l) => l.google_place_id).filter(Boolean),
      ...(candidates ?? []).map((c) => c.google_place_id),
    ]);
    const freshPlaces = places.filter((p) => !existingIds.has(p.id));

    if (freshPlaces.length) {
      const { error: shortlistError } = await supabase.from("lead_candidates").insert(freshPlaces.map((p) => ({
        google_place_id: p.id,
        search_category: parsed.data.category,
        search_location: parsed.data.location,
        search_region: parsed.data.region,
        origin: "manual",
        created_by: owner.id,
      })));
      if (shortlistError) throw shortlistError;
    }

    let converted = 0;
    let scouted = 0;
    let queued = 0;
    const resolvedPlaceIds: string[] = [];
    const reachOut = settings?.email_auto_outreach_enabled && settings?.email_enabled && Boolean(settings?.email_sender_email);

    const enrichedPlaces = await mapWithConcurrency(freshPlaces, 5, async (place) => ({
      place,
      scoutResult: place.websiteUri ? await scoutWebsite(place.websiteUri) : null,
    }));

    for (const { place, scoutResult } of enrichedPlaces) {
      const city = parsed.data.location;
      const region = parsed.data.region;
      const category = parsed.data.category;
      const websiteUrl = place.websiteUri ?? null;
      if (!websiteUrl) continue;
      if (!scoutResult || scoutResult.status !== "ok" || !scoutResult.businessName) continue;
      scouted += 1;
      const businessName = scoutResult.businessName;
      const phone = scoutResult.phones[0]?.number ?? null;

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
        p_origin: "manual",
      });

      if (createError) continue;
      const result = createResult as { status: string; lead_id: string } | null;
      if (!result || result.status === "duplicate") {
        if (result?.status === "duplicate") resolvedPlaceIds.push(place.id);
        continue;
      }

      const leadId = result.lead_id;
      converted += 1;
      resolvedPlaceIds.push(place.id);

      await supabase.from("lead_events").insert({
          lead_id: leadId,
          actor_id: owner.id,
          event_type: "scout_completed",
          payload: {
            status: scoutResult.status,
            emails: scoutResult.emails,
            phones: scoutResult.phones,
            hasBooking: scoutResult.hasBooking,
            hasChatbot: scoutResult.hasChatbot,
            chatbotProvider: scoutResult.chatbotProvider,
            socialChannels: scoutResult.socialChannels,
            locations: scoutResult.locations,
          } as unknown as Json,
      });

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
        p_input_snapshot: { input: {}, scoringV2: scoreResult } as unknown as Json,
        p_recommended_service_slug: scoreResult.recommendedService ?? "",
      });
      if (scoreError) throw scoreError;

      if (reachOut && scoutResult.emails[0]?.address && !scoutResult.hasChatbot
        && scoreResult.nextAction === "contact_now"
        && scoreResult.score >= (settings?.default_score_threshold ?? 65)) {
        const service = scoreResult.recommendedService
          ? scoreResult.recommendedService.replace(/-/g, " ")
          : "presenza digitale";
        const { error: queueError } = await supabase.from("email_messages").insert({
          lead_id: leadId,
          recipient_email: scoutResult.emails[0].address,
          recipient_name: businessName,
          subject: `${service} per ${businessName}`,
          body: withOptOut(`Buongiorno,\n\nabbiamo analizzato la presenza digitale di ${businessName} e abbiamo individuato alcune opportunità concrete per ${service}.\n\nIl nostro approccio è basato su dati verificabili e proponiamo solo interventi mirati e misurabili.\n\nSe desidera, possiamo condividere due spunti specifici in una breve chiamata conoscitiva, senza impegno.\n\nCordialmente,\nStudio Radar`),
          status: "queued",
          kind: "initial",
          created_by: owner.id,
        });
        if (queueError) throw queueError;
        queued += 1;
      }
    }

    if (resolvedPlaceIds.length) {
      const { error: cleanupError } = await supabase.from("lead_candidates")
        .delete().in("google_place_id", resolvedPlaceIds);
      if (cleanupError) throw cleanupError;
    }

    await supabase.from("scan_runs").update({
      status: "succeeded",
      found_count: placeIds.length,
      imported_count: freshPlaces.length,
      duplicate_count: placeIds.length - freshPlaces.length,
      finished_at: new Date().toISOString(),
    }).eq("id", scan.id);

    revalidatePath("/");
    revalidatePath("/leads");
    revalidatePath("/outreach");
    revalidatePath("/search");
    redirect(`/outreach?success=Trovati%20${placeIds.length}%20·%20convertiti%20${converted}%20·%20scout%20${scouted}%20·%20email%20in%20coda%20${queued}`);
  } catch (error) {
    const code = error instanceof PlacesError ? error.code : "SCAN_FAILED";
    await supabase.from("scan_runs").update({
      status: "failed",
      error_message: code,
      finished_at: new Date().toISOString(),
    }).eq("id", scan.id);
    redirect(`/search?error=${encodeURIComponent(code === "QUOTA" ? "Quota Google Places esaurita. Riprova più tardi." : "Scansione non riuscita.")}`);
  }
}
