-- Mass discovery and auto-outreach: configurable page size + optional automated email after discovery.

alter table public.settings
  add column cron_page_size integer not null default 20,
  add column email_auto_outreach_enabled boolean not null default false;

alter table public.settings
  add constraint settings_cron_page_size_range
    check (cron_page_size between 1 and 50);

-- Grant service_role the ability to create leads without a user session.
-- The existing confirm_candidate_to_lead already uses auth.uid() checks;
-- for cron-driven auto-conversion we need a service_role-friendly path.
create or replace function public.auto_create_lead_from_place(
  p_google_place_id text,
  p_business_name text,
  p_city text default null,
  p_region text default null,
  p_category text default null,
  p_phone text default null,
  p_email text default null,
  p_website_url text default null,
  p_address text default null,
  p_has_booking boolean default false,
  p_rating numeric default null,
  p_review_count integer default null,
  p_estimated_value numeric default 0,
  p_origin text default 'cron'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_email_key text;
  v_phone_key text;
  v_website_key text;
  v_business_city_key text;
  v_duplicate_id uuid;
  v_lead_id uuid;
begin
  -- Only service_role or an explicit override can call this.
  if current_setting('role', true) is distinct from 'service_role'
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required for automated lead creation'
      using errcode = '42501';
  end if;

  if length(trim(coalesce(p_business_name, ''))) < 2
     or p_estimated_value < 0
     or p_estimated_value > 10000000
     or p_origin not in ('cron', 'manual') then
    raise exception 'Invalid lead payload' using errcode = '22023';
  end if;

  -- Resolve actor: use the first admin profile.
  select id into v_actor_id
  from public.profiles
  where role = 'admin'
  order by created_at
  limit 1;

  if not found then
    raise exception 'No admin profile available for auto-creation'
      using errcode = 'P0002';
  end if;

  -- Deduplication keys.
  v_email_key := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone_key := nullif(regexp_replace(coalesce(p_phone, ''), '[^0-9]+', '', 'g'), '');
  if v_phone_key is not null and length(v_phone_key) < 7 then
    v_phone_key := null;
  end if;

  v_website_key := lower(trim(coalesce(p_website_url, '')));
  v_website_key := regexp_replace(v_website_key, '^https?://', '', 'i');
  v_website_key := regexp_replace(v_website_key, '^www\.', '', 'i');
  v_website_key := nullif(split_part(split_part(v_website_key, '/', 1), '?', 1), '');

  v_business_city_key :=
    lower(regexp_replace(trim(p_business_name), '\s+', ' ', 'g'))
    || '|'
    || lower(regexp_replace(trim(coalesce(p_city, '')), '\s+', ' ', 'g'));

  -- Lock and check duplicates.
  perform pg_advisory_xact_lock(hashtextextended('place:' || p_google_place_id, 0));
  if v_email_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('email:' || v_email_key, 0));
  end if;
  if v_phone_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('phone:' || v_phone_key, 0));
  end if;
  if v_website_key is not null then
    perform pg_advisory_xact_lock(hashtextextended('website:' || v_website_key, 0));
  end if;
  perform pg_advisory_xact_lock(hashtextextended('business-city:' || v_business_city_key, 0));

  select id into v_duplicate_id
  from public.leads
  where
    google_place_id = p_google_place_id
    or (v_email_key is not null and email_normalized = v_email_key)
    or (v_phone_key is not null and phone_normalized = v_phone_key)
    or (v_website_key is not null and website_normalized = v_website_key)
    or business_city_normalized = v_business_city_key
  order by created_at
  limit 1;

  if v_duplicate_id is not null then
    return jsonb_build_object('status', 'duplicate', 'lead_id', v_duplicate_id);
  end if;

  insert into public.leads (
    business_name, city, region, category, phone, email, website_url, address,
    has_website, has_booking, rating, review_count, estimated_value,
    source, google_place_id
  )
  values (
    trim(p_business_name),
    nullif(trim(coalesce(p_city, '')), ''),
    nullif(trim(coalesce(p_region, '')), ''),
    nullif(trim(coalesce(p_category, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''),
    nullif(trim(coalesce(p_website_url, '')), ''),
    nullif(trim(coalesce(p_address, '')), ''),
    nullif(trim(coalesce(p_website_url, '')), '') is not null,
    coalesce(p_has_booking, false),
    p_rating,
    p_review_count,
    p_estimated_value,
    'google_places',
    p_google_place_id
  )
  returning id into v_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    v_lead_id,
    v_actor_id,
    'auto_discovered',
    jsonb_build_object(
      'google_place_id', p_google_place_id,
      'origin', p_origin
    )
  );

  return jsonb_build_object('status', 'created', 'lead_id', v_lead_id);
end;
$$;

revoke execute on function public.auto_create_lead_from_place(
  text, text, text, text, text, text, text, text, text, boolean, numeric, integer, numeric, text
) from public, anon, authenticated;

grant execute on function public.auto_create_lead_from_place(
  text, text, text, text, text, text, text, text, text, boolean, numeric, integer, numeric, text
) to service_role;

-- The regular score RPC intentionally requires an authenticated user. This
-- narrowly scoped wrapper lets backend discovery jobs attribute the score to
-- the first admin without broadening the regular function's permissions.
create or replace function public.save_automated_deterministic_score(
  p_lead_id uuid,
  p_score integer,
  p_grade public.score_grade,
  p_reasoning text,
  p_positive_signals text[],
  p_negative_signals text[],
  p_confidence numeric,
  p_version text,
  p_input_snapshot jsonb,
  p_recommended_service_slug text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_score_id uuid;
begin
  if current_setting('role', true) is distinct from 'service_role'
     and current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'Service role required for automated scoring' using errcode = '42501';
  end if;

  select id into v_actor_id
  from public.profiles
  where role = 'admin'
  order by created_at
  limit 1;
  if not found then
    raise exception 'No admin profile available for automated scoring' using errcode = 'P0002';
  end if;

  perform set_config('request.jwt.claim.sub', v_actor_id::text, true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', v_actor_id::text, 'role', 'authenticated')::text,
    true
  );
  v_score_id := public.save_deterministic_score(
    p_lead_id, p_score, p_grade, p_reasoning, p_positive_signals,
    p_negative_signals, p_confidence, p_version, p_input_snapshot,
    p_recommended_service_slug
  );
  return v_score_id;
end;
$$;

revoke execute on function public.save_automated_deterministic_score(
  uuid, integer, public.score_grade, text, text[], text[], numeric, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.save_automated_deterministic_score(
  uuid, integer, public.score_grade, text, text[], text[], numeric, text, jsonb, text
) to service_role;

-- Atomically reserves only due messages while holding the settings row lock,
-- so concurrent admin clicks cannot exceed the configured daily allowance.
create or replace function public.claim_queued_initial_emails(p_requested_limit integer default 50)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_daily_limit integer;
  v_used integer;
  v_capacity integer;
  v_messages jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  ) then
    raise exception 'Admin required' using errcode = '42501';
  end if;
  if p_requested_limit not between 1 and 50 then
    raise exception 'Invalid requested limit' using errcode = '22023';
  end if;

  select email_daily_limit into v_daily_limit
  from public.settings
  where id = 1
  for update;

  update public.email_messages
  set status = 'failed', failed_at = now(), error_code = 'SEND_STATE_UNKNOWN'
  where status = 'sending' and updated_at < now() - interval '30 minutes';

  select count(*)::integer into v_used
  from public.email_messages
  where sent_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
     or (status = 'sending' and updated_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC');
  v_capacity := greatest(0, least(p_requested_limit, v_daily_limit - v_used));

  if v_capacity = 0 then return '[]'::jsonb; end if;

  with due as (
    select id
    from public.email_messages
    where status = 'queued'
      and kind = 'initial'
      and scheduled_for <= now()
    order by scheduled_for, created_at
    for update skip locked
    limit v_capacity
  ), claimed as (
    update public.email_messages message
    set status = 'sending'
    from due
    where message.id = due.id
    returning message.id, message.lead_id, message.recipient_email,
      message.recipient_name, message.subject, message.body, message.kind,
      message.attempt_count
  )
  select coalesce(jsonb_agg(to_jsonb(claimed)), '[]'::jsonb)
  into v_messages
  from claimed;

  return v_messages;
end;
$$;

revoke execute on function public.claim_queued_initial_emails(integer) from public, anon;
grant execute on function public.claim_queued_initial_emails(integer) to authenticated;
