# Modello Dati

## Convenzioni

- Primary key UUID.
- Timestamp `created_at`, `updated_at`.
- Enum PostgreSQL per stati e ruoli.
- RLS abilitata sulle tabelle esposte.
- Service role usata solo lato server.

## Tabelle

### `profiles`

Profilo applicativo collegato a Supabase Auth.

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | FK `auth.users.id`, PK |
| full_name | text | Nome visibile |
| email | text | Copia denormalizzata utile in UI |
| role | user_role | `admin`, `collaborator` |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `leads`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| business_name | text | Obbligatorio |
| city | text | |
| region | text | |
| country | text | Default `IT` |
| status | lead_status | Pipeline |
| source | lead_source | `google_places`, `csv`, `manual` |
| google_place_id | text | Unique nullable |
| phone | text | |
| email | text | |
| website_url | text | |
| address | text | |
| category | text | |
| rating | numeric | Da Places |
| review_count | int | Da Places |
| has_website | boolean | Derivato |
| has_booking | boolean | Derivato/manuale |
| estimated_value | numeric | Valore potenziale |
| assigned_to | uuid | FK `profiles.id` |
| notes | text | Note interne |
| last_contacted_at | timestamptz | |
| booked_at | timestamptz | |
| became_client_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `lead_scores`

Storico score, non solo ultimo valore.

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| lead_id | uuid | FK `leads.id` |
| score | int | 0-100 |
| grade | text | es. `cold`, `warm`, `hot` |
| recommended_service | text | |
| reasoning | text | Motivazione sintetica |
| deterministic_score | int | Score regole |
| ai_score | int | Nullable |
| model | text | Provider/modello |
| prompt_version | text | Versionamento |
| input_snapshot | jsonb | Dati usati |
| created_at | timestamptz | |

### `lead_events`

Timeline commerciale.

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| lead_id | uuid | FK |
| actor_id | uuid | FK `profiles.id` |
| event_type | text | `status_changed`, `note_added`, `contacted`, ecc. |
| payload | jsonb | Dettagli evento |
| created_at | timestamptz | |

### `scan_runs`

| Campo | Tipo | Note |
|---|---|---|
| id | uuid | PK |
| trigger | text | `manual`, `cron` |
| category | text | |
| region | text | |
| status | text | `running`, `succeeded`, `failed` |
| found_count | int | |
| imported_count | int | |
| duplicate_count | int | |
| error_message | text | Sanitizzato |
| started_at | timestamptz | |
| finished_at | timestamptz | |

### `settings`

Singola riga applicativa.

| Campo | Tipo | Note |
|---|---|---|
| id | int | Sempre `1` |
| booking_url | text | Link Calendly o alternativa |
| default_score_threshold | int | Default 50 |
| cron_enabled | boolean | |
| cron_schedule | text | Espressione UTC |
| notion_sync_enabled | boolean | Futuro |
| sheets_sync_enabled | boolean | Futuro |
| created_at | timestamptz | |
| updated_at | timestamptz | |

## Enum iniziali

### `lead_status`

- `new`
- `qualified`
- `to_contact`
- `contacted`
- `follow_up`
- `booked`
- `client`
- `discarded`

### `user_role`

- `admin`
- `collaborator`

### `lead_source`

- `manual`
- `csv`
- `google_places`

## Indici iniziali

- `leads(status)`
- `leads(region)`
- `leads(source)`
- `leads(score corrente via vista/materialized view se necessario)`
- `leads(google_place_id) unique where google_place_id is not null`
- `lead_scores(lead_id, created_at desc)`
- `lead_events(lead_id, created_at desc)`
- `scan_runs(started_at desc)`
