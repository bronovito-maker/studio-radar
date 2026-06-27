import { ArrowLeft, Calendar, Globe, Mail, MapPin, Phone, Save } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, formatDate, LEAD_STATUSES, SOURCE_LABELS, STATUS_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";
import { updateLeadNotes, updateLeadStatus } from "../actions";

type LeadDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

const EVENT_LABELS: Record<string, string> = {
  lead_created: "Lead creato",
  status_changed: "Stato aggiornato",
  notes_updated: "Note aggiornate",
};

export default async function LeadDetailPage({ params, searchParams }: LeadDetailPageProps) {
  const viewer = await requireViewer();
  const { id } = await params;
  const feedback = await searchParams;
  const supabase = await createClient();
  const [{ data: lead, error }, { data: events }] = await Promise.all([
    supabase.from("leads").select("*").eq("id", id).single(),
    supabase.from("lead_events").select("id, event_type, payload, created_at").eq("lead_id", id).order("created_at", { ascending: false }).limit(30),
  ]);

  if (error || !lead) notFound();

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
          <section className="panel sticky-panel">
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
        </aside>
      </div>
    </AppShell>
  );
}
