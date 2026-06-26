# ADR 0001 - Usare Supabase PostgreSQL

## Stato

Accettata.

## Contesto

Il prodotto richiede autenticazione, database relazionale, policy di sicurezza, audit e sviluppo rapido.

## Decisione

Usare Supabase PostgreSQL con Supabase Auth e Row Level Security.

## Conseguenze

Positive:

- Postgres solido e interrogabile.
- Auth integrata.
- RLS per defense in depth.
- Buon fit con Next.js.

Trade-off:

- Serve disciplina sulle policy.
- Service role deve restare rigorosamente server side.

