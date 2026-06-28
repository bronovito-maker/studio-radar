-- Daily email follow-up scheduler using Supabase Cron, pg_net and Vault.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

create or replace function private.trigger_email_followups()
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
    url := 'https://studio-radar.onrender.com/api/cron/email-followups',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke execute on function private.trigger_email_followups()
  from public, anon, authenticated;
grant execute on function private.trigger_email_followups() to postgres;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select jobid from cron.job where jobname = 'studio-radar-email-followups'
  loop
    perform cron.unschedule(v_job_id);
  end loop;
end $$;

select cron.schedule(
  'studio-radar-email-followups',
  '0 7 * * *',
  'select private.trigger_email_followups();'
);
