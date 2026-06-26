# ADR 0002 - Niente invio WhatsApp automatico nel MVP

## Stato

Accettata.

## Contesto

L'outreach WhatsApp ha vincoli di policy, opt-in e template approvati. L'invio automatico massivo introduce rischio compliance e reputazionale.

## Decisione

Nel MVP il sistema genera solo link `wa.me` con messaggio precompilato. L'invio resta manuale.

## Conseguenze

Positive:

- Riduce rischio policy.
- Mantiene supervisione umana.
- Semplifica sviluppo.

Trade-off:

- Meno automazione immediata.
- Metriche invio dipendono da azione manuale dell'utente.

