# Stato Progetto

Ultimo aggiornamento: 27 giugno 2026.

## Sintesi

Studio Radar ha completato la documentazione di prodotto e le fondazioni tecniche. Il prossimo blocco di lavoro e il CRM core: dati reali in dashboard, lista lead, dettaglio, cambio stato, note e audit.

La base e eseguibile e protetta, ma non e ancora un MVP operativo: discovery, scoring, import e outreach devono ancora essere implementati.

## Avanzamento roadmap

| Fase | Stato | Note |
|---|---|---|
| 0 - Documentazione | Completata | Scope, architettura, dati, sicurezza, UX, targeting e ADR tracciati |
| 1 - Fondazioni tecniche | Completata | Next.js, TypeScript strict, Supabase, migrazioni, RLS, Auth SSR e layout |
| 2 - CRM core | Prossima | Dashboard reale, lista e dettaglio lead, stati, note e audit |
| 3 - Import e deduplica | Non iniziata | CSV, preview, deduplica ed export |
| 4 - Discovery e scoring | Non iniziata | Google Places, score deterministico e provider AI |
| 5 - Outreach manuale | Non iniziata | Template WhatsApp, link `wa.me` e timeline |
| 6 - Cron controllato | Non iniziata | Endpoint protetto, lock e scan runs |
| 7 - Hardening | Parziale | RLS e controlli base presenti; test E2E, rate limit e logging da completare |

## Fondazioni verificate

- Build, lint e typecheck passano.
- Dipendenze applicative senza vulnerabilita note nell'audit eseguito.
- Login, logout, sessione server side e redirect delle route protette implementati.
- Primo account creato e promosso ad `admin` nel profilo applicativo.
- Schema core e seed servizi applicati al progetto Supabase.
- RLS attiva sulle tabelle pubbliche; accesso anonimo ai lead negato.
- Ruolo del profilo non modificabile dagli utenti autenticati tramite Data API.
- Security Advisor senza errori di schema; resta da attivare Leaked Password Protection in Supabase Auth prima della produzione.

## Auth ancora da chiudere

- Recuperare il profilo applicativo nel layout, oltre ai claim Auth.
- Applicare guardie UI/server alle funzioni riservate agli admin.
- Verificare il caso `collaborator` con un secondo account di test.
- Aggiungere test automatici del flusso login e dei permessi.

## Prossima milestone dimostrabile

Un admin accede, vede metriche calcolate dal database, apre una lista lead paginata, filtra i risultati, entra nel dettaglio e cambia stato con creazione automatica dell'evento di audit.

## Blocchi esterni non urgenti

- Credenziali Google Places, necessarie dalla fase discovery.
- Scelta tra OpenAI e Gemini, necessaria dopo lo score deterministico.
- Booking URL e dominio di produzione, necessari prima del deploy pubblico.
