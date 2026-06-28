import { ArrowRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { requireViewer } from "@/lib/auth";
import { formatCurrency, STATUS_LABELS } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, business_name, category, city, region, phone, status, estimated_value")
    .in("status", ["qualified", "to_contact", "follow_up"])
    .order("estimated_value", { ascending: false })
    .limit(100);

  return (
    <AppShell active="outreach" eyebrow="Attività commerciale" title="Coda outreach" viewer={viewer}>
      {error ? <div className="alert alert-error" role="alert">La coda outreach non è disponibile.</div> : null}
      <section className="panel outreach-queue">
        <div className="panel-header"><div><p className="eyebrow">Priorità operative</p><h2>Lead da contattare</h2></div><span className="result-count">{leads?.length ?? 0} lead</span></div>
        {leads?.length ? <div className="outreach-list">{leads.map((lead) => <Link className="outreach-row" href={`/leads/${lead.id}`} key={lead.id}><span className="entity-icon"><MessageCircle size={16} /></span><span className="recent-main"><strong>{lead.business_name}</strong><span>{lead.category || "Categoria non indicata"} · {[lead.city, lead.region].filter(Boolean).join(", ") || "Località non indicata"}</span></span><span className={`status-badge status-${lead.status}`}>{STATUS_LABELS[lead.status]}</span><span className="outreach-phone">{lead.phone || "Telefono da verificare"}</span><strong>{formatCurrency(lead.estimated_value)}</strong><ArrowRight size={15} /></Link>)}</div> : <div className="empty-state compact"><MessageCircle size={22} /><strong>Nessun lead in coda</strong><p>I lead qualificati o in follow-up appariranno qui.</p></div>}
      </section>
    </AppShell>
  );
}
