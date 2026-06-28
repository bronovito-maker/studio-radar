-- Editable lead details with audit trail.

create or replace function public.update_lead_details(
  p_lead_id uuid,
  p_business_name text,
  p_city text default null,
  p_region text default null,
  p_category text default null,
  p_address text default null,
  p_phone text default null,
  p_email text default null,
  p_website_url text default null,
  p_estimated_value numeric default 0
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_current public.leads%rowtype;
  v_business_name text := trim(p_business_name);
  v_city text := nullif(trim(coalesce(p_city, '')), '');
  v_region text := nullif(trim(coalesce(p_region, '')), '');
  v_category text := nullif(trim(coalesce(p_category, '')), '');
  v_address text := nullif(trim(coalesce(p_address, '')), '');
  v_phone text := nullif(trim(coalesce(p_phone, '')), '');
  v_email text := nullif(trim(coalesce(p_email, '')), '');
  v_website_url text := nullif(trim(coalesce(p_website_url, '')), '');
  v_changed_fields text[] := array[]::text[];
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_current
  from public.leads
  where id = p_lead_id
  for update;

  if not found then
    raise exception 'Lead not found' using errcode = 'P0002';
  end if;

  if v_current.business_name is not distinct from v_business_name
    and v_current.city is not distinct from v_city
    and v_current.region is not distinct from v_region
    and v_current.category is not distinct from v_category
    and v_current.address is not distinct from v_address
    and v_current.phone is not distinct from v_phone
    and v_current.email is not distinct from v_email
    and v_current.website_url is not distinct from v_website_url
    and v_current.estimated_value is not distinct from p_estimated_value
  then
    return;
  end if;

  update public.leads
  set
    business_name = v_business_name,
    city = v_city,
    region = v_region,
    category = v_category,
    address = v_address,
    phone = v_phone,
    email = v_email,
    website_url = v_website_url,
    has_website = v_website_url is not null,
    estimated_value = p_estimated_value
  where id = p_lead_id;

  if v_current.business_name is distinct from v_business_name then
    v_changed_fields := array_append(v_changed_fields, 'business_name');
  end if;
  if v_current.city is distinct from v_city then
    v_changed_fields := array_append(v_changed_fields, 'city');
  end if;
  if v_current.region is distinct from v_region then
    v_changed_fields := array_append(v_changed_fields, 'region');
  end if;
  if v_current.category is distinct from v_category then
    v_changed_fields := array_append(v_changed_fields, 'category');
  end if;
  if v_current.address is distinct from v_address then
    v_changed_fields := array_append(v_changed_fields, 'address');
  end if;
  if v_current.phone is distinct from v_phone then
    v_changed_fields := array_append(v_changed_fields, 'phone');
  end if;
  if v_current.email is distinct from v_email then
    v_changed_fields := array_append(v_changed_fields, 'email');
  end if;
  if v_current.website_url is distinct from v_website_url then
    v_changed_fields := array_append(v_changed_fields, 'website_url');
  end if;
  if v_current.estimated_value is distinct from p_estimated_value then
    v_changed_fields := array_append(v_changed_fields, 'estimated_value');
  end if;

  insert into public.lead_events (lead_id, actor_id, event_type, payload)
  values (
    p_lead_id,
    v_actor_id,
    'lead_details_updated',
    jsonb_build_object(
      'changed_fields', v_changed_fields,
      'from', jsonb_build_object(
        'business_name', v_current.business_name,
        'city', v_current.city,
        'region', v_current.region,
        'category', v_current.category,
        'address', v_current.address,
        'phone', v_current.phone,
        'email', v_current.email,
        'website_url', v_current.website_url,
        'estimated_value', v_current.estimated_value
      ),
      'to', jsonb_build_object(
        'business_name', v_business_name,
        'city', v_city,
        'region', v_region,
        'category', v_category,
        'address', v_address,
        'phone', v_phone,
        'email', v_email,
        'website_url', v_website_url,
        'estimated_value', p_estimated_value
      )
    )
  );
end;
$$;

revoke execute on function public.update_lead_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
)
from public, anon;

grant execute on function public.update_lead_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric
)
to authenticated;
