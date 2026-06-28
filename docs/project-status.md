# Stato Progetto

Ultimo aggiornamento: 28 giugno 2026.

## Sintesi

Studio Radar ha completato documentazione, fondazioni tecniche, CRM core, import CSV e scoring ibrido. La discovery Google Places e operativa: ricerca live, normalizzazione, score e controllo duplicati sono implementati e verificati con dati reali.

Il CRM e eseguibile e utilizzabile per inserimento manuale o CSV, discovery live, gestione, scoring deterministico, analisi OpenAI del sito ed export. Il flusso MVP completo richiede ancora l'arricchimento conforme dei candidati e l'outreach.

## Avanzamento roadmap

| Fase | Stato | Note |
|---|---|---|
| 0 - Documentazione | Completata | Scope, architettura, dati, sicurezza, UX, targeting e ADR tracciati |
| 1 - Fondazioni tecniche | Completata | Next.js, TypeScript strict, Supabase, migrazioni, RLS, Auth SSR e layout |
| 2 - CRM core | Completata | Dashboard reale, lista e dettaglio lead, inserimento, stati, note e audit |
| 3 - Import e deduplica | Completata | CSV, mapping, preview, deduplica concorrente ed export filtrato |
| 4 - Discovery e scoring | Completata | Ricerca, shortlist, arricchimento verificabile, conversione lead e scoring completati |
| 5 - Outreach manuale | Completata | Bozza OpenAI modificabile, fallback, `wa.me`, booking globale e audit |
| 6 - Cron controllato | Non iniziata | Endpoint protetto, lock e scan runs |
| 7 - Hardening | Parziale | Rate limit, anonimizzazione e test anonimi completati; restano E2E autenticati e logging esterno |

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
- Pagina impostazioni amministrativa disponibile per booking URL e soglia di qualificazione.
- Rate limit PostgreSQL persistente applicato a Places, import, arricchimento, analisi AI e bozze outreach; verifica limite superata con rollback.
- Anonimizzazione lead admin-only verificata, incluso il diniego al ruolo collaboratore.
- Suite Playwright aggiunta: redirect e protezione route anonime passano; test admin/collaborator pronti e condizionati a credenziali E2E dedicate.

## Auth ancora da chiudere

- Applicare guardie UI/server alle funzioni riservate agli admin.
- Verificare il caso `collaborator` con un secondo account di test.
- Aggiungere test automatici del flusso login e dei permessi.

## Milestone CRM core consegnata

Un admin accede, vede metriche calcolate dal database, apre una lista lead paginata, filtra i risultati, entra nel dettaglio e cambia stato con creazione automatica dell'evento di audit.

## Milestone import consegnata

Un admin carica un CSV, associa le colonne, vede righe valide e duplicati, conferma l'import e scarica un export filtrato dei lead.

## Prossima milestone dimostrabile

Un amministratore verifica i permessi di un collaboratore e il percorso completo viene coperto da test E2E: login, discovery, conversione, scoring e outreach.

## Blocchi esterni non urgenti

- Dominio di produzione, necessario prima del deploy pubblico.
- Booking URL definitivo, configurabile dalla pagina Impostazioni.
