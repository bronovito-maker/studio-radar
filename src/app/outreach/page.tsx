import { ArrowRight, Mail, MessageCircle, Send } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, STATUS_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";
import { sendQueuedEmailsAction } from "@/app/leads/actions";

export const dynamic = "force-dynamic";

type OutreachPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function OutreachPage({ searchParams }: OutreachPageProps) {
  const viewer = await requireViewer();
  const feedback = await searchParams;
  const supabase = await createClient();

  const now = new Date().toISOString();
  const [{ data: leads, error }, { count: queuedCount }, { data: queuedPreview }] = await Promise.all([
    supabase
      .from("leads")
      .select("id, business_name, category, city, region, phone, status, estimated_value")
      .in("status", ["qualified", "to_contact", "follow_up"])
      .order("estimated_value", { ascending: false })
      .limit(100),
    supabase
      .from("email_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "queued")
      .eq("kind", "initial")
      .lte("scheduled_for", now),
    supabase
      .from("email_messages")
      .select("id, lead_id, recipient_email, recipient_name, subject")
      .eq("status", "queued")
      .eq("kind", "initial")
      .lte("scheduled_for", now)
      .order("scheduled_for")
      .limit(50),
  ]);

  return (
    <AppShell active="outreach" eyebrow="Attività commerciale" title="Coda outreach" viewer={viewer}>
      {feedback.error ? <div className="alert alert-error" role="alert">{feedback.error}</div> : null}
      {feedback.success ? <div className="alert alert-success" role="status">{feedback.success}</div> : null}

      {/* ── Queued discovery emails (admin-only) ─────────────────────────── */}
      {viewer.role === "admin" && (queuedCount ?? 0) > 0 ? (
        <section className="panel queue-banner">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Email in attesa</p>
              <h2><Mail size={18} /> {queuedCount} email pronte per l&apos;invio</h2>
            </div>
          </div>
          <p>Il cron notturno ha trovato nuovi lead e preparato le email. Controlla la lista lead prima di inviare.</p>
          <div className="outreach-list">
            {(queuedPreview ?? []).map((message) => (
              <Link className="outreach-row" href={`/leads/${message.lead_id}`} key={message.id}>
                <span className="entity-icon"><Mail size={16} /></span>
                <span className="recent-main">
                  <strong>{message.recipient_name}</strong>
                  <span>{message.recipient_email} · {message.subject}</span>
                </span>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
          <div className="form-actions">
            <form action={sendQueuedEmailsAction}>
              <SubmitButton className="primary-button" pendingLabel={`Invio in corso (anti-ban: 1.5s tra email)...`}>
                <Send size={16} /> Approva e invia fino a {Math.min(queuedCount ?? 0, 50)} email
              </SubmitButton>
            </form>
          </div>
        </section>
      ) : null}

      <section className="panel outreach-queue">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Priorità operative</p>
            <h2>Lead da contattare</h2>
          </div>
          <span className="result-count">{leads?.length ?? 0} lead</span>
        </div>
        {error ? (
          <div className="alert alert-error" role="alert">La coda outreach non è disponibile.</div>
        ) : leads?.length ? (
          <div className="outreach-list">
            {leads.map((lead) => (
              <Link className="outreach-row" href={`/leads/${lead.id}`} key={lead.id}>
                <span className="entity-icon"><MessageCircle size={16} /></span>
                <span className="recent-main">
                  <strong>{lead.business_name}</strong>
                  <span>{lead.category || "Categoria non indicata"} · {[lead.city, lead.region].filter(Boolean).join(", ") || "Località non indicata"}</span>
                </span>
                <span className={`status-badge status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span>
                <span className="outreach-phone">{lead.phone || "Telefono da verificare"}</span>
                <strong>{formatCurrency(lead.estimated_value)}</strong>
                <ArrowRight size={15} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <MessageCircle size={22} />
            <strong>Nessun lead in coda</strong>
            <p>I lead qualificati o in follow-up appariranno qui.</p>
          </div>
        )}
      </section>
    </AppShell>
  );
}
