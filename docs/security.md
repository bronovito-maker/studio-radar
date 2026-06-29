# Sicurezza e Compliance

## Principio

Il sistema gestisce dati commerciali e contatti. Deve essere progettato come strumento interno sicuro, non come demo aperta.

## Autenticazione

- Usare Supabase Auth.
- Sessioni con cookie sicuri.
- Nessun endpoint dati accessibile senza sessione valida.
- Ruoli applicativi gestiti in `profiles`.

## Autorizzazione

- RLS abilitata su tabelle esposte.
- Policy minime:
  - admin: accesso completo;
  - collaborator: accesso ai lead assegnati o visibili al team, secondo configurazione MVP;
  - service role: solo server side.

## API

- Tutte le route `/api/*` devono verificare auth, tranne callback pubbliche esplicitamente documentate.
- Il cron usa secret dedicato e non sessione utente.
- Validazione input con schema runtime.
- Errori sanitizzati verso client.

## Segreti

Mai committare:

- Supabase service role key;
- Google Places API key;
- AI provider key;
- cron secret;
- token Notion/Sheets futuri.

Usare `.env.local` in sviluppo e secret manager in produzione.

## Rate limit

Implementato con eventi persistenti per utente e scope per:

- ricerca Places;
- interpretazione AI delle evidenze;
- import CSV;
- arricchimento candidati;
- bozze outreach.

Il login resta protetto dai controlli Supabase Auth; CAPTCHA e Leaked Password Protection vanno attivati prima del deploy pubblico.

## WhatsApp e outreach

Nel MVP e consentita solo generazione manuale di link `wa.me` con messaggio precompilato.

Non includere invio automatico massivo WhatsApp senza:

- opt-in dimostrabile;
- template approvati se necessari;
- verifica policy Meta;
- controllo legale/compliance.

## Email outreach massivo (Fase 8)

L'email outreach massivo segue regole di sicurezza aggiuntive:

- **Nessun invio automatico.** Il cron notturno prepara le email in stato `queued` ma non le invia mai. Solo un admin autenticato può attivare l'invio tramite pulsante "Approva e invia".
- **Anti-ban Brevo.** Invio con delay di 1.5 secondi tra email, rispetto del limite giornaliero, stop immediato su rate limit 429.
- **Opt-out obbligatorio.** Ogni email include il footer di disiscrizione.
- **Solo contatti reali.** Le email vengono preparate solo se il web scouting ha estratto un'email reale dal sito aziendale. Mai indirizzi `info@` indovinati.
- **Filtro chatbot.** Lead con chatbot concorrenti (Intercom, Drift, Tawk, ecc.) vengono automaticamente esclusi dalla coda email.
- **Nessun dato sensibile.** Il web scouting estrae solo dati pubblici già visibili sui siti web aziendali.
- **Protezione SSRF.** Lo scout accetta solo HTTP(S), valida ogni redirect e risoluzione DNS, blocca reti private/locali e limita realmente ogni risposta a 300KB.
- **Limite atomico.** La prenotazione delle email dovute avviene in PostgreSQL sotto lock, evitando sforamenti in caso di click concorrenti.

## Privacy

- Salvare solo dati necessari al processo commerciale.
- Evitare note sensibili non rilevanti.
- Anonimizzazione lead disponibile solo agli admin; rimuove PII, note, score e messaggi lasciando un marker minimale.
- Tracciare origine dati (`source`) e timestamp.

## Checklist pre-deploy

- RLS abilitata su tutte le tabelle pubbliche.
- Nessuna service key nel browser bundle.
- API protette testate.
- CORS ristretto se necessario.
- Cron secret lungo e random.
- Build senza warning critici.
- Test auth negativi: utente anonimo riceve 401/403.
- Test browser anonimi eseguiti; test admin/collaborator configurabili tramite account E2E dedicati.
