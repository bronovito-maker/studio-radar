"use client";

import { useActionState, useEffect, useRef } from "react";
import { CircleAlert, CircleCheck, CircleHelp, ExternalLink, SearchCheck, Sparkles } from "lucide-react";
import {
  confirmCandidateAction,
  enrichCandidateAction,
  type CandidateEnrichmentState,
  type CandidateFieldKey,
} from "@/app/search/actions";
import { SubmitButton } from "@/components/submit-button";

type CandidateEnrichmentFormProps = {
  candidateId: string;
  canManage: boolean;
  initial: {
    businessName: string;
    category: string;
    city: string;
    region: string;
    phone: string;
    email: string;
    address: string;
    websiteUrl: string;
    hasBooking: boolean;
  };
  googleReference: {
    businessName: string;
    address: string;
    phone: string;
    websiteUrl: string;
  };
};

const INITIAL_STATE: CandidateEnrichmentState = { status: "idle" };

const FIELD_LABELS: Record<CandidateFieldKey, string> = {
  businessName: "Nome attività", category: "Categoria", city: "Città", region: "Regione",
  phone: "Telefono", email: "Email", address: "Indirizzo", websiteUrl: "Sito ufficiale",
  hasBooking: "Booking online",
};

function VerificationBadge({ source, ready, hasGoogleFallback }: { source?: string | null; ready: boolean; hasGoogleFallback?: boolean }) {
  if (!ready) return <span className="verification-badge pending"><CircleHelp size={12} /> Da controllare</span>;
  if (!source && hasGoogleFallback) return <span className="verification-badge pending"><CircleHelp size={12} /> Da controllare</span>;
  if (!source) return <span className="verification-badge missing"><CircleAlert size={12} /> Non trovato</span>;
  return <span className="verification-badge verified" title={`Fonte ufficiale: ${source}`}><CircleCheck size={12} /> Verificato</span>;
}

function FieldHeading({ field, state, hasGoogleFallback }: { field: CandidateFieldKey; state: CandidateEnrichmentState; hasGoogleFallback?: boolean }) {
  return <span className="candidate-field-heading"><span>{FIELD_LABELS[field]}</span><VerificationBadge ready={state.status === "ready"} source={state.data?.fieldSources[field]} hasGoogleFallback={hasGoogleFallback} /></span>;
}

function GoogleReference({ value }: { value?: string }) {
  return value ? <small className="google-field-reference"><span translate="no">Google</span>{value}</small> : null;
}

