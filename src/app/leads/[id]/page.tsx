import { ArrowLeft, Calendar, CheckCircle2, ExternalLink, Gauge, Globe, Mail, MapPin, MessageCircle, Phone, RefreshCw, Save, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { AnonymizeLeadForm } from "@/components/anonymize-lead-form";
import { LeadDetailsForm } from "@/components/lead-details-form";
import { SubmitButton } from "@/components/submit-button";
import { OutreachComposer } from "@/components/outreach-composer";
import { websiteAssessmentSchema, type WebsiteAssessment } from "@/lib/ai/contracts";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, formatDate, LEAD_STATUSES, SOURCE_LABELS, STATUS_LABELS } from "@/lib/crm";
import type { ScoreComponent } from "@/lib/scoring/deterministic";
import { isScoreSnapshotCurrent } from "@/lib/scoring/snapshot";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { analyzeLeadWithOpenAi, assignLeadAction, recordEmailReplyAction, scoreLeadDeterministically, updateLeadNotes, updateLeadStatus } from "../actions";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const EVENT_LABELS: Record<string, string> = {
  lead_created: "Lead creato",
  status_changed: "Stato aggiornato",
  notes_updated: "Note aggiornate",
  lead_details_updated: "Dati anagrafici aggiornati",
  deterministic_score_created: "Score deterministico calcolato",
  hybrid_score_created: "Score ibrido OpenAI calcolato",
  candidate_converted: "Candidato verificato e aggiunto al CRM",
  manual_outreach_recorded: "Contatto manuale registrato",
  email_sent: "Email inviata",
  email_delivered: "Email consegnata",
  email_opened: "Email aperta",
  email_unique_opened: "Prima apertura email",
  email_proxy_open: "Apertura email rilevata dal provider",
  email_unique_proxy_open: "Prima apertura proxy rilevata",
  email_click: "Link email cliccato",
  email_reply_recorded: "Risposta email registrata",
  email_hard_bounce: "Email respinta definitivamente",
  email_soft_bounce: "Email respinta temporaneamente",
  email_unsubscribed: "Contatto disiscritto",
  lead_assigned: "Collaboratore assegnato",
  lead_anonymized: "Dati del lead anonimizzati",
};

const SIGNAL_LABELS: Record<string, string> = {
  category_high_value: "Categoria ad alto valore",
  category_medium_value: "Categoria coerente",
  category_missing: "Categoria mancante",
  category_unvalidated: "Categoria da validare",
  region_emilia_romagna: "Priorità Emilia-Romagna",
  region_toscana: "Priorità Toscana",
  region_lombardia: "Target Lombardia",
  region_outside_priority: "Fuori dalle aree prioritarie",
  business_operational: "Attività operativa",
  website_missing: "Sito assente",
  website_present: "Sito presente",
  website_present_unassessed: "Sito da analizzare",
  reputation_strong: "Reputazione solida",
  reputation_good: "Buona reputazione",
  reputation_present: "Presenza verificabile",
  reputation_missing: "Recensioni assenti",
  reputation_insufficient: "Reputazione non verificata",
  rating_low: "Rating basso",
  phone_available: "Telefono disponibile",
  phone_missing: "Telefono assente",
  email_available: "Email disponibile",
  email_missing: "Email assente",
  booking_opportunity: "Opportunità booking",
  booking_already_present: "Booking già presente",
  booking_unknown: "Booking da verificare",
  business_closed_temporarily: "Attività temporaneamente chiusa",
  business_closed_permanently: "Attività chiusa definitivamente",
};

const DETAIL_FIELD_LABELS: Record<string, string> = {
  business_name: "Nome attività",
  city: "Città",
  region: "Regione",
  category: "Categoria",
  address: "Indirizzo",
  phone: "Telefono",
  email: "Email",
  website_url: "Sito web",
  estimated_value: "Valore stimato",
};

function scoreComponents(snapshot: Json): ScoreComponent[] {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return [];
  const value = snapshot.components;
  if (!Array.isArray(value)) return [];
  return value.flatMap((component) => {
    if (!component || Array.isArray(component) || typeof component !== "object") return [];
    const { key, label, score, maxScore } = component;
    if (
      !["marketFit", "businessStrength", "digitalOpportunity", "contactability"].includes(String(key))
      || typeof label !== "string"
      || typeof score !== "number"
      || typeof maxScore !== "number"
    ) return [];
    return [{ key, label, score, maxScore } as ScoreComponent];
  });
}

