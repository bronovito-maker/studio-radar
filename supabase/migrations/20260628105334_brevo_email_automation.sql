-- Brevo outbound email, delivery events and controlled follow-up queue.

alter table public.settings
  add column email_enabled boolean not null default false,
  add column email_sender_name text not null default 'Studio Radar',
  add column email_sender_email text,
  add column email_reply_to text,
  add column email_daily_limit integer not null default 60,
  add column email_follow_up_enabled boolean not null default false,
  add column email_follow_up_delays integer[] not null default array[3, 6, 9];

alter table public.settings
  add constraint settings_email_sender_name_not_empty
    check (length(trim(email_sender_name)) between 1 and 120),
  add constraint settings_email_sender_email_length
    check (email_sender_email is null or length(trim(email_sender_email)) between 3 and 254),
  add constraint settings_email_reply_to_length
    check (email_reply_to is null or length(trim(email_reply_to)) between 3 and 254),
  add constraint settings_email_daily_limit_range
    check (email_daily_limit between 1 and 300),
  add constraint settings_email_follow_up_delays_valid
    check (
      cardinality(email_follow_up_delays) between 1 and 3
      and email_follow_up_delays <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30]
    );

alter table public.leads
  add column last_email_opened_at timestamptz,
  add column last_email_clicked_at timestamptz,
  add column email_replied_at timestamptz,
  add column email_suppressed_at timestamptz;

create table public.email_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  parent_message_id uuid references public.email_messages(id) on delete cascade,
  sequence_number smallint not null default 0,
  kind text not null default 'initial',
  status text not null default 'queued',
  recipient_email text not null,
  recipient_name text not null,
  subject text not null,
  body text not null,
  provider text not null default 'brevo',
  provider_message_id text,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  first_opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  error_code text,
  attempt_count smallint not null default 0,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_messages_sequence_range check (sequence_number between 0 and 3),
  constraint email_messages_kind_check check (kind in ('initial', 'follow_up')),
  constraint email_messages_status_check check (
    status in ('queued', 'sending', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'cancelled')
  ),
  constraint email_messages_recipient_email_length check (length(trim(recipient_email)) between 3 and 254),
  constraint email_messages_recipient_name_length check (length(trim(recipient_name)) between 1 and 160),
  constraint email_messages_subject_length check (length(trim(subject)) between 2 and 200),
  constraint email_messages_body_length check (length(trim(body)) between 20 and 10000),
  constraint email_messages_attempt_count_range check (attempt_count between 0 and 5),
  unique (thread_id, sequence_number)
);

create table public.email_provider_events (
  id bigint generated always as identity primary key,
  email_message_id uuid not null references public.email_messages(id) on delete cascade,
  event_key text not null unique,
  event_type text not null,
  occurred_at timestamptz not null,
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  constraint email_provider_events_key_not_empty check (length(trim(event_key)) > 0),
  constraint email_provider_events_type_not_empty check (length(trim(event_type)) > 0)
);

create index email_messages_lead_created_at_idx
  on public.email_messages (lead_id, created_at desc);

create index email_messages_due_queue_idx
  on public.email_messages (scheduled_for, id)
  where status = 'queued';

create index email_messages_provider_id_idx
  on public.email_messages (provider_message_id)
  where provider_message_id is not null;

create index email_messages_sent_at_idx
  on public.email_messages (sent_at)
  where sent_at is not null;

create index email_provider_events_message_occurred_idx
  on public.email_provider_events (email_message_id, occurred_at desc);

create trigger set_email_messages_updated_at
before update on public.email_messages
for each row execute function public.set_updated_at();

alter table public.email_messages enable row level security;
alter table public.email_provider_events enable row level security;

revoke all on public.email_messages, public.email_provider_events
  from public, anon, authenticated;
revoke all on sequence public.email_provider_events_id_seq
  from public, anon, authenticated;

grant select, insert, update, delete on public.email_messages to authenticated;
grant select on public.email_provider_events to authenticated;

create policy "email_messages_select_team"
on public.email_messages for select
to authenticated
using (true);

create policy "email_messages_insert_own"
on public.email_messages for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "email_messages_update_creator_or_admin"
on public.email_messages for update
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

create policy "email_messages_delete_admin"
on public.email_messages for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

create policy "email_provider_events_select_team"
on public.email_provider_events for select
to authenticated
using (true);

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
begin
  select * into v_message
  from public.email_messages
  where id = p_email_id
  for update;

  if not found then
    raise exception 'Email message not found' using errcode = 'P0002';
  end if;
  if v_actor_id is null then
    if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    v_actor_id := v_message.created_by;
  end if;
  if v_message.status not in ('queued', 'sending') then
    raise exception 'Email message already processed' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_provider_message_id, ''))) < 3 then
    raise exception 'Provider message id required' using errcode = '22023';
  end if;

  update public.email_messages
  set status = 'sent', provider_message_id = trim(p_provider_message_id),
      sent_at = now(), attempt_count = attempt_count + 1, error_code = null
  where id = p_email_id;

  update public.leads
  set status = case
        when status in ('new', 'qualified', 'to_contact', 'follow_up') then 'contacted'::public.lead_status
        else status
      end,
      last_contacted_at = now()
  where id = v_message.lead_id;

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

