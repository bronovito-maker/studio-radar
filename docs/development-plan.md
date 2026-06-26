# Piano di Sviluppo

## Regola base

Ogni fase deve lasciare il prodotto in uno stato eseguibile, testabile e dimostrabile.

## Fase 1 - Scaffold

Task:

- creare app Next.js;
- TypeScript strict;
- styling moderno con supporto light/dark mode;
- lint e format;
- struttura cartelle;
- env example;
- pagina login placeholder;
- layout app protetto placeholder.

Verifica:

- `npm run build`;
- `npm run lint`;
- app avviabile localmente.

## Fase 2 - Supabase e schema

Task:

- creare migrazioni;
- enum;
- tabelle core;
- RLS;
- policy minime;
- seed opzionale sviluppo.

Verifica:

- migrazioni applicabili da zero;
- test query anonime negate;
- test query autenticato/admin consentite.

## Fase 3 - Auth

Task:

- login;
- logout;
- session server side;
- guard route;
- recupero profilo;
- ruoli.

Verifica:

- anonimo non vede dashboard;
- utente loggato vede dashboard;
- collaborator non accede impostazioni admin.

## Fase 4 - Lead core

Task:

- pagina lead;
- API/query paginata;
- filtri;
- update stato;
- note;
- audit.

Verifica:

- CRUD parziale lead funziona;
- eventi creati;
- UI gestisce loading/errori.

## Fase 5 - Import CSV

Task:

- upload;
- parser;
- mapping base;
- deduplica;
- preview;
- conferma import.

Verifica:

- duplicati riconosciuti;
- righe invalide spiegate;
- import crea audit.

## Fase 6 - Discovery

Task:

- client Google Places server side;
- normalizzazione;
- ricerca manuale;
- import selettivo;
- scan run.

Verifica:

- chiave non esposta client;
- errori quota/API gestiti;
- duplicati non reinseriti.

## Fase 7 - Scoring

Task:

- score deterministico;
- provider AI astratto;
- prompt versionato;
- validazione JSON;
- storico score.

Verifica:

- test score deterministic;
- fallback se AI fallisce;
- UI mostra motivazione.

## Fase 8 - Outreach

Task:

- template messaggio;
- generazione link WhatsApp;
- mark contacted;
- timeline.

Verifica:

- encoding URL corretto;
- nessun invio automatico;
- evento `contacted` creato.

## Fase 9 - Cron

Task:

- endpoint cron;
- secret;
- lock scan;
- schedule settings;
- scan limit.

Verifica:

- richiesta senza secret respinta;
- doppia run concorrente evitata;
- log run completo.
