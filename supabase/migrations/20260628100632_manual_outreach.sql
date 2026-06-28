-- Record a user-confirmed manual outreach and update the pipeline atomically.

create or replace function public.record_manual_outreach(
  p_lead_id uuid,
  p_channel text,
  p_message text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_old_status public.lead_status;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_channel not in ('whatsapp', 'email', 'phone')
    or length(trim(coalesce(p_message, ''))) < 10
    or length(trim(p_message)) > 2000 then
    raise exception 'Invalid outreach payload' using errcode = '22023';
  end if;

  select status
  into v_old_status
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if v_old_status in ('booked', 'client', 'discarded') then
    raise exception 'Lead status does not allow outreach' using errcode = '22023';
  end if;

  update public.leads
  set
    status = 'contacted',
    last_contacted_at = now()
  where id = p_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    p_lead_id,
    v_actor_id,
    'manual_outreach_recorded',
    jsonb_build_object(
      'channel', p_channel,
      'message', trim(p_message),
      'from', v_old_status,
      'to', 'contacted'
    )
  );
end;
$$;

revoke execute on function public.record_manual_outreach(uuid, text, text)
  from public, anon;

grant execute on function public.record_manual_outreach(uuid, text, text)
  to authenticated;
