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
import { combineScores } from "@/lib/scoring/hybrid";
import { isScoreSnapshotCurrent } from "@/lib/scoring/snapshot";
import { consumeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
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
