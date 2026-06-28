"use client";

import { useActionState } from "react";
import { ExternalLink, LoaderCircle, MapPin, Radar, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  searchPlacesAction,
  type DiscoveryResult,
  type DiscoverySearchState,
} from "@/app/search/actions";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import { ShortlistButton } from "@/components/shortlist-button";

const REGIONS = ["Emilia-Romagna", "Toscana", "Lombardia"] as const;
const INITIAL_STATE: DiscoverySearchState = { status: "idle", results: [] };

function gradeLabel(grade: DiscoveryResult["score"]["grade"]) {
  return grade === "priority" ? "Prioritario" : grade === "hot" ? "Buono" : grade === "warm" ? "Tiepido" : "Freddo";
}

const SERVICE_LABELS = {
  "sito-nuovo": "Sito nuovo",
  "restyling-sito": "Restyling sito",
  "booking-conversione": "Booking e conversione",
  automazioni: "Automazioni",
} as const;

const NEXT_ACTION_LABELS = {
  contact_now: "Contattabile",
  manual_verify: "Da verificare",
  enrich_data: "Da arricchire",
  ignore: "Non prioritario",
} as const;

export function DiscoverySearch({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(searchPlacesAction, INITIAL_STATE);

  return (
    <section className="discovery-workspace">
      <form className="panel discovery-form" action={action}>
        <div className="panel-header">
          <div><p className="eyebrow">Ricerca live</p><h2>Trova attività</h2></div>
          <span className={`integration-state ${configured ? "ready" : "waiting"}`}>
            {configured ? <ShieldCheck size={15} /> : <Radar size={15} />}
            {configured ? "Places connesso" : "Chiave da configurare"}
          </span>
        </div>
        <div className="discovery-fields">
          <label className="field"><span>Categoria</span><select name="category" defaultValue={DISCOVERY_CATEGORIES[0]}>{DISCOVERY_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
          <label className="field"><span>Città o zona</span><input name="location" placeholder="es. Bologna" required minLength={2} maxLength={100} /></label>
          <label className="field"><span>Regione</span><select name="region" defaultValue="Emilia-Romagna">{REGIONS.map((region) => <option key={region} value={region}>{region}</option>)}</select></label>
          <label className="field discovery-limit"><span>Risultati</span><select name="pageSize" defaultValue="10"><option value="5">5</option><option value="10">10</option><option value="20">20</option></select></label>
          <button className="primary-button discovery-submit" type="submit" disabled={pending || !configured}>
            {pending ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />}
            {pending ? "Ricerca..." : "Cerca"}
          </button>
        </div>
        {!configured ? <p className="form-note">Aggiungi <code>GOOGLE_PLACES_API_KEY</code> a <code>.env.local</code>, poi riavvia il server locale.</p> : null}
      </form>

      {state.status === "error" ? <div className="alert alert-error" role="alert">{state.message}</div> : null}
      {state.status === "success" && !state.results.length ? <div className="empty-state discovery-empty"><Search size={24} /><strong>Nessun risultato</strong><p>Prova una zona più ampia o una categoria diversa.</p></div> : null}

      {state.results.length ? (
        <section className="panel discovery-results" aria-live="polite">
          <div className="panel-header">
            <div><p className="eyebrow">Risultati live</p><h2>{state.results.length} attività trovate</h2></div>
            <span className="muted-copy">{state.query?.location}, {state.query?.region}</span>
          </div>
          <div className="discovery-list">
            {state.results.map((result) => (
              <article className="discovery-row" key={result.placeId}>
                <div className="discovery-main">
                  <div className="discovery-title">
                    <strong>{result.businessName}</strong>
                    {result.duplicateLeadId ? <Link className="duplicate-badge" href={`/leads/${result.duplicateLeadId}`}>Già nel CRM</Link> : null}
                  </div>
                  <span className="discovery-category">{result.category}</span>
                  <p><MapPin size={14} /> {result.address || [result.city, result.region].filter(Boolean).join(", ")}</p>
                  <div className="discovery-links">
                    {result.phone ? <a href={`tel:${result.phone}`}>{result.phone}</a> : <span>Telefono non disponibile</span>}
                    {result.websiteUrl ? <a href={result.websiteUrl} target="_blank" rel="noreferrer">Sito web <ExternalLink size={13} /></a> : <span>Nessun sito</span>}
                    {result.googleMapsUri ? <a href={result.googleMapsUri} target="_blank" rel="noreferrer">Google Maps <ExternalLink size={13} /></a> : null}
                  </div>
                  {result.attributions.length ? <p className="place-attributions">{result.attributions.map((attribution, index) => attribution.providerUri ? <a href={attribution.providerUri} target="_blank" rel="noreferrer" key={`${attribution.provider}-${index}`}>{attribution.provider}</a> : <span key={`${attribution.provider}-${index}`}>{attribution.provider}</span>)}</p> : null}
                </div>
                <div className="discovery-reputation"><strong>{result.rating ? result.rating.toFixed(1) : "—"}</strong><span>{result.reviewCount?.toLocaleString("it-IT") ?? 0} recensioni</span></div>
                <div className="discovery-score">
                  <span className={`score-pill score-pill-${result.score.grade}`}>{result.score.opportunityScore}</span>
                  <strong>{gradeLabel(result.score.grade)}</strong>
                  <span>{result.score.recommendedService ? SERVICE_LABELS[result.score.recommendedService] : "Nessuna offerta"}</span>
                  <small>{NEXT_ACTION_LABELS[result.score.nextAction]} · confidenza {result.score.confidence}%</small>
                </div>
                {!result.duplicateLeadId && state.query ? <ShortlistButton placeId={result.placeId} category={state.query.category} location={state.query.location} region={state.query.region} shortlisted={result.shortlisted} /> : null}
              </article>
            ))}
          </div>
          <footer className="google-disclosure">
            <span className="google-maps-attribution" translate="no">Google Maps</span>
            <details><summary>Informazioni sui risultati</summary><p>Google fornisce i risultati della ricerca. Studio Radar li riordina per opportunity score e confidenza, mantenendo separati i dati da verificare.</p></details>
          </footer>
        </section>
      ) : null}
    </section>
  );
}
