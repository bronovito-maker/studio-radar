import { ChevronRight, Filter, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, formatDate, isLeadStatus, LEAD_STATUSES, REGIONS, SOURCE_LABELS, STATUS_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type LeadListPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Cursor = { createdAt: string; id: string };

function first(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

function decodeCursor(value: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    return typeof parsed.createdAt === "string" && typeof parsed.id === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function cleanSearch(value: string) {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

export default async function LeadsPage({ searchParams }: LeadListPageProps) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const q = cleanSearch(first(params.q));
  const statusParam = first(params.status);
  const status = isLeadStatus(statusParam) ? statusParam : "";
  const region = first(params.region).slice(0, 100);
  const cursor = decodeCursor(first(params.cursor));
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(
      "id, business_name, city, region, category, status, source, estimated_value, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (q) {
    const pattern = `%${q}%`;
    query = query.or(`business_name.ilike.${pattern},city.ilike.${pattern},category.ilike.${pattern}`);
  }
  if (status) query = query.eq("status", status);
  if (region) query = query.eq("region", region);
  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
    );
  }

  const { data, count, error } = await query.limit(21);
  const leads = data?.slice(0, 20) ?? [];
  const hasNext = (data?.length ?? 0) > 20;
  const lastLead = leads.at(-1);
  const nextCursor = lastLead
    ? encodeCursor({ createdAt: lastLead.created_at, id: lastLead.id })
    : null;
  const activeFilters = Boolean(q || status || region);
  const nextParams = new URLSearchParams();
  if (q) nextParams.set("q", q);
  if (status) nextParams.set("status", status);
  if (region) nextParams.set("region", region);
  if (nextCursor) nextParams.set("cursor", nextCursor);

  return (
    <AppShell
      active="leads"
      eyebrow="CRM core"
      title="Lead"
      viewer={viewer}
      actions={
        <Link className="primary-button" href="/leads/new">
          <Plus size={18} aria-hidden="true" /> Nuovo lead
        </Link>
      }
    >
      <section className="filter-bar" aria-label="Filtri lead">
        <form className="filters" method="get">
          <label className="search-field">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Cerca lead</span>
            <input name="q" defaultValue={q} placeholder="Nome, città o categoria" />
          </label>
          <label>
            <span className="sr-only">Stato</span>
            <select name="status" defaultValue={status}>
              <option value="">Tutti gli stati</option>
              {LEAD_STATUSES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">Regione</span>
            <select name="region" defaultValue={region}>
              <option value="">Tutte le regioni</option>
              {REGIONS.map((item) => <option value={item} key={item}>{item}</option>)}
            </select>
          </label>
          <button className="secondary-button" type="submit"><Filter size={16} /> Applica</button>
          {activeFilters ? <Link className="icon-button" href="/leads" aria-label="Azzera filtri" title="Azzera filtri"><X size={17} /></Link> : null}
        </form>
        <span className="result-count">{count ?? 0} risultati</span>
      </section>

      {error ? (
        <div className="alert alert-error" role="alert">Impossibile recuperare i lead. Riprova tra poco.</div>
      ) : leads.length ? (
        <section className="table-panel" aria-label="Elenco lead">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr><th>Attività</th><th>Categoria</th><th>Stato</th><th>Origine</th><th>Valore</th><th>Inserito</th><th><span className="sr-only">Apri</span></th></tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id}>
                    <td><Link className="entity-link" href={`/leads/${lead.id}`}><strong>{lead.business_name}</strong><span>{[lead.city, lead.region].filter(Boolean).join(", ") || "Località non indicata"}</span></Link></td>
                    <td>{lead.category || "Non indicata"}</td>
                    <td><span className={`status-badge status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span></td>
                    <td>{SOURCE_LABELS[lead.source]}</td>
                    <td className="numeric">{formatCurrency(lead.estimated_value)}</td>
                    <td>{formatDate(lead.created_at)}</td>
                    <td><Link className="row-action" href={`/leads/${lead.id}`} aria-label={`Apri ${lead.business_name}`}><ChevronRight size={18} /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="table-footer">
            <span>Mostrati {leads.length} lead</span>
            {hasNext ? <Link className="secondary-button" href={`/leads?${nextParams.toString()}`}>Pagina successiva <ChevronRight size={16} /></Link> : null}
          </footer>
        </section>
      ) : (
        <section className="empty-state">
          <Search size={26} aria-hidden="true" />
          <h2>{activeFilters ? "Nessun lead corrisponde ai filtri" : "La pipeline è pronta"}</h2>
          <p>{activeFilters ? "Modifica i criteri o azzera i filtri per ampliare la ricerca." : "Inserisci il primo lead manualmente. Import e discovery arriveranno nelle prossime fasi."}</p>
          {activeFilters ? <Link className="secondary-button" href="/leads">Azzera filtri</Link> : <Link className="primary-button" href="/leads/new"><Plus size={17} /> Nuovo lead</Link>}
        </section>
      )}
    </AppShell>
  );
}
