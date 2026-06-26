# Integrazioni

## Google Places

### Uso MVP

- Ricerca attivita per categoria + area.
- Recupero campi minimi: nome, indirizzo, telefono se disponibile, sito, rating, numero recensioni, place id, categoria.
- Deduplica su `google_place_id`.

### Regole

- Richiedere solo i campi necessari.
- Salvare snapshot dei dati usati per scoring.
- Gestire quota, errori e retry.
- Non fare scraping HTML di Google.

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
