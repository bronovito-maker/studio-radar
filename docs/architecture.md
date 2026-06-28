# Architettura

## Stack target

- Frontend: Next.js App Router, React, TypeScript.
- Styling: Tailwind CSS + componenti accessibili.
- Backend: Next.js Route Handlers e Server Actions dove appropriate.
- Database: Supabase PostgreSQL.
- Auth: Supabase Auth.
- AI: OpenAI Responses API con Structured Outputs; modello configurabile, default `gpt-5.4-mini`.
- Maps: Google Places API.
- Cron: Vercel Cron o scheduler equivalente.
- Test: Vitest per logica, Playwright per flussi principali.

## Moduli principali

```text
app/
  auth/
  dashboard/
  leads/
  search/
  import/
  settings/

lib/
  auth/
  db/
  leads/
  scoring/
  places/
  outreach/
  audit/
  validation/
```

## Flusso lead discovery

```text
Utente o cron
  -> richiesta categoria + zona
  -> Google Places
  -> normalizzazione risultati
  -> deduplica
  -> scoring deterministico
  -> scoring AI se necessario
  -> salvataggio lead + score + audit
  -> visualizzazione in CRM
```

## Backend-for-frontend

Le UI non chiamano direttamente servizi esterni sensibili. Le chiavi Google, AI e service role Supabase restano solo lato server.

## Accesso dati implementato

Dashboard e CRM core usano Server Components, Server Actions e funzioni PostgreSQL transazionali tramite il client Supabase autenticato. Le mutazioni che richiedono audit sono atomiche e rispettano RLS.

L'import CSV viene analizzato e normalizzato server side. Il batch conserva mapping e anteprima; la conferma ricontrolla i duplicati e crea lead e audit nella stessa transazione.

## API interne previste per le integrazioni

- `GET /api/leads/export`
- `POST /api/search`
- `POST /api/outreach/mark-sent`
- `GET /api/settings`
- `PATCH /api/settings`
- `GET /api/cron/scan`

Tutte le API sono protette da autenticazione o secret dedicato nel caso del cron.

## Gestione cron

Il cron esegue scansioni piccole e idempotenti.

Regole:

- massimo numero di risultati per run;
- lock su `scan_runs` per evitare concorrenza;
- retry controllato;
- log esplicito di successo/fallimento;
- nessun invio outreach automatico.

## Osservabilita

Fin dall'MVP servono:

- tabella `lead_events`;
- tabella `scan_runs`;
- logging server side sugli errori;
- messaggi utente chiari senza esporre dettagli interni.
