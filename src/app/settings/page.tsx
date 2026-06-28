import { CalendarCheck, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import { createClient } from "@/lib/supabase/server";
import { updateSettingsAction } from "./actions";

type SettingsPageProps = {
  searchParams: Promise<{ error?: string; success?: string }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const viewer = await requireAdmin();
  const feedback = await searchParams;
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("settings")
    .select("booking_url, default_score_threshold, cron_enabled, cron_category, cron_location, cron_region, cron_schedule")
    .eq("id", 1)
    .single();

  return (
    <AppShell active="settings" eyebrow="Amministrazione" title="Impostazioni" viewer={viewer}>
      {feedback.error ? <div className="alert alert-error" role="alert">{feedback.error}</div> : null}
      {feedback.success ? <div className="alert alert-success" role="status">{feedback.success}</div> : null}
      <div className="settings-grid">
        <section className="panel settings-form-panel">
          <div className="panel-header"><div><p className="eyebrow">Configurazione commerciale</p><h2>Outreach e scoring</h2></div><CalendarCheck size={19} /></div>
          <form className="settings-form" action={updateSettingsAction}>
            <label className="field"><span>Booking URL globale</span><input name="bookingUrl" type="url" maxLength={2048} defaultValue={settings?.booking_url ?? ""} placeholder="https://calendly.com/..." /><small>Viene aggiunto alle bozze WhatsApp quando configurato.</small></label>
            <label className="field"><span>Soglia qualificazione</span><input name="scoreThreshold" type="number" min="0" max="100" defaultValue={settings?.default_score_threshold ?? 65} /><small>I lead nuovi raggiungono lo stato qualificato da questa soglia.</small></label>
            <div className="settings-section-heading"><strong>Discovery automatica</strong><span>Una scansione controllata ogni notte alle 03:00 UTC.</span></div>
            <label className="check-field"><input name="cronEnabled" type="checkbox" defaultChecked={settings?.cron_enabled ?? false} /><span>Abilita scansione notturna</span></label>
            <div className="form-grid two-columns">
              <label className="field"><span>Categoria</span><select name="cronCategory" defaultValue={settings?.cron_category ?? DISCOVERY_CATEGORIES[0]}>{DISCOVERY_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
              <label className="field"><span>Città o zona</span><input name="cronLocation" minLength={2} maxLength={100} defaultValue={settings?.cron_location ?? "Bologna"} /></label>
              <label className="field"><span>Regione</span><select name="cronRegion" defaultValue={settings?.cron_region ?? "Emilia-Romagna"}><option>Emilia-Romagna</option><option>Toscana</option><option>Lombardia</option></select></label>
              <label className="field"><span>Schedule</span><input value={settings?.cron_schedule ?? "0 3 * * *"} readOnly /><small>Configurata su Vercel in UTC.</small></label>
            </div>
            <div className="form-actions"><SubmitButton pendingLabel="Salvataggio..."><Save size={16} /> Salva impostazioni</SubmitButton></div>
          </form>
        </section>
        <aside className="panel settings-security">
          <ShieldCheck size={22} />
          <div><strong>Configurazione protetta</strong><p>Questa pagina è disponibile solo agli amministratori. Le chiavi API restano nelle variabili server e non sono mostrate nell’interfaccia.</p></div>
        </aside>
      </div>
    </AppShell>
  );
}
