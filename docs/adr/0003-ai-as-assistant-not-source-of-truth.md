# ADR 0003 - AI come assistente, non fonte unica di verita

## Stato

Accettata.

## Contesto

Lo scoring AI e utile ma puo sbagliare, inventare interpretazioni o variare tra modelli.

## Decisione

Usare AI per arricchire e motivare lo score, mantenendo:

- score deterministico;
- output validato;
- storico versionato;
- input snapshot;
- nessuna azione irreversibile automatica.

## Conseguenze

Positive:

- Maggiore affidabilita.
- Debug piu semplice.
- Migliore controllo costi.

Trade-off:

- Implementazione leggermente piu articolata.
- Alcune decisioni richiedono supervisione umana.

