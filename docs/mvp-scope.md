# Scope MVP

## Obiettivo MVP

Validare il flusso completo:

1. inserisco o cerco lead;
2. il sistema li deduplica;
3. il sistema assegna score e motivazione;
4. gestisco priorita e stato;
5. preparo outreach manuale;
6. misuro avanzamento pipeline.

## Incluso

### Autenticazione

- Login con Supabase Auth.
- Ruoli iniziali: `admin`, `collaborator`.
- Sessione gestita via cookie sicuri/server side.
- I collaboratori vedono tutti i lead nel MVP.

### Dashboard

- Lead totali.
- Lead qualificati.
- Da contattare.
- Contattati.
- Prenotati.
- Clienti.
- Valore pipeline stimato.
- Distribuzione per stato e area.

### Lead database

- Tabella paginata server side.
- Filtri per stato, regione, score minimo, sorgente, testo libero.
- Dettaglio lead.
- Modifica dei dati anagrafici del lead dopo il salvataggio.
- Note interne.
- Cambio stato rapido.
- Assegnazione collaboratore.
- Export CSV.

### Ricerca lead

- Ricerca manuale per categoria e zona.
- Integrazione Google Places.
- Import selettivo dei risultati.
- Deduplica per `place_id`, nome + citta, telefono o sito.

### Scoring

- Score deterministico base.
- Score AI solo per lead con dati sufficienti o potenziale minimo.
- Salvataggio di score, motivazione, versione prompt e modello.

### Outreach manuale

- Generazione messaggio WhatsApp precompilato.
- Apertura link `wa.me`.
- Tracciamento tramite cambio stato a `contattato`.
- Un solo booking link globale.
- Invio email Brevo singolo dopo approvazione.
- Tracking consegna, apertura, click e bounce.
- Follow-up email opzionali con limite giornaliero e stop controllato.

### Import

- Import CSV.
- Mappatura colonne essenziale.
- Anteprima righe e duplicati.

### Audit

- Eventi tracciati per cambi di stato, import, scoring e contatto.

## Escluso dal MVP

- Invio WhatsApp via API.
- Notion sync.
- Google Sheets sync automatico.
- Calendly API profonda.
- Multi-brand complesso.
- Client portal.
- Kanban drag and drop.
- Mobile app nativa.

## Criteri di successo MVP

- Un admin puo importare/cercare lead e lavorarli senza fogli esterni.
- Ogni lead qualificato ha una motivazione leggibile.
- Nessun endpoint dati funziona senza autenticazione.
- Le azioni critiche sono auditate.
- Il flusso principale e coperto da test e verificato in browser.
