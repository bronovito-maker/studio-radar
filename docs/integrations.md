# Integrazioni

## Google Places

### Uso MVP implementato

- Text Search (New) server-side per categoria, citta/zona e regione.
- Recupero con field mask dei soli campi necessari: nome, indirizzo, telefono, sito, rating, recensioni, categoria, stato, booking, Place ID e URL Maps.
- Score deterministico immediato sui risultati.
- Deduplica in lettura su `google_place_id`, telefono, dominio e nome+citta.
- Shortlist condivisa che conserva solo Place ID e contesto interno della ricerca.
- Ricaricamento live dei candidati tramite Place Details (New) con field mask ridotta.
- Cronologia tecnica in `scan_runs`: query, stato, conteggi, duplicati ed eventuale codice errore.

### Regole

- La chiave `GOOGLE_PLACES_API_KEY` resta esclusivamente sul server.
- Richiedere solo i campi necessari tramite `X-Goog-FieldMask`.
- Gestire quota, errori e retry.
- Non fare scraping HTML di Google.
- Mostrare attribuzione Google Maps e attribuzioni di terze parti insieme ai risultati.
- Non persistere i contenuti Places restituiti dalla ricerca. I risultati sono effimeri; il Place ID puo essere conservato a tempo indeterminato.
- Verificare e aggiornare i Place ID con piu di 12 mesi durante il futuro processo periodico di manutenzione.
- Prima dell'import permanente, definire quali dati possono essere acquisiti da una fonte indipendente o con un trattamento compatibile con i termini applicabili.

### Attivazione locale

1. Abilitare Places API (New) nel progetto Google Cloud.
2. Creare una API key limitata alla sola Places API (New).
3. Inserire `GOOGLE_PLACES_API_KEY` in `.env.local`.
4. Riavviare il server e verificare una ricerca da 5 risultati.

In produzione applicare anche una restrizione adatta al backend e monitorare quota e costi.

## Provider AI

### Uso MVP

- Valutare lead gia normalizzati.
- Restituire JSON strutturato:
  - score 0-100;
  - servizio consigliato;
  - motivazione;
  - segnali positivi;
  - segnali negativi;
  - confidenza.

### Regole

- Prompt versionato.
- Output validato.
- Fallback se AI non disponibile.
- Nessuna decisione irreversibile solo AI.
- Provider da scegliere tra Gemini e OpenAI.
- Implementare interfaccia astratta per evitare lock-in.

## Calendly o booking URL

### Uso MVP

- Solo un link configurabile nelle impostazioni.
- Inserimento nel template messaggio.

### Futuro

- Webhook booking.
- Aggiornamento automatico stato lead a `booked`.

## WhatsApp

### Uso MVP

- Link `wa.me` generato lato client/server con testo codificato.
- L'utente decide manualmente se inviare.

### Futuro

- WhatsApp Business Platform solo se compliance e opt-in sono risolti.

## Notion

Rimandato.

Prima alternativa:

- export CSV;
- report interni;
- audit events.

## Google Sheets

Rimandato.

Prima alternativa:

- export CSV;
- eventuale scheduled export read-only.
