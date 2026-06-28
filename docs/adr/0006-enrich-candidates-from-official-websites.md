# ADR 0006 - Arricchimento candidati da siti ufficiali

## Stato

Accettata il 28 giugno 2026.

## Contesto

La shortlist conserva soltanto Place ID e contesto di ricerca interno. Il CRM deve trasformare un candidato in lead senza archiviare automaticamente i contenuti restituiti da Google Places.

## Decisione

- Places viene usato in modo effimero per individuare il sito ufficiale e mostrare il riferimento Maps con attribuzione.
- OpenAI consulta esclusivamente il dominio ufficiale tramite filtro `allowed_domains`.
- I dati aziendali persistenti provengono dal sito ufficiale o dalla verifica manuale dell'utente.
- Ogni estrazione AI espone fonti, confidenza e dati mancanti.
- L'utente puo modificare tutti i campi prima della conferma.
- La conferma crea il lead, registra l'origine nell'audit e rimuove il candidato in una sola transazione.
- La deduplica usa Place ID, email, telefono, dominio e nome+citta con lock transazionali.

## Conseguenze

Il flusso discovery-to-CRM e completo senza trasformare la risposta Places in un archivio permanente. Il costo OpenAI resta sotto controllo perche l'arricchimento viene avviato manualmente.
