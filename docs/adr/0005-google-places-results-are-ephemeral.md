# ADR 0005 - Risultati Google Places effimeri

## Stato

Accettata il 27 giugno 2026.

## Contesto

La discovery usa Places API (New) per trovare attivita locali. I contenuti restituiti da Google sono soggetti a vincoli di visualizzazione, attribuzione e conservazione. I Place ID hanno un trattamento diverso dagli altri contenuti e possono essere conservati.

## Decisione

- La ricerca avviene esclusivamente server-side.
- I risultati completi vengono restituiti alla UI e restano nello stato effimero della sessione.
- `scan_runs` conserva solo parametri, stato, conteggi e codici errore.
- `lead_candidates` conserva il Place ID selezionato e il contesto interno digitato dall'utente; i dettagli vengono richiesti nuovamente a Google quando la shortlist viene visualizzata.
- Non viene salvato uno snapshot dei contenuti Places.
- La UI mostra Google Maps e le eventuali attribuzioni di terze parti.
- L'import permanente dei contenuti Places resta escluso. Il candidato puo diventare lead usando dati verificati dal sito ufficiale o inseriti manualmente, come definito nell'ADR 0006.

## Conseguenze

La discovery puo essere usata senza introdurre un archivio dei contenuti Places. Il passaggio da risultato a lead mantiene una provenienza esplicita e una conferma umana.
