"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, MessageCircle, Sparkles } from "lucide-react";
import {
  generateOutreachDraftAction,
  recordManualOutreachAction,
  type OutreachDraftState,
} from "@/app/leads/actions";
import { SubmitButton } from "@/components/submit-button";

const INITIAL_STATE: OutreachDraftState = { status: "idle" };

function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

export function OutreachComposer({ leadId, businessName, initialPhone }: {
  leadId: string;
  businessName: string;
  initialPhone: string;
}) {
  const [state, generateAction] = useActionState(generateOutreachDraftAction, INITIAL_STATE);
  const initialMessage = state.message ?? `Buongiorno, vorrei condividere un paio di osservazioni sulla presenza digitale di ${businessName}.`;

  return (
    <div className="outreach-composer">
      <form className="outreach-generate" action={generateAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <div><strong>Bozza assistita</strong><span>OpenAI usa soltanto i dati e le evidenze già presenti nel CRM.</span></div>
        <SubmitButton className="secondary-button" pendingLabel="Generazione..."><Sparkles size={16} /> Genera bozza</SubmitButton>
      </form>

      {state.status === "error" ? <div className="alert alert-error" role="alert">{state.message}</div> : null}
      {state.status === "ready" ? <div className="outreach-draft-meta" role="status"><Sparkles size={15} /><span>{state.provider === "openai" ? "Bozza OpenAI" : "Template di sicurezza"} · confidenza {Math.round((state.confidence ?? 0) * 100)}%</span></div> : null}

      <OutreachEditor
        key={initialMessage}
        leadId={leadId}
        initialPhone={initialPhone}
        initialMessage={initialMessage}
        cautions={state.cautions ?? []}
      />
    </div>
  );
}

function OutreachEditor({ leadId, initialPhone, initialMessage, cautions }: {
  leadId: string;
  initialPhone: string;
  initialMessage: string;
  cautions: string[];
}) {
  const [phone, setPhone] = useState(initialPhone);
  const [message, setMessage] = useState(initialMessage);
  const normalizedPhone = whatsappNumber(phone);
  const whatsappUrl = useMemo(
    () => normalizedPhone && message.trim().length >= 10
      ? `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message.trim())}`
      : null,
    [message, normalizedPhone],
  );

  return (
    <form className="outreach-record" action={recordManualOutreachAction}>
        <input type="hidden" name="leadId" value={leadId} />
        <label className="field"><span>Numero WhatsApp con prefisso internazionale</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="es. +39 333 1234567" /></label>
        <label className="field"><span>Messaggio</span><textarea name="message" rows={9} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        {cautions.length ? <p className="form-note">Controlla: {cautions.join(" · ")}</p> : null}
        <div className="outreach-actions">
          {whatsappUrl ? <a className="primary-button" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Apri WhatsApp <ExternalLink size={13} /></a> : <span className="secondary-button disabled-control" aria-disabled="true"><MessageCircle size={16} /> Apri WhatsApp</span>}
          <SubmitButton className="secondary-button" pendingLabel="Registrazione..."><CheckCircle2 size={16} /> Segna come contattato</SubmitButton>
        </div>
    </form>
  );
}
