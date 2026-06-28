"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Mail, MessageCircle, Send, Sparkles } from "lucide-react";
import {
  generateOutreachDraftAction,
  recordManualOutreachAction,
  sendLeadEmailAction,
  type OutreachDraftState,
} from "@/app/leads/actions";
import { SubmitButton } from "@/components/submit-button";

const INITIAL_STATE: OutreachDraftState = { status: "idle" };

function whatsappNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("00") ? digits.slice(2) : digits;
}

export function OutreachComposer({ leadId, businessName, initialPhone, initialEmail, emailEnabled, emailSuppressed }: {
  leadId: string;
  businessName: string;
  initialPhone: string;
  initialEmail: string;
  emailEnabled: boolean;
  emailSuppressed: boolean;
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
        initialEmail={initialEmail}
        initialMessage={initialMessage}
        cautions={state.cautions ?? []}
        emailEnabled={emailEnabled}
        emailSuppressed={emailSuppressed}
        businessName={businessName}
      />
    </div>
  );
}

function OutreachEditor({ leadId, initialPhone, initialEmail, initialMessage, cautions, emailEnabled, emailSuppressed, businessName }: {
  leadId: string;
  initialPhone: string;
  initialEmail: string;
  initialMessage: string;
  cautions: string[];
  emailEnabled: boolean;
  emailSuppressed: boolean;
  businessName: string;
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
    <div className="outreach-channels">
      <form className="outreach-record" action={recordManualOutreachAction}>
        <div className="channel-heading"><MessageCircle size={17} /><strong>WhatsApp</strong></div>
        <input type="hidden" name="leadId" value={leadId} />
        <label className="field"><span>Numero WhatsApp con prefisso internazionale</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="es. +39 333 1234567" /></label>
        <label className="field"><span>Messaggio</span><textarea name="message" rows={9} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        {cautions.length ? <p className="form-note">Controlla: {cautions.join(" · ")}</p> : null}
        <div className="outreach-actions">
          {whatsappUrl ? <a className="primary-button" href={whatsappUrl} target="_blank" rel="noreferrer"><MessageCircle size={16} /> Apri WhatsApp <ExternalLink size={13} /></a> : <span className="secondary-button disabled-control" aria-disabled="true"><MessageCircle size={16} /> Apri WhatsApp</span>}
          <SubmitButton className="secondary-button" pendingLabel="Registrazione..."><CheckCircle2 size={16} /> Segna come contattato</SubmitButton>
        </div>
      </form>

      <form className="outreach-record email-record" action={sendLeadEmailAction}>
        <div className="channel-heading"><Mail size={17} /><strong>Email con Brevo</strong></div>
        <input type="hidden" name="leadId" value={leadId} />
        <label className="field"><span>Destinatario</span><input value={initialEmail || "Email non disponibile"} readOnly /></label>
        <label className="field"><span>Oggetto</span><input name="subject" minLength={2} maxLength={200} defaultValue={`Due spunti per ${businessName}`} /></label>
        <label className="field"><span>Messaggio</span><textarea name="message" rows={9} maxLength={9000} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
        <p className="form-note">Il CRM aggiunge automaticamente la possibilità di non ricevere altri messaggi.</p>
        <div className="outreach-actions">
          {emailEnabled && initialEmail && !emailSuppressed
            ? <SubmitButton pendingLabel="Invio con Brevo..."><Send size={16} /> Approva e invia email</SubmitButton>
            : <span className="secondary-button disabled-control" aria-disabled="true"><Mail size={16} /> {emailSuppressed ? "Contatto email sospeso" : "Email non configurata"}</span>}
        </div>
      </form>
    </div>
  );
}