function websiteAssessment(snapshot: Json): WebsiteAssessment | null {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return null;
  const parsed = websiteAssessmentSchema.safeParse(snapshot.assessment);
  return parsed.success ? parsed.data : null;
}

function detailChanges(snapshot: Json) {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return [];
  const fields = snapshot.changed_fields;
  return Array.isArray(fields) ? fields.filter((field) => typeof field === "string") : [];
}

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const viewer = await requireViewer();
  const { id } = await params;
  const feedback = await searchParams;
  const supabase = await createClient();
  const [{ data: lead, error }, { data: events }, { data: rawLatestScore }, { data: services }, { data: settings }, { data: emails }, { data: collaborators }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_events").select("id, event_type, payload, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("lead_scores").select("score, grade, reasoning, positive_signals, negative_signals, deterministic_score, ai_score, confidence, provider, model, prompt_version, recommended_service_id, input_snapshot, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("services").select("id, name").eq("is_active", true),
    supabase.from("settings").select("email_enabled, email_sender_email").eq("id", 1).single(),
    supabase.from("email_messages").select("id, sequence_number, status, subject, scheduled_for, sent_at, delivered_at, first_opened_at, clicked_at, error_code").eq("lead_id", id).order("created_at", { ascending: false }).limit(12),
    viewer.role === "admin"
      ? supabase.from("profiles").select("id, full_name, email, role").order("full_name")
      : Promise.resolve({ data: null }),
  ]);

  if (error || !lead) notFound();
  const scoreIsStale = Boolean(rawLatestScore && !isScoreSnapshotCurrent(rawLatestScore.input_snapshot, lead));
  const latestScore = scoreIsStale ? null : rawLatestScore;
  const recommendedService = services?.find((service) => service.id === latestScore?.recommended_service_id)?.name;
  const components = latestScore ? scoreComponents(latestScore.input_snapshot) : [];
  const assessment = latestScore ? websiteAssessment(latestScore.input_snapshot) : null;

  return (
    <AppShell active="leads" eyebrow="Scheda lead" title={lead.business_name} viewer={viewer} actions={<Link className="secondary-button" href="/leads"><ArrowLeft size={16} /> Torna ai lead</Link>}>
      {feedback.error ? <div className="alert alert-error" role="alert">{feedback.error}</div> : null}
      {feedback.success ? <div className="alert alert-success" role="status">{feedback.success}</div> : null}

      <div className="detail-grid">
        <section className="detail-main">
          <article className="panel">
            <div className="panel-header lead-title-row">
              <div><p className="eyebrow">Profilo commerciale</p><h2>{lead.category || "Categoria non indicata"}</h2></div>
              <span className={`status-badge status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span>
            </div>
            <dl className="detail-list">
              <div><dt><MapPin size={16} /> Località</dt><dd>{[lead.address, lead.city, lead.region].filter(Boolean).join(", ") || "Non indicata"}</dd></div>
              <div><dt><Phone size={16} /> Telefono</dt><dd>{lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : "Non indicato"}</dd></div>
              <div><dt><Mail size={16} /> Email</dt><dd>{lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : "Non indicata"}</dd></div>
              <div><dt><Globe size={16} /> Sito web</dt><dd>{lead.website_url ? <a href={lead.website_url} target="_blank" rel="noreferrer">Apri sito</a> : "Non presente"}</dd></div>
              <div><dt><Calendar size={16} /> Inserito</dt><dd>{formatDate(lead.created_at)} · {SOURCE_LABELS[lead.source]}</dd></div>
            </dl>
          </article>

          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow">Anagrafica</p><h2>Dati lead</h2></div></div>
            <LeadDetailsForm lead={lead} />
          </article>

          {assessment ? (
            <article className="panel ai-assessment">
              <div className="panel-header"><div><p className="eyebrow">Evidenze dal sito ufficiale</p><h2>Analisi OpenAI</h2></div><Sparkles size={19} /></div>
              <p className="score-reasoning">{assessment.summary}</p>
              {assessment.opportunities.length ? <div className="ai-opportunities">{assessment.opportunities.map((opportunity) => <div key={`${opportunity.service}-${opportunity.sourceUrl}`}><strong>{opportunity.rationale}</strong><p>{opportunity.evidence}</p><a href={opportunity.sourceUrl} target="_blank" rel="noreferrer">Verifica fonte <ExternalLink size={13} /></a></div>)}</div> : null}
              <dl className="ai-details"><div><dt>Approccio consigliato</dt><dd>{assessment.outreachAngle}</dd></div>{assessment.missingEvidence.length ? <div><dt>Da verificare</dt><dd>{assessment.missingEvidence.join(" · ")}</dd></div> : null}{assessment.risks.length ? <div><dt>Cautele</dt><dd>{assessment.risks.join(" · ")}</dd></div> : null}</dl>
            </article>
          ) : null}

          <article className="panel outreach-panel">
            <div className="panel-header"><div><p className="eyebrow">Contatto consulenziale</p><h2>Outreach WhatsApp ed email</h2></div><MessageCircle size={19} /></div>
            <OutreachComposer
              leadId={lead.id}
              businessName={lead.business_name}
              initialPhone={lead.phone ?? ""}
              initialEmail={lead.email ?? ""}
              emailEnabled={Boolean(settings?.email_enabled && settings.email_sender_email)}
              emailSuppressed={Boolean(lead.email_suppressed_at)}
            />
          </article>

          {emails?.length ? <article className="panel email-history">
            <div className="panel-header"><div><p className="eyebrow">Brevo</p><h2>Storico email</h2></div><Mail size={19} /></div>
            <div className="email-history-list">{emails.map((email) => <div className="email-history-row" key={email.id}>
              <div><strong>{email.sequence_number ? `Follow-up ${email.sequence_number}` : "Email iniziale"}: {email.subject}</strong><span>{email.sent_at ? `Inviata ${formatDate(email.sent_at)}` : `Pianificata ${formatDate(email.scheduled_for)}`}</span></div>
              <span className={`email-status email-status-${email.status}`}>{email.status}</span>
              <small>{email.clicked_at ? "Link cliccato" : email.first_opened_at ? "Aperta" : email.delivered_at ? "Consegnata" : email.error_code ?? ""}</small>
            </div>)}</div>
            {!lead.email_replied_at && emails.some((email) => email.sent_at) ? <form className="email-reply-form" action={recordEmailReplyAction}>
              <input type="hidden" name="leadId" value={lead.id} />
              <p>Se la risposta arriva nella casella collegata, registrala qui: i follow-up in attesa verranno annullati.</p>
              <SubmitButton className="secondary-button" pendingLabel="Registrazione..."><CheckCircle2 size={16} /> Segna risposta ricevuta</SubmitButton>
            </form> : null}
          </article> : null}

          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow">Contesto interno</p><h2>Note</h2></div></div>
            <form className="notes-form" action={updateLeadNotes}>
              <input type="hidden" name="leadId" value={lead.id} />
              <textarea name="notes" maxLength={10000} rows={8} defaultValue={lead.notes} placeholder="Aggiungi osservazioni utili al team..." />
              <div className="form-actions"><SubmitButton className="secondary-button" pendingLabel="Salvataggio..."><Save size={16} /> Salva note</SubmitButton></div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow">Audit</p><h2>Timeline</h2></div></div>
            {events?.length ? <ol className="timeline">{events.map((event) => {
              const payload = event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? event.payload : null;
              const changedFields = event.event_type === "lead_details_updated" && payload ? detailChanges(payload) : [];

              return <li key={event.id}><span className="timeline-dot" /><div><strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong><span>{formatDate(event.created_at)}</span>{event.event_type === "status_changed" && payload ? <p>Da {STATUS_LABELS[payload.from as keyof typeof STATUS_LABELS] ?? String(payload.from)} a {STATUS_LABELS[payload.to as keyof typeof STATUS_LABELS] ?? String(payload.to)}</p> : null}{changedFields.length ? <p>Campi aggiornati: {changedFields.map((field) => DETAIL_FIELD_LABELS[field] || field).join(" · ")}</p> : null}</div></li>;
            })}</ol> : <p className="muted-copy">Nessun evento registrato.</p>}
          </article>
        </section>

        <aside className="detail-aside">
          <div className="sticky-panel aside-stack">
            <section className="panel score-panel">
              <div className="panel-header"><div><p className="eyebrow">Priorità</p><h2>{latestScore?.provider === "openai" ? "Score ibrido" : "Score base"}</h2></div><Gauge size={19} /></div>
              {latestScore ? (
                <>
                  <div className="score-summary"><strong>{latestScore.score}</strong><span>/100</span><span className={`score-grade score-grade-${latestScore.grade}`}>{latestScore.grade === "priority" ? "Prioritario" : latestScore.grade === "hot" ? "Buono" : latestScore.grade === "warm" ? "Tiepido" : "Freddo"}</span></div>
                  <p className="score-reasoning">{latestScore.reasoning}</p>
                  {components.length ? <div className="score-components">{components.map((component) => <div className="score-component" key={component.key}><span>{component.label}</span><div className="progress-track" aria-hidden="true"><div style={{ width: `${(component.score / component.maxScore) * 100}%` }} /></div><strong>{component.score}/{component.maxScore}</strong></div>)}</div> : null}
                  <div className="signal-list">{latestScore.positive_signals.map((signal) => <span className="signal signal-positive" key={signal}>{SIGNAL_LABELS[signal] || signal}</span>)}{latestScore.negative_signals.map((signal) => <span className="signal signal-negative" key={signal}>{SIGNAL_LABELS[signal] || signal}</span>)}</div>
                  <dl className="score-meta"><div><dt>Servizio</dt><dd>{recommendedService || "Da definire"}</dd></div><div><dt>Confidenza</dt><dd>{Math.round((latestScore.confidence ?? 0) * 100)}%</dd></div>{latestScore.ai_score !== null ? <><div><dt>Base</dt><dd>{latestScore.deterministic_score}/100</dd></div><div><dt>OpenAI</dt><dd>{latestScore.ai_score}/100</dd></div></> : null}</dl>
                </>
              ) : <p className="muted-copy">{scoreIsStale ? "I dati del lead sono cambiati. Ricalcola lo score prima di usarlo." : "Nessuna valutazione disponibile per questo lead."}</p>}
              <form className="score-action" action={scoreLeadDeterministically}>
                <input type="hidden" name="leadId" value={lead.id} />
                <SubmitButton className="secondary-button" pendingLabel="Calcolo..."><RefreshCw size={15} /> {latestScore ? "Ricalcola" : "Calcola score"}</SubmitButton>
              </form>
              {lead.website_url ? <form className="score-action" action={analyzeLeadWithOpenAi}><input type="hidden" name="leadId" value={lead.id} /><SubmitButton pendingLabel="Analisi in corso..."><Sparkles size={15} /> Analizza sito con OpenAI</SubmitButton></form> : <p className="muted-copy">Aggiungi il sito ufficiale per attivare l’analisi OpenAI.</p>}
            </section>

            <section className="panel">
              <div className="panel-header"><div><p className="eyebrow">Pipeline</p><h2>Gestione lead</h2></div></div>
              <form className="status-form" action={updateLeadStatus}>
                <input type="hidden" name="leadId" value={lead.id} />
                <label className="field"><span>Stato</span><select name="status" defaultValue={lead.status}>{LEAD_STATUSES.map((status) => <option value={status.value} key={status.value}>{status.label}</option>)}</select></label>
                <SubmitButton pendingLabel="Aggiornamento...">Aggiorna stato</SubmitButton>
              </form>
              <dl className="commercial-summary">
                <div><dt>Valore stimato</dt><dd>{formatCurrency(lead.estimated_value)}</dd></div>
                <div><dt>Sito web</dt><dd>{lead.has_website ? "Presente" : "Assente"}</dd></div>
                <div><dt>Booking</dt><dd>{lead.has_booking ? "Presente" : "Non verificato"}</dd></div>
              </dl>
            </section>
            {viewer.role === "admin" ? <section className="panel">
              <div className="panel-header"><div><p className="eyebrow">Responsabilità</p><h2>Assegnazione</h2></div></div>
              <form className="status-form" action={assignLeadAction}>
                <input type="hidden" name="leadId" value={lead.id} />
                <label className="field"><span>Collaboratore</span><select name="assignedTo" defaultValue={lead.assigned_to ?? ""}>
                  <option value="">Non assegnato</option>
                  {collaborators?.map((profile) => <option value={profile.id} key={profile.id}>{profile.full_name || profile.email}{profile.role === "admin" ? " · admin" : ""}</option>)}
                </select></label>
                <SubmitButton pendingLabel="Assegnazione...">Salva assegnazione</SubmitButton>
              </form>
            </section> : null}
            {viewer.role === "admin" ? <section className="panel danger-panel"><div className="panel-header"><div><p className="eyebrow">Privacy</p><h2>Anonimizzazione</h2></div></div><p className="muted-copy">Rimuove definitivamente contatti, note, analisi e storico dei messaggi. Resta soltanto un evento minimale.</p><AnonymizeLeadForm leadId={lead.id} /></section> : null}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
