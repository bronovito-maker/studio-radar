-- Transactional CRM operations and indexes for the first operational views.

create extension if not exists pg_trgm;

create index if not exists leads_status_created_at_idx
  on public.leads (status, created_at desc, id desc);

create index if not exists leads_region_created_at_idx
  on public.leads (region, created_at desc, id desc);

create index if not exists leads_business_name_trgm_idx
  on public.leads using gin (business_name gin_trgm_ops);

create index if not exists leads_city_trgm_idx
  on public.leads using gin (city gin_trgm_ops);

create index if not exists leads_category_trgm_idx
  on public.leads using gin (category gin_trgm_ops);

create or replace function public.create_manual_lead(
  p_business_name text,
  p_city text default null,
  p_region text default null,
  p_category text default null,
  p_phone text default null,
  p_email text default null,
  p_website_url text default null,
  p_estimated_value numeric default 0
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  insert into public.leads (
    business_name,
    city,
    region,
    category,
    phone,
    email,
    website_url,
    has_website,
    estimated_value,
    source
  )
  values (
    trim(p_business_name),
    nullif(trim(p_city), ''),
    nullif(trim(p_region), ''),
    nullif(trim(p_category), ''),
    nullif(trim(p_phone), ''),
    nullif(trim(p_email), ''),
    nullif(trim(p_website_url), ''),
    nullif(trim(p_website_url), '') is not null,
    p_estimated_value,
    'manual'
  )
  returning id into v_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    v_lead_id,
    v_actor_id,
    'lead_created',
    jsonb_build_object('source', 'manual')
  );

  return v_lead_id;
end;
$$;

create or replace function public.update_lead_status(
  p_lead_id uuid,
  p_status public.lead_status
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_status public.lead_status;
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select status
  into v_old_status
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if v_old_status = p_status then
    return;
  end if;

  update public.leads
  set
    status = p_status,
    last_contacted_at = case
      when p_status = 'contacted' and last_contacted_at is null then now()
      else last_contacted_at
    end,
    booked_at = case
      when p_status = 'booked' and booked_at is null then now()
      else booked_at
    end,
    became_client_at = case
      when p_status = 'client' and became_client_at is null then now()
      else became_client_at
    end
  where id = p_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    p_lead_id,
    v_actor_id,
    'status_changed',
    jsonb_build_object('from', v_old_status, 'to', p_status)
  );
end;
$$;

create or replace function public.update_lead_notes(
  p_lead_id uuid,
  p_notes text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_old_notes text;
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select notes
  into v_old_notes
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if v_old_notes = trim(p_notes) then
    return;
  end if;

  update public.leads
  set notes = trim(p_notes)
  where id = p_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    p_lead_id,
    v_actor_id,
    'notes_updated',
    jsonb_build_object(
      'previous_length', length(v_old_notes),
      'current_length', length(trim(p_notes))
    )
  );
end;
$$;

create or replace function public.get_dashboard_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when (select auth.uid()) is null then
      null
    else jsonb_build_object(
      'total', count(*),
      'qualified', count(*) filter (where status = 'qualified'),
      'to_contact', count(*) filter (where status = 'to_contact'),
      'contacted', count(*) filter (where status = 'contacted'),
      'booked', count(*) filter (where status = 'booked'),
      'clients', count(*) filter (where status = 'client'),
      'pipeline_value', coalesce(sum(estimated_value) filter (
        where status not in ('client', 'discarded')
      ), 0),
      'by_status', jsonb_build_object(
        'new', count(*) filter (where status = 'new'),
        'qualified', count(*) filter (where status = 'qualified'),
        'to_contact', count(*) filter (where status = 'to_contact'),
        'contacted', count(*) filter (where status = 'contacted'),
        'follow_up', count(*) filter (where status = 'follow_up'),
        'booked', count(*) filter (where status = 'booked'),
        'client', count(*) filter (where status = 'client'),
        'discarded', count(*) filter (where status = 'discarded')
      )
    )
  end
  from public.leads;
$$;

revoke execute on function public.create_manual_lead(text, text, text, text, text, text, text, numeric)
  from public, anon;
revoke execute on function public.update_lead_status(uuid, public.lead_status)
  from public, anon;
revoke execute on function public.update_lead_notes(uuid, text)
  from public, anon;
revoke execute on function public.get_dashboard_summary()
  from public, anon;

grant execute on function public.create_manual_lead(text, text, text, text, text, text, text, numeric)
  to authenticated;
grant execute on function public.update_lead_status(uuid, public.lead_status)
  to authenticated;
grant execute on function public.update_lead_notes(uuid, text)
  to authenticated;
grant execute on function public.get_dashboard_summary()
  to authenticated;
