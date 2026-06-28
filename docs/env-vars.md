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
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | si | Pubblica, protetta da RLS |
| `SUPABASE_SECRET_KEY` | futuro server | Mai nel client; solo per operazioni amministrative |

## Cron

| Nome | Obbligatoria | Note |
|---|---|---|
| `CRON_SECRET` | si prod | Lungo, random, solo server |

## Google Places

| Nome | Obbligatoria | Note |
|---|---|---|
| `GOOGLE_PLACES_API_KEY` | si per discovery live | Solo server; mai prefisso `NEXT_PUBLIC_` |

## AI Provider

OpenAI e il provider scelto. Il CRM continua a funzionare senza chiave, ma le analisi AI restano disabilitate.

| Nome | Obbligatoria | Note |
|---|---|---|
| `OPENAI_API_KEY` | si per analisi AI | Solo server |
| `AI_SCORING_PROVIDER` | si per analisi AI | Valore corrente: `openai` |
| `AI_SCORING_MODEL` | si per analisi AI | Default: `gpt-5.4-mini` |

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
