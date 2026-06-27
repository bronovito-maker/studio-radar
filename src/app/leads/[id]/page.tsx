import { ArrowLeft, Calendar, Gauge, Globe, Mail, MapPin, Phone, RefreshCw, Save } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, formatDate, LEAD_STATUSES, SOURCE_LABELS, STATUS_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";
import { scoreLeadDeterministically, updateLeadNotes, updateLeadStatus } from "../actions";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const EVENT_LABELS: Record<string, string> = {
  lead_created: "Lead creato",
  status_changed: "Stato aggiornato",
  notes_updated: "Note aggiornate",
  deterministic_score_created: "Score deterministico calcolato",
};

const SIGNAL_LABELS: Record<string, string> = {
  category_high_value: "Categoria ad alto valore",
  category_medium_value: "Categoria coerente",
  category_missing: "Categoria mancante",
  region_emilia_romagna: "Priorità Emilia-Romagna",
  region_toscana: "Priorità Toscana",
  region_lombardia: "Target Lombardia",
  website_missing: "Sito assente",
  website_present: "Sito presente",
  reputation_strong: "Reputazione solida",
  reputation_good: "Buona reputazione",
  reputation_present: "Presenza verificabile",
  reputation_missing: "Recensioni assenti",
  rating_low: "Rating basso",
  phone_available: "Telefono disponibile",
  phone_missing: "Telefono assente",
  email_available: "Email disponibile",
  booking_opportunity: "Opportunità booking",
  business_closed_temporarily: "Attività temporaneamente chiusa",
  business_closed_permanently: "Attività chiusa definitivamente",
};

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const viewer = await requireViewer();
  const { id } = await params;
  const feedback = await searchParams;
  const supabase = await createClient();
  const [{ data: lead, error }, { data: events }, { data: latestScore }, { data: services }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_events").select("id, event_type, payload, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("lead_scores").select("score, grade, reasoning, positive_signals, negative_signals, confidence, prompt_version, recommended_service_id, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("services").select("id, name").eq("is_active", true),
  ]);

  if (error || !lead) notFound();
  const recommendedService = services?.find((service) => service.id === latestScore?.recommended_service_id)?.name;

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
            <div className="panel-header"><div><p className="eyebrow">Contesto interno</p><h2>Note</h2></div></div>
            <form className="notes-form" action={updateLeadNotes}>
              <input type="hidden" name="leadId" value={lead.id} />
              <textarea name="notes" maxLength={10000} rows={8} defaultValue={lead.notes} placeholder="Aggiungi osservazioni utili al team..." />
              <div className="form-actions"><SubmitButton className="secondary-button" pendingLabel="Salvataggio..."><Save size={16} /> Salva note</SubmitButton></div>
            </form>
          </article>

          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow">Audit</p><h2>Timeline</h2></div></div>
            {events?.length ? <ol className="timeline">{events.map((event) => <li key={event.id}><span className="timeline-dot" /><div><strong>{EVENT_LABELS[event.event_type] || event.event_type}</strong><span>{formatDate(event.created_at)}</span>{event.event_type === "status_changed" && event.payload && typeof event.payload === "object" && !Array.isArray(event.payload) ? <p>Da {STATUS_LABELS[event.payload.from as keyof typeof STATUS_LABELS] ?? String(event.payload.from)} a {STATUS_LABELS[event.payload.to as keyof typeof STATUS_LABELS] ?? String(event.payload.to)}</p> : null}</div></li>)}</ol> : <p className="muted-copy">Nessun evento registrato.</p>}
          </article>
        </section>

        <aside className="detail-aside">
          <div className="sticky-panel aside-stack">
            <section className="panel score-panel">
              <div className="panel-header"><div><p className="eyebrow">Priorità</p><h2>Score deterministico</h2></div><Gauge size={19} /></div>
              {latestScore ? (
                <>
                  <div className="score-summary"><strong>{latestScore.score}</strong><span>/100</span><span className={`score-grade score-grade-${latestScore.grade}`}>{latestScore.grade === "priority" ? "Prioritario" : latestScore.grade === "hot" ? "Buono" : latestScore.grade === "warm" ? "Tiepido" : "Freddo"}</span></div>
                  <p className="score-reasoning">{latestScore.reasoning}</p>
                  <div className="signal-list">{latestScore.positive_signals.map((signal) => <span className="signal signal-positive" key={signal}>{SIGNAL_LABELS[signal] || signal}</span>)}{latestScore.negative_signals.map((signal) => <span className="signal signal-negative" key={signal}>{SIGNAL_LABELS[signal] || signal}</span>)}</div>
                  <dl className="score-meta"><div><dt>Servizio</dt><dd>{recommendedService || "Da definire"}</dd></div><div><dt>Confidenza</dt><dd>{Math.round((latestScore.confidence ?? 0) * 100)}%</dd></div></dl>
                </>
              ) : <p className="muted-copy">Nessuna valutazione disponibile per questo lead.</p>}
              <form className="score-action" action={scoreLeadDeterministically}>
                <input type="hidden" name="leadId" value={lead.id} />
                <SubmitButton className="secondary-button" pendingLabel="Calcolo..."><RefreshCw size={15} /> {latestScore ? "Ricalcola" : "Calcola score"}</SubmitButton>
              </form>
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
                <div><dt>Booking</dt><dd>{lead.has_booking ? "Presente" : "Assente"}</dd></div>
              </dl>
            </section>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
