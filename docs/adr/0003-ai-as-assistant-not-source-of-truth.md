# ADR 0003 - AI come assistente, non fonte unica di verita

## Stato

Accettata.

## Contesto

Lo scoring AI e utile ma puo sbagliare, inventare interpretazioni o variare tra modelli.

## Decisione

Usare AI per interpretare evidenze e preparare motivazione e angolo commerciale, mantenendo:

- scoring V2 interamente deterministico e separato per offerta;
- output validato;
- storico versionato;
- input snapshot;
- nessuna azione irreversibile automatica.

OpenAI non produce uno score numerico, non modifica gli offer score, non sceglie il servizio persistito e non decide la prossima azione. `opportunityScore`, `confidence`, servizio e `nextAction` derivano esclusivamente da regole versionate.

## Conseguenze

Positive:

- Maggiore affidabilita e ripetibilita.
- Debug piu semplice.
- Migliore controllo costi.
- Nessuna dipendenza del ranking dalle variazioni del modello AI.

Trade-off:

- Implementazione leggermente piu articolata.
- Alcune offerte restano non valutabili finche non esistono prove strutturate.
- Le interpretazioni AI possono comunque contenere errori e devono mostrare le fonti.