create or replace function public.record_email_reply(p_lead_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1 from public.leads where id = p_lead_id for update;
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  update public.leads
  set email_replied_at = now(), status = 'follow_up'
  where id = p_lead_id and status not in ('booked', 'client', 'discarded');

  update public.email_messages
  set status = 'cancelled', cancelled_at = now(), error_code = 'RECIPIENT_REPLIED'
  where lead_id = p_lead_id and status = 'queued';

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (p_lead_id, v_actor_id, 'email_reply_recorded', jsonb_build_object('follow_ups_cancelled', true));
end;
$$;

create or replace function public.record_email_provider_event(
  p_email_id uuid,
  p_event_key text,
  p_event_type text,
  p_provider_message_id text,
  p_occurred_at timestamptz,
  p_payload jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead_id uuid;
  v_thread_id uuid;
  v_inserted_id bigint;
  v_negative boolean := p_event_type in ('soft_bounce', 'hard_bounce', 'spam', 'invalid', 'blocked', 'error', 'unsubscribed');
  v_suppress boolean := p_event_type in ('hard_bounce', 'spam', 'invalid', 'blocked', 'unsubscribed');
begin
  select lead_id, thread_id into v_lead_id, v_thread_id
  from public.email_messages
  where id = p_email_id
  for update;

  if not found then return false; end if;

  insert into public.email_provider_events (
    email_message_id, event_key, event_type, occurred_at, payload
  ) values (
    p_email_id, trim(p_event_key), trim(p_event_type), p_occurred_at, coalesce(p_payload, '{}'::jsonb)
  ) on conflict (event_key) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then return false; end if;

  update public.email_messages
  set
    provider_message_id = coalesce(provider_message_id, nullif(trim(p_provider_message_id), '')),
    status = case
      when p_event_type = 'click' then 'clicked'
      when p_event_type in ('opened', 'unique_opened', 'proxy_open', 'unique_proxy_open') and status <> 'clicked' then 'opened'
      when p_event_type = 'delivered' and status not in ('opened', 'clicked') then 'delivered'
      when p_event_type in ('request', 'sent') and status in ('queued', 'sending') then 'sent'
      when p_event_type in ('soft_bounce', 'hard_bounce', 'spam', 'invalid', 'blocked', 'unsubscribed') then 'bounced'
      when p_event_type = 'error' then 'failed'
      else status
    end,
    sent_at = case when p_event_type in ('request', 'sent') then coalesce(sent_at, p_occurred_at) else sent_at end,
    delivered_at = case when p_event_type = 'delivered' then coalesce(delivered_at, p_occurred_at) else delivered_at end,
    first_opened_at = case when p_event_type in ('opened', 'unique_opened', 'proxy_open', 'unique_proxy_open') then coalesce(first_opened_at, p_occurred_at) else first_opened_at end,
    clicked_at = case when p_event_type = 'click' then coalesce(clicked_at, p_occurred_at) else clicked_at end,
    bounced_at = case when p_event_type in ('soft_bounce', 'hard_bounce', 'spam', 'invalid', 'blocked', 'unsubscribed') then coalesce(bounced_at, p_occurred_at) else bounced_at end,
    failed_at = case when p_event_type = 'error' then coalesce(failed_at, p_occurred_at) else failed_at end,
    error_code = case when v_negative then upper(p_event_type) else error_code end
  where id = p_email_id;

  update public.leads
  set
    last_email_opened_at = case when p_event_type in ('opened', 'unique_opened', 'proxy_open', 'unique_proxy_open') then greatest(coalesce(last_email_opened_at, p_occurred_at), p_occurred_at) else last_email_opened_at end,
    last_email_clicked_at = case when p_event_type = 'click' then greatest(coalesce(last_email_clicked_at, p_occurred_at), p_occurred_at) else last_email_clicked_at end,
    email_suppressed_at = case when v_suppress then coalesce(email_suppressed_at, p_occurred_at) else email_suppressed_at end
  where id = v_lead_id;

  if v_negative then
    update public.email_messages
    set status = 'cancelled', cancelled_at = now(), error_code = 'SEQUENCE_STOPPED_' || upper(p_event_type)
    where thread_id = v_thread_id and status = 'queued';
  end if;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    v_lead_id,
    null,
    'email_' || p_event_type,
    jsonb_build_object('email_message_id', p_email_id, 'occurred_at', p_occurred_at)
  );

  return true;
end;
$$;

-- Extend the existing privacy operation so message content and provider events are removed.
create or replace function public.anonymize_lead(p_lead_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
begin
  if v_actor_id is null or not exists (
    select 1 from public.profiles where id = v_actor_id and role = 'admin'
  ) then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  perform 1 from public.leads where id = p_lead_id for update;
  if not found then raise exception 'Lead not found' using errcode = 'P0002'; end if;

  delete from public.lead_scores where lead_id = p_lead_id;
  delete from public.email_messages where lead_id = p_lead_id;
  delete from public.lead_events where lead_id = p_lead_id;

  update public.leads
  set business_name = 'Lead anonimizzato', city = null, region = null,
      google_place_id = null, phone = null, email = null, website_url = null,
      address = null, category = null, rating = null, review_count = null,
      has_website = false, has_booking = false, recommended_service_id = null,
      estimated_value = 0, assigned_to = null, notes = '', status = 'discarded',
      last_contacted_at = null, last_email_opened_at = null, last_email_clicked_at = null,
      email_replied_at = null, email_suppressed_at = null,
      booked_at = null, became_client_at = null
  where id = p_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (p_lead_id, v_actor_id, 'lead_anonymized', jsonb_build_object('redacted', true));
end;
$$;

revoke execute on function public.record_email_sent(uuid, text, text[]) from public, anon;
revoke execute on function public.record_email_reply(uuid) from public, anon;
revoke execute on function public.record_email_provider_event(uuid, text, text, text, timestamptz, jsonb)
  from public, anon, authenticated;

grant execute on function public.record_email_sent(uuid, text, text[]) to authenticated;
grant execute on function public.record_email_sent(uuid, text, text[]) to service_role;
grant execute on function public.record_email_reply(uuid) to authenticated;
grant execute on function public.record_email_provider_event(uuid, text, text, text, timestamptz, jsonb)
  to service_role;
