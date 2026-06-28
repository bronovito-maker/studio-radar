# Stato Progetto

Ultimo aggiornamento: 28 giugno 2026.

## Sintesi

Studio Radar ha completato documentazione, fondazioni tecniche, CRM core, import CSV e scoring ibrido. La discovery Google Places e operativa: ricerca live, normalizzazione, score e controllo duplicati sono implementati e verificati con dati reali.

Il CRM e eseguibile e utilizzabile per inserimento manuale o CSV, discovery live e notturna, gestione e assegnazione, scoring deterministico, analisi OpenAI del sito, outreach WhatsApp/email ed export. Email, webhook e scheduler sono attivi sul dominio pubblico Render.

## Avanzamento roadmap

| Fase | Stato | Note |
|---|---|---|
| 0 - Documentazione | Completata | Scope, architettura, dati, sicurezza, UX, targeting e ADR tracciati |
| 1 - Fondazioni tecniche | Completata | Next.js, TypeScript strict, Supabase, migrazioni, RLS, Auth SSR e layout |
| 2 - CRM core | Completata | Dashboard reale, lista e dettaglio lead, inserimento, stati, note e audit |
| 3 - Import e deduplica | Completata | CSV, mapping, preview, deduplica concorrente ed export filtrato |
| 4 - Discovery e scoring | Completata | Ricerca, shortlist, arricchimento verificabile, conversione lead e scoring completati |
| 5 - Outreach | Completata | WhatsApp manuale, email Brevo approvata, tracking e follow-up controllati |
| 6 - Cron controllato | Completata | Discovery alle 03:00 UTC e follow-up email alle 07:00 UTC con secret in Vault e chiamate `pg_net` |
| 7 - Hardening | Quasi completata | Rate limit, anonimizzazione e suite E2E completa; resta logging esterno opzionale |

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
- Assegnazione lead ai collaboratori disponibile nella scheda: comando admin-only, controllo database e audit atomico.
- Mutazioni CRM e relativi audit eseguiti in transazioni PostgreSQL atomiche.
- Test transazionale autenticato superato con rollback e nessun dato sintetico persistito.
- Import CSV limitato e validato con mappatura colonne e dettaglio errori per riga.
- Deduplica per email, telefono, dominio e nome+citta, ricontrollata in conferma atomica.
- Export CSV filtrato con neutralizzazione delle formule per fogli di calcolo.
- Privilegi eccedenti (`TRUNCATE`, `REFERENCES`, `TRIGGER`) rimossi da tutte le tabelle pubbliche.
- Score deterministico v2 scomposto in mercato, solidita, opportunita digitale e contattabilita, salvato atomicamente con audit.
- Score ibrido operativo: OpenAI pesa dal 39% al 45% solo con confidenza ed evidenze sufficienti.
- Soglia automatica di qualifica alzata a 65 e verificata sui valori limite 64/65 con rollback.
- Test Supabase dello score superato con utente autenticato e rollback completo.
- Ricerca Google Places solo server, field mask minima, timeout, retry e gestione quota.
- Risultati Places effimeri con attribuzioni; nel database restano solo metadati e conteggi della scansione.
- Discovery confrontata con i lead esistenti prima di mostrare i risultati.
- Collaudo live completato il 28 giugno 2026: 8 hotel e agriturismi trovati a Riccione, 0 duplicati, scansione `succeeded` e nessun errore.
- Shortlist condivisa protetta da RLS: salva solo Place ID e contesto interno, con dettagli ricaricati live e rimozione controllata.
- Place Details verificato con una chiamata reale e field mask limitata ai dati necessari alla shortlist.
- OpenAI scelto come provider AI; SDK ufficiale, Responses API e Structured Outputs configurati con modello default `gpt-5.4-mini`.
- Contratto AI versionato e coperto da test; chiave, Structured Output e web search con `gpt-5.4-mini` verificati con chiamate sintetiche reali.
- Analisi manuale disponibile nella scheda lead: ricerca limitata al dominio ufficiale, fonti obbligatorie validate server side e risultato salvato atomicamente.
- RPC ibrida verificata con utente autenticato e rollback completo; nessun dato sintetico persistito.
- Flusso shortlist → verifica → lead completato: OpenAI estrae dati solo dal sito ufficiale, l'utente conferma e la RPC crea il lead con deduplica e audit atomici.
- Conversione candidato verificata sui casi creazione e duplicato con rollback; nessun dato sintetico persistito.
- Coda outreach e composer WhatsApp completati: bozza OpenAI modificabile, fallback deterministico e booking link globale.
- Registrazione manuale del contatto verificata: stato, timestamp e audit atomici con rollback completo.
- Email Brevo implementata: invio approvato, limite giornaliero, mittente configurabile, tracking webhook idempotente e storico per lead.
- Tre follow-up schedulabili con stop automatico su bounce, disiscrizione o risposta registrata; flusso SQL verificato con rollback e RLS autenticata.
- Invio email Brevo attivo con mittente verificato `crmdile007@gmail.com`, webhook autenticato pubblico e follow-up automatici a 3/6/9 giorni.
- Supabase Cron attivo alle 07:00 UTC: secret cifrato in Vault, chiamata `pg_net` a Render verificata con risposta `200`.
- Supabase Cron discovery attivo alle 03:00 UTC per Hotel a Bologna, con limite 10, lock concorrente e shortlist condivisa.
- Collaudo Brevo reale completato verso `bronovito@gmail.com`: consegna, apertura, quattro eventi webhook e audit verificati; tre follow-up creati e annullati senza ulteriori invii.
- Audit email compatibile con le secret key Supabase moderne e idempotente rispetto agli eventi webhook anticipati.
- Pagina impostazioni amministrativa disponibile per booking URL e soglia di qualificazione.
- Rate limit PostgreSQL persistente applicato a Places, import, arricchimento, analisi AI e bozze outreach; verifica limite superata con rollback.
- Anonimizzazione lead admin-only verificata, incluso il diniego al ruolo collaboratore.
- Suite Playwright completa: 6 test passano, inclusi accesso admin, diniego collaboratore, protezione anonima, cron e webhook senza secret.
- Endpoint cron implementato con Bearer secret, configurazione amministrativa, limite 10 risultati e lock PostgreSQL concorrente; scheduler Supabase attivo.

## Auth e ruoli

- Guardie UI/server applicate alle funzioni amministrative.
- Account collaboratore verificato: non accede alle impostazioni e non può assegnare lead.
- Login, route protette e separazione admin/collaboratore coperti dalla suite E2E e da verifiche SQL transazionali.

## Milestone CRM core consegnata

Un admin accede, vede metriche calcolate dal database, apre una lista lead paginata, filtra i risultati, entra nel dettaglio e cambia stato con creazione automatica dell'evento di audit.

## Milestone import consegnata

Un admin carica un CSV, associa le colonne, vede righe valide e duplicati, conferma l'import e scarica un export filtrato dei lead.

## Prossima milestone dimostrabile

Completare il percorso E2E applicativo su discovery, conversione, scoring, assegnazione e outreach usando fixture isolate.

## Blocchi esterni non urgenti

- Booking URL definitivo, configurabile dalla pagina Impostazioni.
- Logging esterno e alerting operativo, opzionali per l'MVP.
