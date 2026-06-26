-- Studio Radar initial CRM schema.
-- Applied to Supabase project qiqswidyfleeyromcrgi.

create extension if not exists pgcrypto;

-- The Supabase RLS docs provide an optional public SECURITY DEFINER event
-- trigger helper. If present, keep it internal-only so it is not callable
-- through the Data API as /rpc/rls_auto_enable.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type public.user_role as enum ('admin', 'collaborator');
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_status') then
    create type public.lead_status as enum (
      'new',
      'qualified',
      'to_contact',
      'contacted',
      'follow_up',
      'booked',
      'client',
      'discarded'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'lead_source') then
    create type public.lead_source as enum ('manual', 'csv', 'google_places');
  end if;

  if not exists (select 1 from pg_type where typname = 'score_grade') then
    create type public.score_grade as enum ('cold', 'warm', 'hot', 'priority');
  end if;

  if not exists (select 1 from pg_type where typname = 'scan_status') then
    create type public.scan_status as enum ('running', 'succeeded', 'failed');
  end if;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null,
  role public.user_role not null default 'collaborator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_not_empty check (length(trim(email)) > 0)
);

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  default_value numeric(12,2) not null,
  setup_value numeric(12,2),
  monthly_value numeric(12,2),
  is_recurring boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint services_default_value_non_negative check (default_value >= 0),
  constraint services_setup_value_non_negative check (setup_value is null or setup_value >= 0),
  constraint services_monthly_value_non_negative check (monthly_value is null or monthly_value >= 0)
);

create table if not exists public.settings (
  id integer primary key default 1,
  booking_url text,
  default_score_threshold integer not null default 50,
  cron_enabled boolean not null default false,
  cron_schedule text not null default '0 3 * * *',
  notion_sync_enabled boolean not null default false,
  sheets_sync_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1),
  constraint settings_threshold_range check (default_score_threshold between 0 and 100)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  business_name text not null,
  city text,
  region text,
  country text not null default 'IT',
  status public.lead_status not null default 'new',
  source public.lead_source not null default 'manual',
  google_place_id text,
  phone text,
  email text,
  website_url text,
  address text,
  category text,
  rating numeric(3,2),
  review_count integer,
  has_website boolean not null default false,
  has_booking boolean not null default false,
  recommended_service_id uuid references public.services(id) on delete set null,
  estimated_value numeric(12,2) not null default 0,
  assigned_to uuid references public.profiles(id) on delete set null,
  notes text not null default '',
  last_contacted_at timestamptz,
  booked_at timestamptz,
  became_client_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_business_name_not_empty check (length(trim(business_name)) > 0),
  constraint leads_rating_range check (rating is null or (rating >= 0 and rating <= 5)),
  constraint leads_review_count_non_negative check (review_count is null or review_count >= 0),
  constraint leads_estimated_value_non_negative check (estimated_value >= 0)
);

create table if not exists public.lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  score integer not null,
  grade public.score_grade not null,
  recommended_service_id uuid references public.services(id) on delete set null,
  reasoning text not null,
  positive_signals text[] not null default '{}',
  negative_signals text[] not null default '{}',
  deterministic_score integer not null,
  ai_score integer,
  confidence numeric(4,3),
  provider text,
  model text,
  prompt_version text,
  input_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint lead_scores_score_range check (score between 0 and 100),
  constraint lead_scores_deterministic_score_range check (deterministic_score between 0 and 100),
  constraint lead_scores_ai_score_range check (ai_score is null or ai_score between 0 and 100),
  constraint lead_scores_confidence_range check (confidence is null or (confidence >= 0 and confidence <= 1))
);

create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_events_type_not_empty check (length(trim(event_type)) > 0)
);

create table if not exists public.scan_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  category text not null,
  region text not null,
  status public.scan_status not null default 'running',
  found_count integer not null default 0,
  imported_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  constraint scan_runs_trigger_not_empty check (length(trim(trigger)) > 0),
  constraint scan_runs_category_not_empty check (length(trim(category)) > 0),
  constraint scan_runs_region_not_empty check (length(trim(region)) > 0),
  constraint scan_runs_counts_non_negative check (
    found_count >= 0 and imported_count >= 0 and duplicate_count >= 0
  )
);

create unique index if not exists leads_google_place_id_unique
  on public.leads (google_place_id)
  where google_place_id is not null;

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists services_active_sort_idx on public.services (is_active, sort_order);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_region_idx on public.leads (region);
create index if not exists leads_source_idx on public.leads (source);
create index if not exists leads_assigned_to_idx on public.leads (assigned_to);
create index if not exists leads_recommended_service_id_idx on public.leads (recommended_service_id);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists lead_scores_lead_id_created_at_idx on public.lead_scores (lead_id, created_at desc);
create index if not exists lead_scores_recommended_service_id_idx on public.lead_scores (recommended_service_id);
create index if not exists lead_scores_created_by_idx on public.lead_scores (created_by);
create index if not exists lead_events_lead_id_created_at_idx on public.lead_events (lead_id, created_at desc);
create index if not exists lead_events_actor_id_idx on public.lead_events (actor_id);
create index if not exists scan_runs_started_at_idx on public.scan_runs (started_at desc);
create index if not exists scan_runs_created_by_idx on public.scan_runs (created_by);

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_services_updated_at on public.services;
create trigger set_services_updated_at
before update on public.services
for each row execute function public.set_updated_at();

