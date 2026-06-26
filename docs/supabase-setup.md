# Setup Supabase

## Progetto

- Project ref: `qiqswidyfleeyromcrgi`
- Project URL: `https://qiqswidyfleeyromcrgi.supabase.co`
- MCP server: `supabase`

## Stato schema

Le migrazioni si trovano in `supabase/migrations`.

Tabelle MVP:

- `profiles`
- `services`
- `settings`
- `leads`
- `lead_scores`
- `lead_events`
- `scan_runs`

Tutte le tabelle pubbliche hanno RLS attiva.

## Variabili locali

Creare `.env.local` con:

```text
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://qiqswidyfleeyromcrgi.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

La publishable key puo essere usata nel browser perche l'accesso ai dati e protetto da RLS.

Non usare una secret key nel browser o in variabili `NEXT_PUBLIC_*`.

## Primo utente admin

1. Creare l'utente da Supabase Authentication.
2. La trigger `private.handle_new_user()` crea automaticamente il profilo con ruolo `collaborator`.
3. Promuovere il primo utente ad admin dal SQL Editor o MCP:

```sql
update public.profiles
set role = 'admin'
where email = 'email-admin@example.com';
```

Non esiste promozione self-service da UI.

## Sicurezza verificata

- Anon non ha policy di accesso ai dati CRM.
- Authenticated puo lavorare su tutti i lead, come deciso per il MVP.
- Un utente non puo aggiornare la colonna `profiles.role`.
- La funzione `public.rls_auto_enable()` non e eseguibile da anon/authenticated.
- Le funzioni privilegiate restano in schema `private`.
- Supabase Security Advisor: nessun warning attivo dopo le migrazioni.

## Auth Next.js

Il progetto usa:

- `@supabase/ssr`;
- client browser e server separati;
- cookie SSR;
- `getClaims()` nel proxy;
- redirect anonimo a `/login`;
- dashboard dinamica non cacheabile come pagina statica.

