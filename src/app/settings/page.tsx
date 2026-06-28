import { CalendarCheck, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
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
    .select("booking_url, default_score_threshold")
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
