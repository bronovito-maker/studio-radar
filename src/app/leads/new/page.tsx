import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireViewer } from "@/lib/auth";
import { REGIONS } from "@/lib/crm";
import { createLead } from "../actions";

type NewLeadPageProps = { searchParams: Promise<{ error?: string }> };

export default async function NewLeadPage({ searchParams }: NewLeadPageProps) {
  const viewer = await requireViewer();
  const { error } = await searchParams;

  return (
    <AppShell active="leads" eyebrow="Inserimento manuale" title="Nuovo lead" viewer={viewer} actions={<Link className="secondary-button" href="/leads"><ArrowLeft size={16} /> Torna ai lead</Link>}>
      <section className="form-panel">
        <div className="section-heading">
          <h2>Dati essenziali</h2>
          <p>Parti dalle informazioni verificabili. Potrai completare il profilo in seguito.</p>
        </div>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
        <form className="lead-form" action={createLead}>
          <label className="field field-wide"><span>Nome attività *</span><input name="businessName" required minLength={2} maxLength={160} autoFocus /></label>
          <label className="field"><span>Città</span><input name="city" maxLength={300} /></label>
          <label className="field"><span>Regione</span><select name="region" defaultValue=""><option value="">Seleziona</option>{REGIONS.map((region) => <option value={region} key={region}>{region}</option>)}</select></label>
          <label className="field field-wide"><span>Categoria</span><input name="category" maxLength={300} placeholder="Es. Hotel, studio dentistico, centro estetico" /></label>
          <label className="field"><span>Telefono</span><input name="phone" type="tel" maxLength={40} /></label>
          <label className="field"><span>Email</span><input name="email" type="email" maxLength={254} /></label>
          <label className="field field-wide"><span>Sito web</span><input name="websiteUrl" type="url" maxLength={500} placeholder="https://" /></label>
          <label className="field"><span>Valore stimato</span><div className="input-prefix"><span>€</span><input name="estimatedValue" type="number" min="0" max="10000000" step="50" defaultValue="0" /></div></label>
          <div className="form-actions field-wide"><Link className="secondary-button" href="/leads">Annulla</Link><SubmitButton pendingLabel="Creazione...">Crea lead</SubmitButton></div>
        </form>
      </section>
    </AppShell>
  );
}
