# Integrazioni

## Google Places

### Uso MVP implementato

- Text Search (New) server-side per categoria, citta/zona e regione.
- Recupero con field mask dei soli campi necessari: nome, indirizzo, telefono, sito, rating, recensioni, categoria, stato, booking, Place ID e URL Maps.
- Score deterministico immediato sui risultati.
- Deduplica in lettura su `google_place_id`, telefono, dominio e nome+citta.
- Shortlist condivisa che conserva solo Place ID e contesto interno della ricerca.
- Ricaricamento live dei candidati tramite Place Details (New) con field mask ridotta.
- Cronologia tecnica in `scan_runs`: query, stato, conteggi, duplicati ed eventuale codice errore.

### Regole

- La chiave `GOOGLE_PLACES_API_KEY` resta esclusivamente sul server.
- Richiedere solo i campi necessari tramite `X-Goog-FieldMask`.
- Gestire quota, errori e retry.
- Non fare scraping HTML di Google.
- Mostrare attribuzione Google Maps e attribuzioni di terze parti insieme ai risultati.
- Non persistere i contenuti Places restituiti dalla ricerca. I risultati sono effimeri; il Place ID puo essere conservato a tempo indeterminato.
- Verificare e aggiornare i Place ID con piu di 12 mesi durante il futuro processo periodico di manutenzione.
- Prima della persistenza, usare il sito ufficiale o l'inserimento manuale come fonte dei dati CRM; non copiare automaticamente i contenuti Places.

### Attivazione locale

1. Abilitare Places API (New) nel progetto Google Cloud.
2. Creare una API key limitata alla sola Places API (New).
3. Inserire `GOOGLE_PLACES_API_KEY` in `.env.local`.
4. Riavviare il server e verificare una ricerca da 5 risultati.

In produzione applicare anche una restrizione adatta al backend e monitorare quota e costi.

### Discovery notturna

- Uno scheduler esterno richiama `GET /api/cron/discovery` alle 03:00 UTC.
- La route richiede `Authorization: Bearer <CRON_SECRET>`.
- Categoria, citta e regione sono configurabili dagli admin.
- Ogni run richiede al massimo 10 risultati e salva in shortlist soltanto Place ID nuovi.
- Un indice parziale impedisce due run cron contemporanee; run bloccate da oltre 30 minuti vengono chiuse come fallite.

## OpenAI

### Uso MVP

- Analizzare evidenze raccolte dal sito ufficiale del candidato.
- Restituire Structured Output validato con Zod tramite Responses API.
- Interpretare opportunita con evidenza, rischi, dati mancanti e angolo outreach senza produrre score numerici o decisioni operative.

### Regole

- Provider OpenAI e modello configurabile, default `gpt-5.4-mini`.
- Prompt e contratto versionati.
- Output validato prima di qualsiasi persistenza.
- Fallback se AI non disponibile.
- Score, offerta persistita e prossima azione restano interamente deterministici.
- `store: false` nelle richieste Responses API.

## Calendly o booking URL

### Uso MVP

- Solo un link configurabile nelle impostazioni.
- Inserimento nel template messaggio.

### Futuro

- Webhook booking.
- Aggiornamento automatico stato lead a `booked`.

## WhatsApp

### Uso MVP

- Link `wa.me` generato lato client/server con testo codificato.
- Bozza OpenAI basata esclusivamente sui dati e sulle evidenze gia presenti nel CRM.
- Booking link globale aggiunto dal CRM dopo la generazione AI.
- Conferma manuale separata dall'apertura di WhatsApp; solo la conferma aggiorna stato e audit.
- L'utente decide manualmente se inviare.

### Futuro

- WhatsApp Business Platform solo se compliance e opt-in sono risolti.

## Brevo Email

### Uso implementato

- Invio transazionale singolo dalla scheda lead, sempre dopo approvazione dell'operatore.
- Mittente verificato, reply-to e limite giornaliero configurabili dagli amministratori.
- Tre follow-up opzionali con ritardi configurabili e cron giornaliero alle 07:00 UTC.
- Scheduler attivo su Supabase Cron; `pg_net` richiama Render usando il Bearer token conservato in Vault.
- Tracking tramite webhook autenticato per invio, consegna, apertura, click, bounce, blocco, spam, errore e disiscrizione.
- Eventi idempotenti: una consegna webhook ripetuta non duplica audit o aggiornamenti.
- Stop immediato dei follow-up su risposta registrata, bounce, blocco, spam o disiscrizione.
- Testo di opt-out aggiunto automaticamente a ogni messaggio.

### Attivazione

1. Configurare `BREVO_API_KEY`, `BREVO_WEBHOOK_TOKEN`, `SUPABASE_SECRET_KEY` e `CRON_SECRET` sul server.
2. Registrare in Brevo il webhook `POST /api/webhooks/brevo` con autenticazione Bearer.
3. Configurare un mittente Brevo verificato nella pagina Impostazioni.
4. Abilitare prima l'invio e poi, separatamente, i follow-up automatici.

Le risposte nella casella reply-to vengono registrate manualmente dal CRM; l'inbound parsing automatico non è ancora attivo.

## Notion

Rimandato.

Prima alternativa:

- export CSV;
- report interni;
- audit events.

## Google Sheets

Rimandato.

Prima alternativa:

- export CSV;
- eventuale scheduled export read-only.
