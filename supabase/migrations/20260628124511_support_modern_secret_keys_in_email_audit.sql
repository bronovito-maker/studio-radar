-- Modern `sb_secret_...` keys authorize as the service_role database role but
-- do not populate the legacy request.jwt.claim.role setting.

create or replace function public.record_email_sent(
  p_email_id uuid,
  p_provider_message_id text,
  p_follow_up_bodies text[] default array[]::text[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_message public.email_messages%rowtype;
  v_delays integer[];
  v_follow_up_enabled boolean;
  v_index integer;
  v_audited boolean;
begin
  select * into v_message
  from public.email_messages
  where id = p_email_id
  for update;

  if not found then
    raise exception 'Email message not found' using errcode = 'P0002';
  end if;
  if v_actor_id is null then
    if current_user <> 'service_role'
      and current_setting('request.jwt.claim.role', true) is distinct from 'service_role'
    then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    v_actor_id := v_message.created_by;
  end if;
  if v_message.status not in ('queued', 'sending', 'sent', 'delivered', 'opened', 'clicked') then
    raise exception 'Email message already processed' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_provider_message_id, ''))) < 3 then
    raise exception 'Provider message id required' using errcode = '22023';
  end if;
  if v_message.provider_message_id is not null
    and v_message.provider_message_id <> trim(p_provider_message_id)
  then
    raise exception 'Provider message id mismatch' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.lead_events
    where lead_id = v_message.lead_id
      and event_type = 'email_sent'
      and payload->>'email_message_id' = p_email_id::text
  ) into v_audited;

  update public.email_messages
  set status = case when status in ('queued', 'sending') then 'sent' else status end,
      provider_message_id = trim(p_provider_message_id),
      sent_at = coalesce(sent_at, now()), attempt_count = greatest(attempt_count, 1),
      error_code = null
  where id = p_email_id;

  update public.leads
  set status = case
        when status in ('new', 'qualified', 'to_contact', 'follow_up') then 'contacted'::public.lead_status
        else status
      end,
      last_contacted_at = now()
  where id = v_message.lead_id;

  if not v_audited then
    insert into public.lead_events (lead_id, actor_id, event_type, payload)
    values (
      v_message.lead_id,
      v_actor_id,
      'email_sent',
      jsonb_build_object(
        'email_message_id', p_email_id,
        'sequence_number', v_message.sequence_number,
        'subject', v_message.subject
      )
    );
  end if;

  if v_message.sequence_number = 0 then
    select email_follow_up_enabled, email_follow_up_delays
    into v_follow_up_enabled, v_delays
    from public.settings where id = 1;

    if v_follow_up_enabled and cardinality(p_follow_up_bodies) > 0 then
      for v_index in 1..least(cardinality(v_delays), cardinality(p_follow_up_bodies), 3) loop
        if length(trim(coalesce(p_follow_up_bodies[v_index], ''))) between 20 and 10000 then
          insert into public.email_messages (
            thread_id, lead_id, parent_message_id, sequence_number, kind, status,
            recipient_email, recipient_name, subject, body, scheduled_for, created_by
          ) values (
            v_message.thread_id,
            v_message.lead_id,
            v_message.id,
            v_index,
            'follow_up',
            'queued',
            v_message.recipient_email,
            v_message.recipient_name,
            case when v_message.subject ~* '^re:' then v_message.subject else 'Re: ' || v_message.subject end,
            trim(p_follow_up_bodies[v_index]),
            now() + make_interval(days => v_delays[v_index]),
            v_actor_id
          ) on conflict (thread_id, sequence_number) do nothing;
        end if;
      end loop;
    end if;
  end if;
end;
$$;
