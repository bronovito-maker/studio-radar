# Stato Progetto

Ultimo aggiornamento: 27 giugno 2026.

## Sintesi

Studio Radar ha completato documentazione, fondazioni tecniche, CRM core, import CSV e score deterministico. La base Google Places e pronta: ricerca live, normalizzazione, score e controllo duplicati sono implementati; manca la chiave API per la verifica con dati reali.

Il CRM e eseguibile e utilizzabile per inserimento manuale o CSV, gestione, scoring ed export dei lead. Il flusso MVP completo richiede ancora verifica live della discovery, decisione sull'acquisizione conforme dei risultati e outreach.

## Avanzamento roadmap

| Fase | Stato | Note |
|---|---|---|
| 0 - Documentazione | Completata | Scope, architettura, dati, sicurezza, UX, targeting e ADR tracciati |
| 1 - Fondazioni tecniche | Completata | Next.js, TypeScript strict, Supabase, migrazioni, RLS, Auth SSR e layout |
| 2 - CRM core | Completata | Dashboard reale, lista e dettaglio lead, inserimento, stati, note e audit |
| 3 - Import e deduplica | Completata | CSV, mapping, preview, deduplica concorrente ed export filtrato |
| 4 - Discovery e scoring | In corso | Score deterministico completo; Places pronto, verifica live bloccata solo dalla chiave API |
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
- Import CSV limitato e validato con mappatura colonne e dettaglio errori per riga.
- Deduplica per email, telefono, dominio e nome+citta, ricontrollata in conferma atomica.
- Export CSV filtrato con neutralizzazione delle formule per fogli di calcolo.
- Privilegi eccedenti (`TRUNCATE`, `REFERENCES`, `TRIGGER`) rimossi da tutte le tabelle pubbliche.
- Score deterministico versionato, testato e salvato atomicamente con servizio consigliato e audit.
- Test Supabase dello score superato con utente autenticato e rollback completo.
- Ricerca Google Places solo server, field mask minima, timeout, retry e gestione quota.
- Risultati Places effimeri con attribuzioni; nel database restano solo metadati e conteggi della scansione.
- Discovery confrontata con i lead esistenti prima di mostrare i risultati.

## Auth ancora da chiudere

- Applicare guardie UI/server alle funzioni riservate agli admin.
- Verificare il caso `collaborator` con un secondo account di test.
- Aggiungere test automatici del flusso login e dei permessi.

## Milestone CRM core consegnata

Un admin accede, vede metriche calcolate dal database, apre una lista lead paginata, filtra i risultati, entra nel dettaglio e cambia stato con creazione automatica dell'evento di audit.

## Milestone import consegnata

Un admin carica un CSV, associa le colonne, vede righe valide e duplicati, conferma l'import e scarica un export filtrato dei lead.

## Prossima milestone dimostrabile

Con la chiave configurata, un admin cerca una categoria in una zona tramite Google Places e confronta risultati normalizzati, score e duplicati. La persistenza dei dati commerciali verra aggiunta solo dopo aver definito una fonte o un flusso conforme.

## Blocchi esterni non urgenti

- Credenziali Google Places, necessarie per il collaudo live della discovery.
- Scelta tra OpenAI e Gemini, necessaria dopo lo score deterministico.
- Booking URL e dominio di produzione, necessari prima del deploy pubblico.
