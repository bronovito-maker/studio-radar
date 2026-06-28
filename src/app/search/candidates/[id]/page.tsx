import { ArrowLeft, ExternalLink, Globe, MapPin, SearchCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { CandidateEnrichmentForm } from "@/components/candidate-enrichment-form";
import { requireViewer } from "@/lib/auth";
import { getGooglePlaceSummary } from "@/lib/places/client";
import { createClient } from "@/lib/supabase/server";

type CandidatePageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function CandidatePage({ params, searchParams }: CandidatePageProps) {
  const viewer = await requireViewer();
  const { id } = await params;
  const feedback = await searchParams;
  const supabase = await createClient();
  const { data: candidate, error } = await supabase
    .from("lead_candidates")
    .select("id, google_place_id, search_category, search_location, search_region, created_by")
    .eq("id", id)
    .single();
  if (error || !candidate) notFound();

  let place: Awaited<ReturnType<typeof getGooglePlaceSummary>> = null;
  try {
    place = await getGooglePlaceSummary(candidate.google_place_id);
  } catch {
    // The manual confirmation path remains available if Places is temporarily unavailable.
  }
  const canManage = candidate.created_by === viewer.id || viewer.role === "admin";
  const mapsUrl = place?.googleMapsUri || `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(candidate.google_place_id)}`;

  return (
    <AppShell active="search" eyebrow="Verifica candidato" title="Crea lead" viewer={viewer} actions={<Link className="secondary-button" href="/search"><ArrowLeft size={16} /> Torna alla ricerca</Link>}>
      {feedback.error ? <div className="alert alert-error" role="alert">{feedback.error}</div> : null}
      <div className="candidate-review-grid">
        <section className="panel candidate-review-main">
          <div className="panel-header"><div><p className="eyebrow">Dati da confermare</p><h2>Profilo CRM</h2></div><SearchCheck size={19} /></div>
          <p className="muted-copy">I campi salvati nel CRM devono provenire dal sito ufficiale o dalla tua verifica manuale. I contenuti mostrati da Google restano effimeri.</p>
          <CandidateEnrichmentForm
            candidateId={candidate.id}
            canManage={canManage}
            initial={{
              businessName: "",
              category: candidate.search_category,
              city: candidate.search_location,
              region: candidate.search_region,
              phone: "",
              email: "",
              address: "",
              websiteUrl: place?.websiteUri ?? "",
              hasBooking: false,
            }}
            googleReference={{
              businessName: place?.displayName.text ?? "",
              address: place?.formattedAddress ?? "",
              phone: place?.nationalPhoneNumber ?? "",
              websiteUrl: place?.websiteUri ?? "",
            }}
          />
        </section>

        <aside className="panel candidate-live-summary">
          <div className="panel-header"><div><p className="eyebrow">Riferimento live</p><h2>Google Maps</h2></div></div>
          <strong>{place?.displayName.text || "Attività non disponibile"}</strong>
          <p><MapPin size={15} /> {place?.formattedAddress || `${candidate.search_location}, ${candidate.search_region}`}</p>
          {place?.websiteUri ? <a href={place.websiteUri} target="_blank" rel="noreferrer"><Globe size={14} /> Apri sito ufficiale <ExternalLink size={12} /></a> : <span className="muted-copy">Sito ufficiale non disponibile</span>}
          <a href={mapsUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> Apri Google Maps <ExternalLink size={12} /></a>
          {place?.attributions?.length ? <div className="place-attributions">{place.attributions.map((attribution, index) => attribution.providerUri ? <a href={attribution.providerUri} target="_blank" rel="noreferrer" key={`${attribution.provider}-${index}`}>{attribution.provider}</a> : <span key={`${attribution.provider}-${index}`}>{attribution.provider}</span>)}</div> : null}
          <div className="google-maps-attribution" translate="no">Google Maps</div>
        </aside>
      </div>
    </AppShell>
  );
}
