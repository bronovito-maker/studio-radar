-- Admin-only privacy operation that removes lead content while preserving a minimal audit marker.

grant delete on public.lead_scores, public.lead_events to authenticated;

create policy "lead_scores_delete_admin"
on public.lead_scores for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

create policy "lead_events_delete_admin"
on public.lead_events for delete
to authenticated
using (
  exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

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
  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  delete from public.lead_scores where lead_id = p_lead_id;
  delete from public.lead_events where lead_id = p_lead_id;

  update public.leads
  set
    business_name = 'Lead anonimizzato',
    city = null,
    region = null,
    google_place_id = null,
    phone = null,
    email = null,
    website_url = null,
    address = null,
    category = null,
    rating = null,
    review_count = null,
    has_website = false,
    has_booking = false,
    recommended_service_id = null,
    estimated_value = 0,
    assigned_to = null,
    notes = '',
    status = 'discarded',
    last_contacted_at = null,
    booked_at = null,
    became_client_at = null
  where id = p_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (p_lead_id, v_actor_id, 'lead_anonymized', jsonb_build_object('redacted', true));
end;
$$;

revoke execute on function public.anonymize_lead(uuid) from public, anon;
grant execute on function public.anonymize_lead(uuid) to authenticated;
