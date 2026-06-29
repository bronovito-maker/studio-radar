# Stato Progetto

Ultimo aggiornamento: 30 giugno 2026.

## Sintesi

Studio Radar ha completato documentazione, fondazioni tecniche, CRM core, import CSV, scoring commerciale V2, discovery Google Places, outreach WhatsApp/email, cron controllato, hardening e mass discovery con auto-outreach.

Il CRM supporta ora discovery massiva (fino a 50 lead/notte) con web scouting automatico dei siti web aziendali per estrarre contatti reali (email, telefono), segnali commerciali (booking, WhatsApp, chatbot) e canali social. Le email vengono preparate automaticamente ma **mai inviate senza approvazione manuale** — l'admin usa il pulsante "Approva e invia" dalla pagina Outreach.

Email, webhook, scheduler e anti-ban Brevo (1.5s delay tra invii, rispetto limite giornaliero) sono attivi.

## Avanzamento roadmap

| Fase | Stato | Note |
|---|---|---|
| 0 - Documentazione | Completata | Scope, architettura, dati, sicurezza, UX, targeting e ADR tracciati |
| 1 - Fondazioni tecniche | Completata | Next.js, TypeScript strict, Supabase, migrazioni, RLS, Auth SSR e layout |
| 2 - CRM core | Completata | Dashboard reale, lista e dettaglio lead, inserimento, stati, note e audit |
| 3 - Import e deduplica | Completata | CSV, mapping, preview, deduplica concorrente ed export filtrato |
| 4 - Discovery e scoring | Completata | Ricerca, shortlist, arricchimento verificabile, conversione lead e scoring completati |
| 5 - Outreach | Completata | WhatsApp manuale, email Brevo approvata, tracking e follow-up controllati |
| 6 - Cron controllato | Completata | Discovery alle 03:00 UTC e follow-up email alle 07:00 UTC |
| 7 - Hardening | Completata | Rate limit, anonimizzazione, suite E2E e logging |
| 8 - Mass discovery e auto-outreach | Completata | Batch search Places (50 lead/notte), web scouting, coda email approvabile, anti-ban Brevo |

## Novità Fase 8 — Mass Discovery & Auto-Outreach

### Discovery massiva
- `searchGooglePlacesBatch()`: query multiple con sub-area modifiers per raccogliere fino a 50 Place ID unici per notte
- Configurabile da Impostazioni: categoria, città/zona, regione, page size (1-50)
- Deduplica atomica con advisory lock PostgreSQL

### Web Scouting (`src/lib/web-scout.ts`)
- Crawling HTTP del sito web aziendale (fetch + regex, zero dipendenze esterne)
- Estrazione email reali da homepage e pagine secondarie (/contatti, /prenota, /chi-siamo)
- Classificazione qualità email (high/medium/low)
- Estrazione telefoni con distinzione mobile/fisso IT
- Rilevazione sistema di prenotazione (Amenitiz, SimpleBooking, ecc.)
- Rilevazione WhatsApp e chatbot concorrenti (Intercom, Drift, Tawk, ecc.)
- Rilevazione canali social (Facebook, Instagram, LinkedIn, TikTok, YouTube, Tripadvisor)
- Rilevazione sedi multiple (indirizzi da pattern "Via X 123, CAP Città")
- Timeout, size cap, retry su ogni richiesta — nessun impatto sui server target

### Coda email con approvazione manuale
- Il cron notturno **prepara** le email (status: `queued`) ma **non le invia**
- Filtri automatici: scarta lead con chatbot concorrenti, senza contatti reali, o con score insufficiente
- Usa solo email reali estratte dal sito — mai indirizzi `info@` indovinati
- Pagina `/outreach` mostra il numero di email in coda
- Pulsante **"Approva e invia"** visibile solo agli admin
- Invio con anti-ban: 1.5 secondi di delay tra email, rispetto limite giornaliero, stop immediato su rate limit Brevo (429)
- Follow-up automatici opzionali (3/6/9 giorni)

### Nuovi file
- `src/lib/web-scout.ts` — modulo di crawling (393 righe, protezione SSRF, cap streaming 300KB)
- `src/lib/web-scout-utils.ts` — `isPrivateIpAddress()`, `mapWithConcurrency()`
- `src/lib/web-scout.test.ts` — 12 test (sicurezza rete + concorrenza)
- `supabase/migrations/20260629230000_mass_discovery_auto_outreach.sql` — `cron_page_size`, `email_auto_outreach_enabled`, RPC `auto_create_lead_from_place`, RPC `save_automated_deterministic_score`, RPC `claim_queued_initial_emails`

## Fondazioni verificate

- Build, lint e typecheck passano.
- Dipendenze applicative senza vulnerabilita note nell'audit eseguito.
- Login, logout, sessione server side e redirect delle route protette implementati.
- Primo account creato e promosso ad `admin` nel profilo applicativo.
- Schema core e seed servizi applicati al progetto Supabase.
- RLS attiva sulle tabelle pubbliche; accesso anonimo ai lead negato.
- Ruolo del profilo non modificabile dagli utenti autenticati tramite Data API.
- Security Advisor senza errori di schema.
- Profilo e ruolo applicativo recuperati server side e mostrati nel layout autenticato.
- Dashboard alimentata da metriche PostgreSQL reali.
- Lista lead con ricerca, filtri e paginazione a cursore.
- Creazione manuale, dettaglio, note e cambio stato implementati.
- Assegnazione lead ai collaboratori disponibile nella scheda: comando admin-only, controllo database e audit atomico.
- Mutazioni CRM e relativi audit eseguiti in transazioni PostgreSQL atomiche.
- Score deterministico V2: opportunity, confidence, nextAction, 4 offerte separate.
- OpenAI interpreta fonti ufficiali ma non modifica score, offerta salvata o prossima azione.
- Ricerca Google Places solo server, field mask minima, timeout, retry e gestione quota.
- Risultati Places effimeri: nel CRM restano Place ID e contesto della ricerca; nome, contatti e segnali permanenti derivano dal sito ufficiale.
- Discovery batch search con sub-area modifiers per target fino a 50 lead/notte.
- Web scouting automatico con protezione SSRF, cap streaming 300KB e concorrenza limitata: estrazione contatti reali, segnali commerciali e canali social.
- Coda email con approvazione manuale e anti-ban Brevo (delay 1.5s, limite giornaliero, stop su 429).
- Shortlist condivisa protetta da RLS.
- Email Brevo con tracking webhook idempotente e follow-up schedulabili.
- Supabase Cron attivo: discovery 03:00 UTC, follow-up 07:00 UTC.
- Rate limit PostgreSQL persistente su Places, import, arricchimento, AI e bozze outreach.
- Anonimizzazione lead admin-only verificata.
- Suite Playwright completa: 6 test passano.
- Endpoint cron con Bearer secret e lock PostgreSQL concorrente.

## Auth e ruoli

- Guardie UI/server applicate alle funzioni amministrative.
- Il pulsante "Approva e invia" email è visibile solo agli admin.
- Account collaboratore verificato: non accede alle impostazioni, non può inviare email massive.

## Prossima milestone dimostrabile

Validare il flusso mass discovery end-to-end su una categoria reale (es. hotel a Riccione, 50 lead) e misurare:
- Tasso di estrazione email reale (% lead con contatto valido)
- Deliverability Brevo (aperture, click, bounce)
- Qualità lead (quanti rispondono o prenotano una call)

## Documentazione estesa

Vedi [`docs/mass-discovery.md`](./mass-discovery.md) per l'architettura completa del flusso massivo.
