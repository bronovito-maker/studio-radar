-- Convert a shortlisted Place ID into a manually confirmed lead without persisting Places content.

create or replace function public.confirm_candidate_to_lead(
  p_candidate_id uuid,
  p_business_name text,
  p_city text default null,
  p_region text default null,
  p_category text default null,
  p_phone text default null,
  p_email text default null,
  p_website_url text default null,
  p_address text default null,
  p_has_booking boolean default false,
  p_estimated_value numeric default 0
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_candidate public.lead_candidates%rowtype;
  v_is_admin boolean := false;
  v_email_key text;
  v_phone_key text;
  v_website_key text;
  v_business_city_key text;
  v_duplicate_id uuid;
  v_lead_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if length(trim(coalesce(p_business_name, ''))) < 2
    or p_estimated_value < 0
    or p_estimated_value > 10000000 then
    raise exception 'Invalid lead payload' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.profiles where id = v_actor_id and role = 'admin'
  ) into v_is_admin;

  perform pg_advisory_xact_lock(hashtextextended('candidate:' || p_candidate_id::text, 0));

  select *
  into v_candidate
  from public.lead_candidates
  where id = p_candidate_id;

  if not found then
    raise exception 'Candidate not found' using errcode = 'P0002';
  end if;

  if v_candidate.created_by <> v_actor_id and not v_is_admin then
    raise exception 'Candidate access denied' using errcode = '42501';
  end if;

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

  perform pg_advisory_xact_lock(hashtextextended('place:' || v_candidate.google_place_id, 0));
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

  select id
  into v_duplicate_id
  from public.leads
  where
    google_place_id = v_candidate.google_place_id
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
    business_name,
    city,
    region,
    category,
    phone,
    email,
    website_url,
    address,
    has_website,
    has_booking,
    estimated_value,
    source,
    google_place_id
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
    p_estimated_value,
    'google_places',
    v_candidate.google_place_id
  )
  returning id into v_lead_id;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    v_lead_id,
    v_actor_id,
    'candidate_converted',
    jsonb_build_object(
      'candidate_id', p_candidate_id,
      'google_place_id', v_candidate.google_place_id,
      'data_origin', 'official_website_or_manual_confirmation'
    )
  );

  delete from public.lead_candidates where id = p_candidate_id;

  return jsonb_build_object('status', 'created', 'lead_id', v_lead_id);
end;
$$;

revoke execute on function public.confirm_candidate_to_lead(
  uuid, text, text, text, text, text, text, text, text, boolean, numeric
) from public, anon;

grant execute on function public.confirm_candidate_to_lead(
  uuid, text, text, text, text, text, text, text, text, boolean, numeric
) to authenticated;
