# Variabili Ambiente

Questo file descrive le variabili previste. I valori reali non vanno committati.

## Applicazione

| Nome | Obbligatoria | Note |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | si | URL pubblico app |
| `NODE_ENV` | si | Gestito dalla piattaforma |

## Supabase

| Nome | Obbligatoria | Note |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | si | Pubblica |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | si | Pubblica, protetta da RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | si server | Mai nel client |

## Cron

| Nome | Obbligatoria | Note |
|---|---|---|
| `CRON_SECRET` | si prod | Lungo, random, solo server |

## Google Places

| Nome | Obbligatoria | Note |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | si per discovery | Solo server |

## AI Provider

Una sola delle seguenti famiglie sara richiesta in base alla scelta provider.

| Nome | Obbligatoria | Note |
|---|---|---|
| `ANTHROPIC_API_KEY` | se Anthropic | Solo server |
| `OPENAI_API_KEY` | se OpenAI | Solo server |
| `AI_SCORING_MODEL` | si per scoring AI | Nome modello configurabile |

## Booking

| Nome | Obbligatoria | Note |
|---|---|---|
| `DEFAULT_BOOKING_URL` | no | Configurabile anche da DB |

## Futuro

| Nome | Note |
|---|---|
| `NOTION_API_KEY` | quando sync Notion sara implementato |
| `NOTION_DATABASE_ID` | quando sync Notion sara implementato |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | quando sync Sheets sara implementato |
| `GOOGLE_SHEETS_PRIVATE_KEY` | quando sync Sheets sara implementato |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | quando sync Sheets sara implementato |

