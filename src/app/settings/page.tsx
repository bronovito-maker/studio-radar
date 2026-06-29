import { CalendarCheck, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireAdmin } from "@/lib/auth";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import { createClient } from "@/lib/supabase/server";
import { isBrevoConfigured } from "@/lib/brevo";
import { REGIONS } from "@/lib/crm";
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
    .select("booking_url, default_score_threshold, cron_enabled, cron_category, cron_location, cron_region, cron_schedule, cron_page_size, email_enabled, email_sender_name, email_sender_email, email_reply_to, email_daily_limit, email_follow_up_enabled, email_follow_up_delays, email_auto_outreach_enabled")
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
            <div className="settings-section-heading"><strong>Email Brevo</strong><span>Invio approvato, tracking e follow-up controllati.</span></div>
            <div className={`integration-state ${isBrevoConfigured() ? "ready" : "waiting"}`}><span className="status-dot" /><div><strong>{isBrevoConfigured() ? "Chiavi server configurate" : "Configurazione server incompleta"}</strong><small>Servono BREVO_API_KEY e BREVO_WEBHOOK_TOKEN; i valori non vengono mostrati.</small></div></div>
            <label className="check-field"><input name="emailEnabled" type="checkbox" defaultChecked={settings?.email_enabled ?? false} /><span>Abilita invio email dal CRM</span></label>
            <div className="form-grid two-columns">
              <label className="field"><span>Nome mittente</span><input name="emailSenderName" minLength={1} maxLength={120} defaultValue={settings?.email_sender_name ?? "Studio Radar"} /></label>
              <label className="field"><span>Email mittente verificata</span><input name="emailSenderEmail" type="email" maxLength={254} defaultValue={settings?.email_sender_email ?? ""} placeholder="contatti@dominio.it" /></label>
              <label className="field"><span>Reply-to</span><input name="emailReplyTo" type="email" maxLength={254} defaultValue={settings?.email_reply_to ?? ""} placeholder="risposte@dominio.it" /></label>
              <label className="field"><span>Limite giornaliero</span><input name="emailDailyLimit" type="number" min="1" max="300" defaultValue={settings?.email_daily_limit ?? 60} /></label>
            </div>
            <label className="check-field"><input name="emailFollowUpEnabled" type="checkbox" defaultChecked={settings?.email_follow_up_enabled ?? false} /><span>Programma tre follow-up automatici</span></label>
            <div className="form-grid three-columns">
              {(settings?.email_follow_up_delays ?? [3, 6, 9]).map((day, index) => <label className="field" key={index}><span>Follow-up {index + 1} (giorni)</span><input name={`followUpDay${index + 1}`} type="number" min="1" max="30" defaultValue={day} /></label>)}
            </div>
            <div className="settings-section-heading"><strong>Discovery automatica</strong><span>Una scansione controllata ogni notte alle 03:00 UTC.</span></div>
            <label className="check-field"><input name="cronEnabled" type="checkbox" defaultChecked={settings?.cron_enabled ?? false} /><span>Abilita scansione notturna</span></label>
            <div className="form-grid two-columns">
              <label className="field"><span>Categoria</span><select name="cronCategory" defaultValue={settings?.cron_category ?? DISCOVERY_CATEGORIES[0]}>{DISCOVERY_CATEGORIES.map((category) => <option value={category} key={category}>{category}</option>)}</select></label>
              <label className="field"><span>Città o zona</span><input name="cronLocation" minLength={2} maxLength={100} defaultValue={settings?.cron_location ?? "Bologna"} /></label>
              <label className="field"><span>Regione</span><select name="cronRegion" defaultValue={settings?.cron_region ?? ""}><option value="">Qualsiasi regione</option>{REGIONS.map((region) => <option value={region} key={region}>{region}</option>)}</select></label>
              <label className="field"><span>Risultati per notte</span><input name="cronPageSize" type="number" min="1" max="50" defaultValue={settings?.cron_page_size ?? 20} /><small>Max 20 per chiamata Google; il sistema usa più query per raggiungere il target.</small></label>
              <label className="field"><span>Schedule</span><input value={settings?.cron_schedule ?? "0 3 * * *"} readOnly /><small>Configurata su Vercel in UTC.</small></label>
            </div>
            <label className="check-field"><input name="emailAutoOutreachEnabled" type="checkbox" defaultChecked={settings?.email_auto_outreach_enabled ?? false} /><span>Prepara automaticamente bozze email in coda (l’invio richiede sempre approvazione manuale)</span></label>
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
