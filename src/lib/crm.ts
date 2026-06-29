import type { Database } from "@/types/database";

export type LeadStatus = Database["public"]["Enums"]["lead_status"];

export const LEAD_STATUSES: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "Nuovo" },
  { value: "qualified", label: "Qualificato" },
  { value: "to_contact", label: "Da contattare" },
  { value: "contacted", label: "Contattato" },
  { value: "follow_up", label: "Follow-up" },
  { value: "booked", label: "Call prenotata" },
  { value: "client", label: "Cliente" },
  { value: "discarded", label: "Scartato" },
];

export const STATUS_LABELS = Object.fromEntries(
  LEAD_STATUSES.map((status) => [status.value, status.label]),
) as Record<LeadStatus, string>;

export const SOURCE_LABELS: Record<
  Database["public"]["Enums"]["lead_source"],
  string
> = {
  manual: "Manuale",
  csv: "CSV",
  google_places: "Google Places",
};

export const REGIONS = [
  "Abruzzo",
  "Basilicata",
  "Calabria",
  "Campania",
  "Emilia-Romagna",
  "Friuli-Venezia Giulia",
  "Lazio",
  "Liguria",
  "Lombardia",
  "Marche",
  "Molise",
  "Piemonte",
  "Puglia",
  "Sardegna",
  "Sicilia",
  "Toscana",
  "Trentino-Alto Adige",
  "Umbria",
  "Valle d'Aosta",
  "Veneto",
] as const;

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function isLeadStatus(value: string): value is LeadStatus {
  return LEAD_STATUSES.some((status) => status.value === value);
}
