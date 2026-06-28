-- Admin-only lead assignment and nightly discovery scheduler.

create or replace function public.assign_lead(
  p_lead_id uuid,
  p_assigned_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_previous_assignee uuid;
begin
  if v_actor_id is null or not exists (
    select 1 from public.profiles
    where id = v_actor_id and role = 'admin'
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_assigned_to is not null and not exists (
    select 1 from public.profiles where id = p_assigned_to
  ) then
    raise exception 'Assignee not found' using errcode = 'P0002';
  end if;

  select assigned_to
  into v_previous_assignee
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if v_previous_assignee is not distinct from p_assigned_to then
    return;
  end if;

  update public.leads
  set assigned_to = p_assigned_to
  where id = p_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    p_lead_id,
    v_actor_id,
    'lead_assigned',
    jsonb_build_object('from', v_previous_assignee, 'to', p_assigned_to)
  );
end;
$$;

revoke execute on function public.assign_lead(uuid, uuid)
  from public, anon;
grant execute on function public.assign_lead(uuid, uuid) to authenticated;

create or replace function private.trigger_discovery()
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_secret text;
  v_request_id bigint;
begin
  select decrypted_secret
  into v_secret
  from vault.decrypted_secrets
  where name = 'studio_radar_cron_secret'
  order by created_at desc
  limit 1;

  if v_secret is null then
    raise exception 'Cron secret is not configured in Vault';
  end if;

  select net.http_get(
    url := 'https://studio-radar.onrender.com/api/cron/discovery',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function private.trigger_discovery()
  from public, anon, authenticated;
grant execute on function private.trigger_discovery() to postgres;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'studio-radar-discovery'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end $$;

select cron.schedule(
  'studio-radar-discovery',
  '0 3 * * *',
  'select private.trigger_discovery();'
);
