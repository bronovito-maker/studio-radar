"use client";

import { useState } from "react";
import { ShieldX } from "lucide-react";
import { anonymizeLeadAction } from "@/app/leads/actions";
import { SubmitButton } from "@/components/submit-button";

export function AnonymizeLeadForm({ leadId }: { leadId: string }) {
  const [confirmed, setConfirmed] = useState(false);

  return (
    <form className="anonymize-form" action={anonymizeLeadAction}>
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="confirmation" value={confirmed ? "ANONIMIZZA" : ""} />
      <label className="check-field"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Confermo la rimozione irreversibile dei dati</span></label>
      <SubmitButton className="danger-button" pendingLabel="Anonimizzazione..."><ShieldX size={16} /> Anonimizza lead</SubmitButton>
    </form>
  );
}
