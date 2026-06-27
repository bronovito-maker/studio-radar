import { ArrowRight, ContactRound, Plus, Search } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, formatDate, LEAD_STATUSES, STATUS_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

export const dynamic = "force-dynamic";

type DashboardSummary = {
  total: number;
  qualified: number;
  to_contact: number;
  contacted: number;
  booked: number;
  clients: number;
  pipeline_value: number;
  by_status: Record<string, number>;
};

const emptySummary: DashboardSummary = {
  total: 0,
  qualified: 0,
  to_contact: 0,
  contacted: 0,
  booked: 0,
  clients: 0,
  pipeline_value: 0,
  by_status: {},
};

function parseSummary(value: Json | null): DashboardSummary {
  if (!value || Array.isArray(value) || typeof value !== "object") return emptySummary;

  const numberValue = (key: string) => {
    const candidate = value[key];
    return typeof candidate === "number" ? candidate : Number(candidate ?? 0);
  };
  const byStatusValue = value.by_status;
  const byStatus =
    byStatusValue && !Array.isArray(byStatusValue) && typeof byStatusValue === "object"
      ? Object.fromEntries(
          Object.entries(byStatusValue).map(([key, count]) => [key, Number(count ?? 0)]),
        )
      : {};

  return {
    total: numberValue("total"),
    qualified: numberValue("qualified"),
    to_contact: numberValue("to_contact"),
    contacted: numberValue("contacted"),
    booked: numberValue("booked"),
    clients: numberValue("clients"),
    pipeline_value: numberValue("pipeline_value"),
    by_status: byStatus,
  };
}

export default async function DashboardPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: summaryData, error: summaryError }, { data: recentLeads, error: leadsError }] =
    await Promise.all([
      supabase.rpc("get_dashboard_summary"),
      supabase
        .from("leads")
        .select("id, business_name, city, region, status, estimated_value, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const summary = parseSummary(summaryData);
  const hasError = Boolean(summaryError || leadsError);
  const maxPipelineCount = Math.max(1, ...Object.values(summary.by_status));
  const stats = [
    { label: "Lead totali", value: summary.total.toLocaleString("it-IT"), detail: "Archivio operativo" },
    { label: "Da contattare", value: summary.to_contact.toLocaleString("it-IT"), detail: "Pronti per outreach" },
    { label: "Call prenotate", value: summary.booked.toLocaleString("it-IT"), detail: "In pipeline" },
    { label: "Pipeline stimata", value: formatCurrency(summary.pipeline_value), detail: "Esclusi clienti e scartati" },
  ];

  return (
    <AppShell
      active="dashboard"
      eyebrow="Panoramica"
      title="Cruscotto operativo"
      viewer={viewer}
      actions={
        <Link className="primary-button" href="/leads/new">
          <Plus size={18} aria-hidden="true" />
          Nuovo lead
        </Link>
      }
    >
      {hasError ? (
        <div className="alert alert-error" role="alert">
          Non è stato possibile aggiornare tutte le metriche. Riprova tra poco.
        </div>
      ) : null}

      <section className="stats-grid" aria-label="Metriche principali">
        {stats.map((stat) => (
          <article className="metric-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <p>{stat.detail}</p>
          </article>
        ))}
      </section>

      <section className="dashboard-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Pipeline</p>
              <h2>Distribuzione per stato</h2>
            </div>
            <Link className="text-link" href="/leads">Tutti i lead <ArrowRight size={15} /></Link>
          </div>
          <div className="pipeline-list">
            {LEAD_STATUSES.map((status) => {
              const count = summary.by_status[status.value] ?? 0;
              return (
                <div className="pipeline-row" key={status.value}>
                  <span>{status.label}</span>
                  <div className="progress-track" aria-hidden="true">
                    <div style={{ width: `${(count / maxPipelineCount) * 100}%` }} />
                  </div>
                  <strong>{count}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Attività recente</p>
              <h2>Ultimi lead inseriti</h2>
            </div>
          </div>
          {recentLeads?.length ? (
            <div className="recent-list">
              {recentLeads.map((lead) => (
                <Link className="recent-row" href={`/leads/${lead.id}`} key={lead.id}>
                  <span className="entity-icon"><ContactRound size={17} /></span>
                  <span className="recent-main">
                    <strong>{lead.business_name}</strong>
                    <span>{[lead.city, lead.region].filter(Boolean).join(", ") || "Località non indicata"}</span>
                  </span>
                  <span className={`status-badge status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span>
                  <span className="recent-date">{formatDate(lead.created_at)}</span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty-state compact">
              <Search size={22} aria-hidden="true" />
              <strong>Nessun lead ancora</strong>
              <p>Inserisci il primo contatto per iniziare a costruire la pipeline.</p>
              <Link className="secondary-button" href="/leads/new">Inserisci lead</Link>
            </div>
          )}
        </section>
      </section>
    </AppShell>
  );
}
