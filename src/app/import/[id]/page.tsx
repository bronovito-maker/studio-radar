import { AlertTriangle, ArrowLeft, Check, CircleCheck, Copy } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { requireViewer } from "@/lib/auth";
import { formatCurrency } from "@/lib/crm";
import {
  IMPORT_FIELDS,
  type ImportMapping,
  type ImportPreviewRow,
  type RawImportRow,
} from "@/lib/lead-import";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { confirmImport, previewImport } from "../actions";

type ImportDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
};

function normalizeHeader(header: string) {
  return header.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_ALIASES: Record<keyof ImportMapping, string[]> = {
  businessName: ["nomeattivita", "nomeazienda", "azienda", "businessname", "ragionesociale", "nome"],
  city: ["citta", "comune", "city", "localita"],
  region: ["regione", "region"],
  category: ["categoria", "category", "settore"],
  phone: ["telefono", "phone", "tel", "cellulare"],
  email: ["email", "mail", "emailaziendale"],
  websiteUrl: ["sitoweb", "website", "url", "sito"],
  estimatedValue: ["valorestimato", "valore", "estimatedvalue", "budget"],
};

function savedMapping(value: Json): Partial<ImportMapping> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(
    IMPORT_FIELDS.flatMap((field) => typeof value[field.key] === "string" ? [[field.key, value[field.key]]] : []),
  );
}

function suggestedHeader(field: keyof ImportMapping, headers: string[], mapping: Partial<ImportMapping>) {
  if (mapping[field] && headers.includes(mapping[field])) return mapping[field];
  return headers.find((header) => HEADER_ALIASES[field].includes(normalizeHeader(header))) ?? "";
}

function parseRawRows(value: Json): RawImportRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((row) => {
    if (!row || Array.isArray(row) || typeof row !== "object") return [];
    const rowNumber = row.rowNumber;
    const values = row.values;
    if (typeof rowNumber !== "number" || !values || Array.isArray(values) || typeof values !== "object") return [];
    return [{ rowNumber, values: Object.fromEntries(Object.entries(values).map(([key, cell]) => [key, String(cell ?? "")])) }];
  });
}

function parsePreviewRows(value: Json): ImportPreviewRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((row): row is ImportPreviewRow => {
    return Boolean(row && !Array.isArray(row) && typeof row === "object" && typeof row.rowNumber === "number" && typeof row.businessName === "string" && ["valid", "duplicate", "invalid"].includes(String(row.state)));
  });
}

