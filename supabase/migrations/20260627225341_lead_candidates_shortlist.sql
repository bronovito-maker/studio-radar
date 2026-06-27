-- Shared shortlist storing only Google Place IDs and first-party search context.

create table public.lead_candidates (
  id uuid primary key default gen_random_uuid(),
  google_place_id text not null unique,
  search_category text not null,
  search_location text not null,
  search_region text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_candidates_place_id_not_empty check (length(trim(google_place_id)) > 0),
  constraint lead_candidates_context_not_empty check (
    length(trim(search_category)) > 0
    and length(trim(search_location)) > 0
    and length(trim(search_region)) > 0
  )
);

create index lead_candidates_created_at_idx
  on public.lead_candidates (created_at desc);
create index lead_candidates_created_by_idx
  on public.lead_candidates (created_by);

create trigger set_lead_candidates_updated_at
before update on public.lead_candidates
for each row execute function public.set_updated_at();

alter table public.lead_candidates enable row level security;

revoke all on public.lead_candidates from public, anon, authenticated;
grant select, insert, delete on public.lead_candidates to authenticated;

create policy "lead_candidates_select_team"
on public.lead_candidates for select
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid())
  )
);

create policy "lead_candidates_insert_own"
on public.lead_candidates for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "lead_candidates_delete_creator_or_admin"
on public.lead_candidates for delete
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);
