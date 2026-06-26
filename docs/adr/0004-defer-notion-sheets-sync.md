# ADR 0004 - Rimandare sync Notion e Google Sheets

## Stato

Accettata.

## Contesto

Notion e Sheets sono utili, ma aggiungono complessita, failure mode e problemi di coerenza dati.

## Decisione

Nel MVP includere export CSV e audit interno. Rimandare sync automatici a dopo validazione del CRM core.

## Conseguenze

Positive:

- Meno debito tecnico.
- Fonte dati primaria chiara.
- Meno integrazioni fragili.

Trade-off:

- Chi vuole lavorare su fogli dovra esportare manualmente.

