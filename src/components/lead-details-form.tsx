"use client";

import { useState } from "react";
import { PencilLine } from "lucide-react";
import { updateLeadDetailsAction } from "@/app/leads/actions";
import { REGIONS } from "@/lib/crm";
import { SubmitButton } from "@/components/submit-button";

type LeadDetailsFormProps = {
  lead: {
    id: string;
    business_name: string;
    city: string | null;
    region: string | null;
    category: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    website_url: string | null;
    estimated_value: number;
  };
};

export function LeadDetailsForm({ lead }: LeadDetailsFormProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="lead-details-form">
      <button className="secondary-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <PencilLine size={16} />
        {open ? "Chiudi modifica" : "Modifica dati"}
      </button>

      {open ? (
        <form className="lead-form" action={updateLeadDetailsAction}>
          <input type="hidden" name="leadId" value={lead.id} />
          <label className="field field-wide"><span>Nome attività *</span><input name="businessName" required minLength={2} maxLength={160} defaultValue={lead.business_name} /></label>
          <label className="field"><span>Città</span><input name="city" maxLength={300} defaultValue={lead.city ?? ""} /></label>
          <label className="field"><span>Regione</span><input name="region" list="lead-region-options" maxLength={120} defaultValue={lead.region ?? ""} /><datalist id="lead-region-options">{REGIONS.map((region) => <option value={region} key={region} />)}</datalist></label>
          <label className="field field-wide"><span>Categoria</span><input name="category" maxLength={300} defaultValue={lead.category ?? ""} /></label>
          <label className="field field-wide"><span>Indirizzo</span><input name="address" maxLength={300} defaultValue={lead.address ?? ""} /></label>
          <label className="field"><span>Telefono</span><input name="phone" type="tel" maxLength={40} defaultValue={lead.phone ?? ""} /></label>
          <label className="field"><span>Email</span><input name="email" type="email" maxLength={254} defaultValue={lead.email ?? ""} /></label>
          <label className="field field-wide"><span>Sito web</span><input name="websiteUrl" type="url" maxLength={500} defaultValue={lead.website_url ?? ""} placeholder="https://" /></label>
          <label className="field"><span>Valore stimato</span><div className="input-prefix"><span>€</span><input name="estimatedValue" type="number" min="0" max="10000000" step="50" defaultValue={lead.estimated_value} /></div></label>
          <div className="form-actions field-wide"><SubmitButton pendingLabel="Salvataggio..." className="primary-button">Salva dati</SubmitButton></div>
        </form>
      ) : null}
    </div>
  );
}
