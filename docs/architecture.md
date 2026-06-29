# Architettura

## Stack target

- Frontend: Next.js App Router, React, TypeScript.
- Styling: Tailwind CSS + componenti accessibili.
- Backend: Next.js Route Handlers e Server Actions dove appropriate.
- Database: Supabase PostgreSQL.
- Auth: Supabase Auth.
- AI: OpenAI Responses API con Structured Outputs; modello configurabile, default `gpt-5.4-mini`.
- Maps: Google Places API.
- Cron: Supabase Cron (`pg_cron` + `pg_net`) con secret in Vault.
- Web Scouting: `fetch()` nativo + regex, zero dipendenze esterne.
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
  outreach/

lib/
  auth/
  db/
  leads/
  scoring/
  places/
  outreach/
  audit/
  web-scout/        ← crawling siti web, estrazione contatti reali
  web-scout-utils/  ← protezione SSRF, concorrenza limitata
```

## Flusso mass discovery (cron notturno)

```text
Cron 03:00 UTC
  -> Google Places batch search (fino a 50 risultati)
  -> web scouting sicuro del sito ufficiale (estrazione nome, email, telefono, booking, social, chatbot)
  -> auto-conversione lead con soli dati sito/ricerca (RPC con deduplica atomica)
  -> scoring deterministico V2 (con dati arricchiti)
  -> coda email (queued, MAI inviate automaticamente)
  -> admin approva invio la mattina (/outreach)
  -> invio Brevo con anti-ban (delay 1.5s, limite giornaliero)
```

## Flusso lead discovery (manuale)

```text
Utente
  -> richiesta categoria + zona
  -> Google Places
  -> normalizzazione risultati
  -> deduplica
  -> scoring deterministico
  -> interpretazione AI opzionale, senza modifica dello score
  -> salvataggio lead + score + audit
  -> visualizzazione in CRM
```

## Backend-for-frontend

Le UI non chiamano direttamente servizi esterni sensibili. Le chiavi Google, AI e service role Supabase restano solo lato server.

## Accesso dati implementato

Dashboard e CRM core usano Server Components, Server Actions e funzioni PostgreSQL transazionali tramite il client Supabase autenticato. Le mutazioni che richiedono audit sono atomiche e rispettano RLS.

L'import CSV viene analizzato e normalizzato server side. Il batch conserva mapping e anteprima; la conferma ricontrolla i duplicati e crea lead e audit nella stessa transazione.

## API interne implementate

- `GET /api/leads/export`
- `GET /api/cron/discovery`

Tutte le API sono protette da autenticazione o secret dedicato nel caso del cron.

## Gestione cron

Il cron esegue scansioni piccole e idempotenti.

Regole:

- massimo numero di risultati per run;
- lock su `scan_runs` per evitare concorrenza;
- retry controllato;
- log esplicito di successo/fallimento;
- nessun invio outreach automatico.
- shortlist persistente composta soltanto da Place ID e contesto interno;
- configurazione categoria/zona dalla pagina Impostazioni;
- autorizzazione Bearer tramite `CRON_SECRET` e client Supabase server-only.

## Osservabilita

Fin dall'MVP servono:

- tabella `lead_events`;
- tabella `scan_runs`;
- logging server side sugli errori;
- messaggi utente chiari senza esporre dettagli interni.
