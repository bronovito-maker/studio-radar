# Stato Progetto

Ultimo aggiornamento: 27 giugno 2026.

## Sintesi

Studio Radar ha completato la documentazione, le fondazioni tecniche e il CRM core. Il prossimo blocco di lavoro e import e deduplica: upload CSV, mappatura, anteprima, conferma ed export.

Il CRM e eseguibile e utilizzabile per inserimento e gestione manuale dei lead, ma il flusso MVP completo richiede ancora import, discovery, scoring e outreach.

## Avanzamento roadmap

| Fase | Stato | Note |
|---|---|---|
| 0 - Documentazione | Completata | Scope, architettura, dati, sicurezza, UX, targeting e ADR tracciati |
| 1 - Fondazioni tecniche | Completata | Next.js, TypeScript strict, Supabase, migrazioni, RLS, Auth SSR e layout |
| 2 - CRM core | Completata | Dashboard reale, lista e dettaglio lead, inserimento, stati, note e audit |
| 3 - Import e deduplica | Prossima | CSV, preview, deduplica ed export |
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
- Profilo e ruolo applicativo recuperati server side e mostrati nel layout autenticato.
- Dashboard alimentata da metriche PostgreSQL reali.
- Lista lead con ricerca, filtri e paginazione a cursore.
- Creazione manuale, dettaglio, note e cambio stato implementati.
- Mutazioni CRM e relativi audit eseguiti in transazioni PostgreSQL atomiche.
- Test transazionale autenticato superato con rollback e nessun dato sintetico persistito.

## Auth ancora da chiudere

- Applicare guardie UI/server alle funzioni riservate agli admin.
- Verificare il caso `collaborator` con un secondo account di test.
- Aggiungere test automatici del flusso login e dei permessi.

## Milestone CRM core consegnata

Un admin accede, vede metriche calcolate dal database, apre una lista lead paginata, filtra i risultati, entra nel dettaglio e cambia stato con creazione automatica dell'evento di audit.

## Prossima milestone dimostrabile

Un admin carica un CSV, associa le colonne, vede righe valide e duplicati, conferma l'import e scarica un export filtrato dei lead.

## Blocchi esterni non urgenti

- Credenziali Google Places, necessarie dalla fase discovery.
- Scelta tra OpenAI e Gemini, necessaria dopo lo score deterministico.
- Booking URL e dominio di produzione, necessari prima del deploy pubblico.
