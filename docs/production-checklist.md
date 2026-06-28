# Checklist Produzione

## Configurazione esterna

- Collegare il repository GitHub a Vercel.
- Scegliere il dominio definitivo e impostare `NEXT_PUBLIC_APP_URL`.
- Caricare su Vercel tutte le variabili descritte in `env-vars.md`.
- Generare `CRON_SECRET` lungo e casuale.
- Caricare `SUPABASE_SECRET_KEY` soltanto come secret server-side.
- Configurare booking URL dalla pagina Impostazioni.

## Supabase Auth

- Attivare Leaked Password Protection.
- Configurare Site URL e redirect URL del dominio pubblico.
- Creare un account E2E admin e uno collaborator, senza dati reali.
- Eseguire `npm run test:e2e` con tutte le prove autenticate attive.
- Eliminare o disabilitare gli account E2E se non usati in CI.

## Provider esterni

- Limitare la Google API key a Places API (New) e al backend previsto.
- Impostare budget e alert Google Cloud.
- Impostare budget e alert OpenAI.
- Verificare quota e fatturazione con una ricerca e una analisi reali dal dominio pubblico.

## Gate Tecnici

- `npm test`
- `npm run test:e2e` senza skip
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- Supabase Security Advisor senza errori critici.
- Verifica manuale light/dark e mobile/desktop.
- Smoke test: login → discovery → shortlist → lead → score → outreach.
- Chiamata cron autorizzata e seconda chiamata concorrente respinta.

## Attivazione

- Lasciare `cron_enabled = false` durante il primo deploy.
- Eseguire il cron manualmente con header autorizzato.
- Controllare `scan_runs`, quota e shortlist.
- Abilitare il cron dalla pagina Impostazioni.
