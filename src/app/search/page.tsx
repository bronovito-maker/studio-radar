import { Clock3, Search } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { DiscoverySearch } from "@/components/discovery-search";
import { requireViewer } from "@/lib/auth";
import { formatDate } from "@/lib/crm";
import { isPlacesConfigured } from "@/lib/places/client";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const SCAN_STATUS = { running: "In corso", succeeded: "Completata", failed: "Non riuscita" } as const;

export default async function SearchPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data: scans } = await supabase
    .from("scan_runs")
    .select("id, category, region, status, found_count, duplicate_count, started_at")
    .order("started_at", { ascending: false })
    .limit(8);

  return (
    <AppShell active="search" eyebrow="Discovery" title="Ricerca lead" viewer={viewer}>
      <DiscoverySearch configured={isPlacesConfigured()} />
      <section className="panel scan-history">
        <div className="panel-header"><div><p className="eyebrow">Attività</p><h2>Ultime ricerche</h2></div></div>
        {scans?.length ? <div className="scan-list">{scans.map((scan) => (
          <div className="scan-row" key={scan.id}>
            <span className="entity-icon"><Search size={16} /></span>
            <span className="recent-main"><strong>{scan.category || "Ricerca lead"}</strong><span>{scan.region || "Zona non indicata"}</span></span>
            <span className={`import-status import-status-${scan.status}`}>{SCAN_STATUS[scan.status]}</span>
            <span className="scan-count">{scan.found_count} trovati · {scan.duplicate_count} duplicati</span>
            <span className="recent-date"><Clock3 size={13} /> {formatDate(scan.started_at)}</span>
          </div>
        ))}</div> : <div className="empty-state compact"><Search size={22} /><strong>Nessuna ricerca</strong><p>Le scansioni completate appariranno qui.</p></div>}
      </section>
    </AppShell>
  );
}
