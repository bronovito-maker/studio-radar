-- Persistent per-user limits for expensive application actions.

create table public.rate_limit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null,
  occurred_at timestamptz not null default now(),
  constraint rate_limit_events_scope_check check (scope in (
    'places_search',
    'candidate_enrichment',
    'lead_ai_analysis',
    'outreach_draft',
    'csv_import'
  ))
);

create index rate_limit_events_actor_scope_time_idx
  on public.rate_limit_events (actor_id, scope, occurred_at desc);

alter table public.rate_limit_events enable row level security;
revoke all on public.rate_limit_events from public, anon, authenticated;
grant select, insert on public.rate_limit_events to authenticated;
grant usage, select on sequence public.rate_limit_events_id_seq to authenticated;

create policy "rate_limit_events_select_own"
on public.rate_limit_events for select
to authenticated
using (actor_id = (select auth.uid()));

create policy "rate_limit_events_insert_own"
on public.rate_limit_events for insert
to authenticated
with check (
  actor_id = (select auth.uid())
  and occurred_at between now() - interval '5 seconds' and now() + interval '5 seconds'
);

create or replace function public.consume_rate_limit(p_scope text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_limit integer;
  v_window interval;
  v_count integer;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select limits.max_requests, limits.window_size
  into v_limit, v_window
  from (values
    ('places_search'::text, 5, interval '1 minute'),
    ('candidate_enrichment'::text, 10, interval '1 hour'),
    ('lead_ai_analysis'::text, 20, interval '1 hour'),
    ('outreach_draft'::text, 30, interval '1 hour'),
    ('csv_import'::text, 5, interval '10 minutes')
  ) as limits(scope, max_requests, window_size)
  where limits.scope = p_scope;

  if v_limit is null then
    raise exception 'Unknown rate limit scope' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('rate:' || v_actor_id::text || ':' || p_scope, 0));

  select count(*)::integer
  into v_count
  from public.rate_limit_events
  where actor_id = v_actor_id
    and scope = p_scope
    and occurred_at >= now() - v_window;

  if v_count >= v_limit then
    return false;
  end if;

  insert into public.rate_limit_events (actor_id, scope)
  values (v_actor_id, p_scope);

  return true;
end;
$$;

revoke execute on function public.consume_rate_limit(text) from public, anon;
grant execute on function public.consume_rate_limit(text) to authenticated;
