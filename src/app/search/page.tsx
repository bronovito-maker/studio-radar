import { Bookmark, ChevronRight, Clock3, ExternalLink, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { DiscoverySearch } from "@/components/discovery-search";
import { requireViewer } from "@/lib/auth";
import { formatDate } from "@/lib/crm";
import { getGooglePlaceSummary, isPlacesConfigured } from "@/lib/places/client";
import { createClient } from "@/lib/supabase/server";
import { removeCandidateAction } from "./actions";

export const dynamic = "force-dynamic";

const SCAN_STATUS = { running: "In corso", succeeded: "Completata", failed: "Non riuscita" } as const;

export default async function SearchPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const [{ data: scans }, { data: candidates }] = await Promise.all([
    supabase
      .from("scan_runs")
      .select("id, category, region, status, found_count, duplicate_count, started_at")
      .order("started_at", { ascending: false })
      .limit(8),
    supabase
      .from("lead_candidates")
      .select("id, google_place_id, search_category, search_location, search_region, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const candidatePlaces = new Map<string, Awaited<ReturnType<typeof getGooglePlaceSummary>>>();
  if (isPlacesConfigured()) {
    const hydrated = await Promise.all((candidates ?? []).map(async (candidate) => {
      try {
        return [candidate.google_place_id, await getGooglePlaceSummary(candidate.google_place_id)] as const;
      } catch {
        return [candidate.google_place_id, null] as const;
      }
    }));
    hydrated.forEach(([placeId, place]) => candidatePlaces.set(placeId, place));
  }

  return (
    <AppShell active="search" eyebrow="Discovery" title="Ricerca lead" viewer={viewer}>
      <DiscoverySearch configured={isPlacesConfigured()} />
      <section className="panel candidate-panel">
        <div className="panel-header"><div><p className="eyebrow">Selezione</p><h2>Shortlist condivisa</h2></div><span className="result-count">{candidates?.length ?? 0} candidati</span></div>
        {candidates?.length ? <div className="candidate-list">{candidates.map((candidate) => {
          const place = candidatePlaces.get(candidate.google_place_id);
          const mapsUrl = place?.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(candidate.google_place_id)}`;
          return (
            <article className="candidate-row" key={candidate.id}>
              <span className="entity-icon"><Bookmark size={16} /></span>
              <div className="candidate-main">
                <strong>{place?.displayName.text || "Attività non disponibile"}</strong>
                <span>{place?.formattedAddress || `${candidate.search_location}, ${candidate.search_region}`}</span>
                <small>{candidate.search_category} · salvato {formatDate(candidate.created_at)}</small>
                {place?.attributions?.length ? <span className="place-attributions">{place.attributions.map((attribution, index) => attribution.providerUri ? <a href={attribution.providerUri} target="_blank" rel="noreferrer" key={`${attribution.provider}-${index}`}>{attribution.provider}</a> : <span key={`${attribution.provider}-${index}`}>{attribution.provider}</span>)}</span> : null}
              </div>
              <Link className="icon-button" href={`/search/candidates/${candidate.id}`} title="Verifica e crea lead" aria-label="Verifica e crea lead"><ChevronRight size={16} /></Link>
              <a className="icon-button" href={mapsUrl} target="_blank" rel="noreferrer" title="Apri in Google Maps" aria-label="Apri in Google Maps"><ExternalLink size={16} /></a>
              <form action={removeCandidateAction}><input type="hidden" name="candidateId" value={candidate.id} /><button className="icon-button danger-icon" type="submit" title="Rimuovi dalla shortlist" aria-label="Rimuovi dalla shortlist"><Trash2 size={16} /></button></form>
            </article>
          );
        })}<footer className="candidate-attribution"><span className="google-maps-attribution" translate="no">Google Maps</span></footer></div> : <div className="empty-state compact candidate-empty"><Bookmark size={22} /><strong>Shortlist vuota</strong><p>Salva i risultati più interessanti per ritrovarli qui.</p></div>}
      </section>
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