export default async function ImportDetailPage({ params, searchParams }: ImportDetailPageProps) {
  const viewer = await requireViewer();
  const { id } = await params;
  const feedback = await searchParams;
  const supabase = await createClient();
  const { data: importBatch, error } = await supabase.from("lead_imports").select("*").eq("id", id).single();
  if (error || !importBatch) notFound();

  const mapping = savedMapping(importBatch.mapping);
  const rawRows = parseRawRows(importBatch.raw_rows);
  const previewRows = parsePreviewRows(importBatch.preview_rows);
  const sampleRows = rawRows.slice(0, 3);
  const displayedPreview = previewRows.slice(0, 100);
  const isCompleted = importBatch.status === "completed";

  return (
    <AppShell active="import" eyebrow="Import CSV" title={importBatch.filename} viewer={viewer} actions={<Link className="secondary-button" href="/import"><ArrowLeft size={16} /> Import</Link>}>
      {feedback.error ? <div className="alert alert-error" role="alert">{feedback.error}</div> : null}
      {feedback.success ? <div className="alert alert-success" role="status">{feedback.success}</div> : null}

      <ol className="import-steps" aria-label="Avanzamento import">
        <li className="done"><Check size={15} /> File caricato</li>
        <li className={importBatch.status !== "uploaded" ? "done" : "active"}>{importBatch.status !== "uploaded" ? <Check size={15} /> : <span>2</span>} Mappatura e anteprima</li>
        <li className={isCompleted ? "done" : importBatch.status === "previewed" ? "active" : ""}>{isCompleted ? <Check size={15} /> : <span>3</span>} Conferma</li>
      </ol>

      {isCompleted ? (
        <section className="import-complete panel">
          <span className="complete-icon"><CircleCheck size={28} /></span>
          <div><p className="eyebrow">Import completato</p><h2>{importBatch.imported_count} lead aggiunti</h2><p>{importBatch.duplicate_count} duplicati e {importBatch.invalid_count} righe non valide non sono stati importati.</p></div>
          <Link className="primary-button" href="/leads">Apri i lead</Link>
        </section>
      ) : (
        <section className="panel mapping-panel">
          <div className="section-heading"><h2>Associa le colonne</h2><p>Indica quali colonne del file corrispondono ai campi di Studio Radar.</p></div>
          <form className="mapping-form" action={previewImport}>
            <input type="hidden" name="importId" value={importBatch.id} />
            {IMPORT_FIELDS.map((field) => (
              <label className="field" key={field.key}>
                <span>{field.label}{field.required ? " *" : ""}</span>
                <select name={field.key} defaultValue={suggestedHeader(field.key, importBatch.headers, mapping)} required={field.required}>
                  <option value="">Non importare</option>
                  {importBatch.headers.map((header) => <option value={header} key={header}>{header}</option>)}
                </select>
              </label>
            ))}
            <div className="form-actions field-wide"><SubmitButton pendingLabel="Analisi in corso...">Genera anteprima</SubmitButton></div>
          </form>

          <details className="source-preview">
            <summary>Mostra righe originali</summary>
            <div className="table-scroll"><table className="data-table"><thead><tr><th>Riga</th>{importBatch.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{sampleRows.map((row) => <tr key={row.rowNumber}><td>{row.rowNumber}</td>{importBatch.headers.map((header) => <td key={header}>{row.values[header] || "—"}</td>)}</tr>)}</tbody></table></div>
          </details>
        </section>
      )}

      {previewRows.length && !isCompleted ? (
        <section className="preview-section">
          <div className="preview-summary">
            <article><span>Pronti</span><strong>{importBatch.valid_count}</strong></article>
            <article><span>Duplicati</span><strong>{importBatch.duplicate_count}</strong></article>
            <article><span>Non validi</span><strong>{importBatch.invalid_count}</strong></article>
            {importBatch.valid_count > 0 ? (
              <form action={confirmImport}>
                <input type="hidden" name="importId" value={importBatch.id} />
                <SubmitButton pendingLabel="Importazione..." className="primary-button">Importa {importBatch.valid_count} lead</SubmitButton>
              </form>
            ) : (
              <p className="preview-empty-action">Correggi il file o la mappatura per continuare.</p>
            )}
          </div>
          <div className="table-panel">
            <div className="table-scroll"><table className="data-table preview-table"><thead><tr><th>Riga</th><th>Esito</th><th>Attività</th><th>Località</th><th>Contatti</th><th>Valore</th><th>Dettaglio</th></tr></thead><tbody>{displayedPreview.map((row) => (
              <tr key={row.rowNumber}>
                <td>{row.rowNumber}</td>
                <td><span className={`preview-state preview-state-${row.state}`}>{row.state === "valid" ? <Check size={13} /> : row.state === "duplicate" ? <Copy size={13} /> : <AlertTriangle size={13} />}{row.state === "valid" ? "Pronto" : row.state === "duplicate" ? "Duplicato" : "Non valido"}</span></td>
                <td><strong>{row.businessName || "—"}</strong><span className="cell-secondary">{row.category || "Categoria non indicata"}</span></td>
                <td>{[row.city, row.region].filter(Boolean).join(", ") || "—"}</td>
                <td>{row.email || row.phone || row.websiteUrl || "—"}</td>
                <td>{formatCurrency(row.estimatedValue)}</td>
                <td>{row.duplicateLeadId ? <Link className="text-link" href={`/leads/${row.duplicateLeadId}`}>Apri lead</Link> : row.errors.join("; ") || "—"}</td>
              </tr>
            ))}</tbody></table></div>
            {previewRows.length > displayedPreview.length ? <footer className="table-footer">Mostrate le prime 100 righe su {previewRows.length}.</footer> : null}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