drop trigger if exists set_settings_updated_at on public.settings;
create trigger set_settings_updated_at
before update on public.settings
for each row execute function public.set_updated_at();

drop trigger if exists set_leads_updated_at on public.leads;
create trigger set_leads_updated_at
before update on public.leads
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.services enable row level security;
alter table public.settings enable row level security;
alter table public.leads enable row level security;
alter table public.lead_scores enable row level security;
alter table public.lead_events enable row level security;
alter table public.scan_runs enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.services to authenticated;
grant select, update on public.settings to authenticated;
grant select, insert, update, delete on public.leads to authenticated;
grant select, insert on public.lead_scores to authenticated;
grant select, insert on public.lead_events to authenticated;
grant select, insert, update on public.scan_runs to authenticated;

drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "services_select_authenticated" on public.services;
create policy "services_select_authenticated"
on public.services for select
to authenticated
using (true);

drop policy if exists "services_insert_admin" on public.services;
create policy "services_insert_admin"
on public.services for insert
to authenticated
with check (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists "services_update_admin" on public.services;
create policy "services_update_admin"
on public.services for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists "services_delete_admin" on public.services;
create policy "services_delete_admin"
on public.services for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists "settings_select_authenticated" on public.settings;
create policy "settings_select_authenticated"
on public.settings for select
to authenticated
using (true);

drop policy if exists "settings_update_admin" on public.settings;
create policy "settings_update_admin"
on public.settings for update
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

drop policy if exists "leads_all_authenticated" on public.leads;
create policy "leads_all_authenticated"
on public.leads for all
to authenticated
using (true)
with check (true);

drop policy if exists "lead_scores_select_authenticated" on public.lead_scores;
create policy "lead_scores_select_authenticated"
on public.lead_scores for select
to authenticated
using (true);

drop policy if exists "lead_scores_insert_authenticated" on public.lead_scores;
create policy "lead_scores_insert_authenticated"
on public.lead_scores for insert
to authenticated
with check (created_by is null or created_by = (select auth.uid()));

drop policy if exists "lead_events_select_authenticated" on public.lead_events;
create policy "lead_events_select_authenticated"
on public.lead_events for select
to authenticated
using (true);

drop policy if exists "lead_events_insert_authenticated" on public.lead_events;
create policy "lead_events_insert_authenticated"
on public.lead_events for insert
to authenticated
with check (actor_id is null or actor_id = (select auth.uid()));

drop policy if exists "scan_runs_select_authenticated" on public.scan_runs;
create policy "scan_runs_select_authenticated"
on public.scan_runs for select
to authenticated
using (true);

drop policy if exists "scan_runs_insert_authenticated" on public.scan_runs;
create policy "scan_runs_insert_authenticated"
on public.scan_runs for insert
to authenticated
with check (created_by is null or created_by = (select auth.uid()));

drop policy if exists "scan_runs_update_creator_or_admin" on public.scan_runs;
create policy "scan_runs_update_creator_or_admin"
on public.scan_runs for update
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
)
with check (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

insert into public.settings (id)
values (1)
on conflict (id) do nothing;

insert into public.services
  (slug, name, description, default_value, setup_value, monthly_value, is_recurring, sort_order)
values
  ('sito-nuovo', 'Sito nuovo', 'Realizzazione sito web professionale.', 2500, null, null, false, 10),
  ('restyling-sito', 'Restyling sito', 'Riprogettazione sito esistente.', 3000, null, null, false, 20),
  ('automazioni', 'Automazioni', 'Flussi operativi e automazioni leggere.', 1500, null, null, false, 30),
  ('booking-conversione', 'Booking e conversione', 'Ottimizzazione prenotazioni, form e conversioni.', 1200, null, null, false, 40),
  ('ads-setup', 'Ads setup', 'Setup campagne e tracciamenti iniziali.', 900, null, null, false, 50),
  ('branding-leggero', 'Branding leggero', 'Identita visiva essenziale per presenza digitale.', 1500, null, null, false, 60),
  ('presenza', 'Presenza', 'Pacchetto ricorrente base.', 890, 890, 97, true, 110),
  ('crescita', 'Crescita', 'Pacchetto ricorrente intermedio.', 2490, 2490, 247, true, 120),
  ('radar-pro', 'Radar Pro', 'Pacchetto ricorrente avanzato.', 4990, 4990, 497, true, 130)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  default_value = excluded.default_value,
  setup_value = excluded.setup_value,
  monthly_value = excluded.monthly_value,
  is_recurring = excluded.is_recurring,
  sort_order = excluded.sort_order,
  updated_at = now();

