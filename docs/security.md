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

Da prevedere per:

- login;
- ricerca Places;
- scoring AI;
- import CSV;
- cron manuale.

## WhatsApp e outreach

Nel MVP e consentita solo generazione manuale di link `wa.me` con messaggio precompilato.

Non includere invio automatico massivo WhatsApp senza:

- opt-in dimostrabile;
- template approvati se necessari;
- verifica policy Meta;
- controllo legale/compliance.

## Privacy

- Salvare solo dati necessari al processo commerciale.
- Evitare note sensibili non rilevanti.
- Prevedere cancellazione/anonymization lead.
- Tracciare origine dati (`source`) e timestamp.

## Checklist pre-deploy

- RLS abilitata su tutte le tabelle pubbliche.
- Nessuna service key nel browser bundle.
- API protette testate.
- CORS ristretto se necessario.
- Cron secret lungo e random.
- Build senza warning critici.
- Test auth negativi: utente anonimo riceve 401/403.

