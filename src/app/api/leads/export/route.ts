import { stringify } from "csv-stringify/sync";
import { createClient } from "@/lib/supabase/server";
import { isLeadStatus, SOURCE_LABELS, STATUS_LABELS } from "@/lib/crm";

const CHUNK_SIZE = 1000;
const MAX_EXPORT_ROWS = 20_000;

function cleanSearch(value: string) {
  return value.replace(/[%_,().]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

function safeCell(value: string | null) {
  if (!value) return "";
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) {
    return Response.json({ error: "Non autenticato" }, { status: 401 });
  }

  const url = new URL(request.url);
  const q = cleanSearch(url.searchParams.get("q") ?? "");
  const statusValue = url.searchParams.get("status") ?? "";
  const status = isLeadStatus(statusValue) ? statusValue : "";
  const region = (url.searchParams.get("region") ?? "").slice(0, 100);
  const rows: Array<Record<string, string | number>> = [];
  let cursor: { createdAt: string; id: string } | null = null;

  while (rows.length < MAX_EXPORT_ROWS) {
    let query = supabase
      .from("leads")
      .select("id, business_name, city, region, country, category, status, source, phone, email, website_url, estimated_value, notes, created_at")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(CHUNK_SIZE);

    if (q) {
      const pattern = `%${q}%`;
      query = query.or(`business_name.ilike.${pattern},city.ilike.${pattern},category.ilike.${pattern}`);
    }
    if (status) query = query.eq("status", status);
    if (region) query = query.eq("region", region);
    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) return Response.json({ error: "Export non disponibile" }, { status: 500 });
    if (!data?.length) break;

    data.forEach((lead) => rows.push({
      "Nome attività": safeCell(lead.business_name),
      "Città": safeCell(lead.city),
      "Regione": safeCell(lead.region),
      "Paese": safeCell(lead.country),
      "Categoria": safeCell(lead.category),
      "Stato": STATUS_LABELS[lead.status],
      "Origine": SOURCE_LABELS[lead.source],
      "Telefono": safeCell(lead.phone),
      "Email": safeCell(lead.email),
      "Sito web": safeCell(lead.website_url),
      "Valore stimato": lead.estimated_value,
      "Note": safeCell(lead.notes),
      "Creato il": lead.created_at,
    }));

    const last = data[data.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
    if (data.length < CHUNK_SIZE) break;
  }

  if (rows.length >= MAX_EXPORT_ROWS) {
    return Response.json({ error: "Applica filtri più specifici prima di esportare" }, { status: 422 });
  }

  const csv = stringify(rows, { header: true, bom: true });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="studio-radar-lead-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
