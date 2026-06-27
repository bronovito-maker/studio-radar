import { ChevronRight, Download, FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireViewer } from "@/lib/auth";
import { formatDate } from "@/lib/crm";
import { createClient } from "@/lib/supabase/server";
import { uploadCsv } from "./actions";

type ImportPageProps = { searchParams: Promise<{ error?: string; success?: string }> };

const STATUS_LABELS = {
  uploaded: "Da mappare",
  previewed: "In anteprima",
  completed: "Completato",
  failed: "Non riuscito",
};

export default async function ImportPage({ searchParams }: ImportPageProps) {
  const viewer = await requireViewer();
  const feedback = await searchParams;
  const supabase = await createClient();
  const { data: imports } = await supabase
    .from("lead_imports")
    .select("id, filename, status, total_count, imported_count, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <AppShell active="import" eyebrow="Import e deduplica" title="Importa lead" viewer={viewer}>
      {feedback.error ? <div className="alert alert-error" role="alert">{feedback.error}</div> : null}
      {feedback.success ? <div className="alert alert-success" role="status">{feedback.success}</div> : null}

      <section className="import-layout">
        <article className="form-panel import-upload-panel">
          <div className="section-heading">
            <h2>Carica CSV</h2>
            <p>Massimo 500 righe e 2 MB. La prima riga deve contenere intestazioni univoche.</p>
            <Link className="text-link template-link" href="/templates/studio-radar-import.csv" download>
              <Download size={15} aria-hidden="true" /> Scarica modello CSV
            </Link>
          </div>
          <form className="upload-form" action={uploadCsv}>
            <label className="file-drop">
              <Upload size={24} aria-hidden="true" />
              <strong>Seleziona un file CSV</strong>
              <span>Virgola, punto e virgola e tab sono supportati.</span>
              <input name="file" type="file" accept=".csv,text/csv" required />
            </label>
            <SubmitButton pendingLabel="Caricamento...">Carica e continua</SubmitButton>
          </form>
        </article>

        <article className="panel import-history">
          <div className="panel-header"><div><p className="eyebrow">Cronologia</p><h2>Import recenti</h2></div></div>
          {imports?.length ? <div className="import-list">{imports.map((item) => (
            <Link className="import-row" href={`/import/${item.id}`} key={item.id}>
              <span className="entity-icon"><FileSpreadsheet size={17} /></span>
              <span className="recent-main"><strong>{item.filename}</strong><span>{item.total_count} righe · {formatDate(item.created_at)}</span></span>
              <span className={`import-status import-status-${item.status}`}>{STATUS_LABELS[item.status]}</span>
              <ChevronRight size={17} aria-hidden="true" />
            </Link>
          ))}</div> : <div className="empty-state compact"><FileSpreadsheet size={24} /><strong>Nessun import</strong><p>I file caricati appariranno qui.</p></div>}
        </article>
      </section>
    </AppShell>
  );
}
