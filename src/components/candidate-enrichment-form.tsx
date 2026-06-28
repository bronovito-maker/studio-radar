"use client";

import { useActionState } from "react";
import { ExternalLink, SearchCheck, Sparkles } from "lucide-react";
import {
  confirmCandidateAction,
  enrichCandidateAction,
  type CandidateEnrichmentState,
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
};

const INITIAL_STATE: CandidateEnrichmentState = { status: "idle" };

export function CandidateEnrichmentForm({ candidateId, canManage, initial }: CandidateEnrichmentFormProps) {
  const [state, enrichAction] = useActionState(enrichCandidateAction, INITIAL_STATE);
  const values = state.data ?? { ...initial, confidence: 0, missingEvidence: [], sources: [] };

  return (
    <div className="candidate-enrichment-stack">
      {canManage && initial.websiteUrl ? (
        <form className="candidate-ai-action" action={enrichAction}>
          <input type="hidden" name="candidateId" value={candidateId} />
          <div><strong>Compilazione assistita</strong><span>OpenAI consulta soltanto il sito ufficiale e restituisce fonti verificabili.</span></div>
          <SubmitButton className="secondary-button" pendingLabel="Analisi del sito..."><Sparkles size={16} /> Compila con OpenAI</SubmitButton>
        </form>
      ) : null}

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
          <label className="field"><span>Nome attività</span><input name="businessName" defaultValue={values.businessName} required minLength={2} maxLength={200} /></label>
          <label className="field"><span>Categoria</span><input name="category" defaultValue={values.category} maxLength={200} /></label>
          <label className="field"><span>Città</span><input name="city" defaultValue={values.city} maxLength={120} /></label>
          <label className="field"><span>Regione</span><input name="region" defaultValue={values.region} maxLength={120} /></label>
          <label className="field"><span>Telefono</span><input name="phone" type="tel" defaultValue={values.phone} maxLength={60} /></label>
          <label className="field"><span>Email</span><input name="email" type="email" defaultValue={values.email} maxLength={254} /></label>
          <label className="field field-span"><span>Indirizzo</span><input name="address" defaultValue={values.address} maxLength={300} /></label>
          <label className="field field-span"><span>Sito ufficiale</span><input name="websiteUrl" type="url" defaultValue={values.websiteUrl} maxLength={2048} /></label>
          <label className="field"><span>Valore stimato</span><input name="estimatedValue" type="number" min="0" max="10000000" step="100" defaultValue="0" /></label>
          <label className="check-field"><input name="hasBooking" type="checkbox" defaultChecked={values.hasBooking} /><span>Booking online verificato</span></label>
        </div>

        {state.data?.sources.length ? <div className="candidate-sources"><strong>Fonti ufficiali</strong>{state.data.sources.map((source) => <a href={source} target="_blank" rel="noreferrer" key={source}>{new URL(source).pathname || "/"} <ExternalLink size={12} /></a>)}</div> : null}
        {state.data?.missingEvidence.length ? <p className="form-note">Da verificare manualmente: {state.data.missingEvidence.join(" · ")}</p> : null}

        {canManage ? <div className="form-actions"><SubmitButton pendingLabel="Creazione lead..." className="primary-button"><SearchCheck size={16} /> Conferma e crea lead</SubmitButton></div> : null}
      </form>
      {!canManage ? <p className="form-note">Solo chi ha salvato il candidato o un amministratore può convertirlo.</p> : null}
    </div>
  );
}