export function CandidateEnrichmentForm({ candidateId, canManage, initial, googleReference }: CandidateEnrichmentFormProps) {
  const [state, enrichAction] = useActionState(enrichCandidateAction, INITIAL_STATE);
  const enrichmentFormRef = useRef<HTMLFormElement>(null);
  const requestedRef = useRef(false);
  const values = state.data ? {
    ...state.data,
    businessName: state.data.businessName || initial.businessName,
    category: state.data.category || initial.category,
    city: state.data.city || initial.city,
    region: state.data.region || initial.region,
    phone: state.data.phone || initial.phone,
    address: state.data.address || initial.address,
    websiteUrl: state.data.websiteUrl || initial.websiteUrl,
  } : { ...initial, confidence: 0, missingEvidence: [], sources: [], fieldSources: {} as Record<CandidateFieldKey, null> };

  useEffect(() => {
    if (!canManage || !initial.websiteUrl || requestedRef.current) return;
    requestedRef.current = true;
    enrichmentFormRef.current?.requestSubmit();
  }, [canManage, initial.websiteUrl]);

  return (
    <div className="candidate-enrichment-stack">
      {canManage && initial.websiteUrl ? (
        <form className="candidate-ai-action" action={enrichAction} ref={enrichmentFormRef}>
          <input type="hidden" name="candidateId" value={candidateId} />
          <div><strong>{state.status === "idle" ? "Verifica automatica in corso" : "Compilazione assistita"}</strong><span>OpenAI consulta soltanto il sito ufficiale e restituisce fonti verificabili.</span></div>
          <SubmitButton className="secondary-button" pendingLabel="Analisi del sito..."><Sparkles size={16} /> {state.status === "ready" ? "Verifica di nuovo" : "Avvia verifica"}</SubmitButton>
        </form>
      ) : canManage ? <div className="candidate-google-prefill"><SearchCheck size={18} /><div><strong>Dati Google precompilati</strong><span>Non è disponibile un sito ufficiale da consultare. Controlla i campi evidenziati prima di creare il lead.</span></div></div> : null}

      {state.status === "error" ? <div className="alert alert-error" role="alert">{state.message}</div> : null}
      {state.status === "ready" ? (
        <div className="candidate-ai-result" role="status">
          <SearchCheck size={18} />
          <div><strong>Dati estratti dal sito ufficiale</strong><span>Confidenza {Math.round((state.data?.confidence ?? 0) * 100)}%. Controlla tutto prima di confermare.</span></div>
        </div>
      ) : null}

      <form className="candidate-confirm-form" action={confirmCandidateAction} key={`${state.status}-${values.businessName}`}>
        <input type="hidden" name="candidateId" value={candidateId} />
        <div className="form-grid two-columns">
          <label className="field"><FieldHeading field="businessName" state={state} hasGoogleFallback={Boolean(googleReference.businessName)} /><input name="businessName" defaultValue={values.businessName} required minLength={2} maxLength={200} /><GoogleReference value={googleReference.businessName} /></label>
          <label className="field"><FieldHeading field="category" state={state} hasGoogleFallback={Boolean(initial.category)} /><input name="category" defaultValue={values.category} maxLength={200} /></label>
          <label className="field"><FieldHeading field="city" state={state} hasGoogleFallback={Boolean(initial.city)} /><input name="city" defaultValue={values.city} maxLength={120} /></label>
          <label className="field"><FieldHeading field="region" state={state} hasGoogleFallback={Boolean(initial.region)} /><input name="region" defaultValue={values.region} maxLength={120} /></label>
          <label className="field"><FieldHeading field="phone" state={state} hasGoogleFallback={Boolean(googleReference.phone)} /><input name="phone" type="tel" defaultValue={values.phone} maxLength={60} /><GoogleReference value={googleReference.phone} /></label>
          <label className="field"><FieldHeading field="email" state={state} /><input name="email" type="email" defaultValue={values.email} maxLength={254} /></label>
          <label className="field field-span"><FieldHeading field="address" state={state} hasGoogleFallback={Boolean(googleReference.address)} /><input name="address" defaultValue={values.address} maxLength={300} /><GoogleReference value={googleReference.address} /></label>
          <label className="field field-span"><FieldHeading field="websiteUrl" state={state} hasGoogleFallback={Boolean(googleReference.websiteUrl)} /><input name="websiteUrl" type="url" defaultValue={values.websiteUrl} maxLength={2048} /><GoogleReference value={googleReference.websiteUrl} /></label>
          <label className="field"><span>Valore stimato</span><input name="estimatedValue" type="number" min="0" max="10000000" step="100" defaultValue="0" /></label>
          <label className="check-field"><input name="hasBooking" type="checkbox" defaultChecked={values.hasBooking} /><FieldHeading field="hasBooking" state={state} /></label>
        </div>

        {state.data?.sources.length ? <div className="candidate-sources"><strong>Fonti ufficiali</strong>{state.data.sources.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{new URL(source).pathname || "/"} <ExternalLink size={12} /></a>)}</div> : null}
        {state.data?.missingEvidence.length ? <p className="form-note">Da verificare manualmente: {state.data.missingEvidence.join(" · ")}</p> : null}

        {canManage ? <div className="form-actions"><SubmitButton pendingLabel="Creazione lead..." className="primary-button"><SearchCheck size={16} /> Conferma e crea lead</SubmitButton></div> : null}
      </form>
      {!canManage ? <p className="form-note">Solo chi ha salvato il candidato o un amministratore può convertirlo.</p> : null}
    </div>
  );
}
