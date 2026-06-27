-- CSV import batches, normalized dedupe keys, and atomic confirmation.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'lead_import_status') then
    create type public.lead_import_status as enum (
      'uploaded',
      'previewed',
      'completed',
      'failed'
    );
  end if;
end $$;

alter table public.leads
  add column if not exists email_normalized text,
  add column if not exists phone_normalized text,
  add column if not exists website_normalized text,
  add column if not exists business_city_normalized text;

create or replace function public.set_lead_dedupe_keys()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_website text;
begin
  new.email_normalized := nullif(lower(trim(coalesce(new.email, ''))), '');
  new.phone_normalized := nullif(
    regexp_replace(coalesce(new.phone, ''), '[^0-9]+', '', 'g'),
    ''
  );

  if new.phone_normalized is not null and length(new.phone_normalized) < 7 then
    new.phone_normalized := null;
  end if;

  v_website := lower(trim(coalesce(new.website_url, '')));
  v_website := regexp_replace(v_website, '^https?://', '', 'i');
  v_website := regexp_replace(v_website, '^www\.', '', 'i');
  v_website := split_part(split_part(v_website, '/', 1), '?', 1);
  new.website_normalized := nullif(v_website, '');

  new.business_city_normalized :=
    lower(regexp_replace(trim(new.business_name), '\s+', ' ', 'g'))
    || '|'
    || lower(regexp_replace(trim(coalesce(new.city, '')), '\s+', ' ', 'g'));

  return new;
end;
$$;

revoke execute on function public.set_lead_dedupe_keys()
  from public, anon, authenticated;

drop trigger if exists set_leads_dedupe_keys on public.leads;
create trigger set_leads_dedupe_keys
before insert or update of business_name, city, email, phone, website_url
on public.leads
for each row execute function public.set_lead_dedupe_keys();

-- Backfill existing rows through the normalization trigger.
update public.leads set business_name = business_name;

create index if not exists leads_email_normalized_idx
  on public.leads (email_normalized)
  where email_normalized is not null;
create index if not exists leads_phone_normalized_idx
  on public.leads (phone_normalized)
  where phone_normalized is not null;
create index if not exists leads_website_normalized_idx
  on public.leads (website_normalized)
  where website_normalized is not null;
create index if not exists leads_business_city_normalized_idx
  on public.leads (business_city_normalized);

create table if not exists public.lead_imports (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  status public.lead_import_status not null default 'uploaded',
  headers text[] not null,
  raw_rows jsonb not null default '[]'::jsonb,
  mapping jsonb not null default '{}'::jsonb,
  preview_rows jsonb not null default '[]'::jsonb,
  total_count integer not null default 0,
  valid_count integer not null default 0,
  duplicate_count integer not null default 0,
  invalid_count integer not null default 0,
  imported_count integer not null default 0,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint lead_imports_filename_not_empty check (length(trim(filename)) > 0),
  constraint lead_imports_rows_are_arrays check (
    jsonb_typeof(raw_rows) = 'array' and jsonb_typeof(preview_rows) = 'array'
  ),
  constraint lead_imports_counts_valid check (
    total_count between 0 and 500
    and valid_count between 0 and total_count
    and duplicate_count between 0 and total_count
    and invalid_count between 0 and total_count
    and imported_count between 0 and total_count
  )
);

create index if not exists lead_imports_created_at_idx
  on public.lead_imports (created_at desc);
create index if not exists lead_imports_created_by_idx
  on public.lead_imports (created_by);

drop trigger if exists set_lead_imports_updated_at on public.lead_imports;
create trigger set_lead_imports_updated_at
before update on public.lead_imports
for each row execute function public.set_updated_at();

alter table public.lead_imports enable row level security;

grant select, insert, update, delete on public.lead_imports to authenticated;

create policy "lead_imports_select_authenticated"
on public.lead_imports for select
to authenticated
using ((select auth.uid()) is not null);

create policy "lead_imports_insert_own"
on public.lead_imports for insert
to authenticated
with check (created_by = (select auth.uid()));

create policy "lead_imports_update_creator_or_admin"
on public.lead_imports for update
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

create policy "lead_imports_delete_creator_or_admin"
on public.lead_imports for delete
to authenticated
using (
  created_by = (select auth.uid())
  or exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  )
);

create or replace function public.confirm_lead_import(p_import_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_import public.lead_imports%rowtype;
  v_row jsonb;
  v_actor_id uuid := (select auth.uid());
  v_duplicate_id uuid;
  v_imported integer := 0;
  v_skipped integer := 0;
  v_email_key text;
  v_phone_key text;
  v_website_key text;
  v_business_city_key text;
  v_lead_id uuid;
begin
  if v_actor_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select *
  into v_import
  from public.lead_imports
  where id = p_import_id
  for update;

  if not found then
    raise exception 'Import not found' using errcode = 'P0002';
  end if;

  if v_import.created_by <> v_actor_id and not exists (
    select 1 from public.profiles where id = v_actor_id and role = 'admin'
  ) then
    raise exception 'Import access denied' using errcode = '42501';
  end if;

  if v_import.status <> 'previewed' then
    raise exception 'Import is not ready for confirmation' using errcode = '22023';
  end if;

  for v_row in
    select value from jsonb_array_elements(v_import.preview_rows)
    where value->>'state' = 'valid'
    order by (value->>'rowNumber')::integer
  loop
    v_email_key := nullif(v_row->>'emailNormalized', '');
    v_phone_key := nullif(v_row->>'phoneNormalized', '');
    v_website_key := nullif(v_row->>'websiteNormalized', '');
    v_business_city_key := v_row->>'businessCityNormalized';

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
      (v_email_key is not null and email_normalized = v_email_key)
      or (v_phone_key is not null and phone_normalized = v_phone_key)
      or (v_website_key is not null and website_normalized = v_website_key)
      or business_city_normalized = v_business_city_key
    order by created_at
    limit 1;

    if v_duplicate_id is not null then
      v_skipped := v_skipped + 1;
      continue;
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
      v_row->>'businessName',
      nullif(v_row->>'city', ''),
      nullif(v_row->>'region', ''),
      nullif(v_row->>'category', ''),
      nullif(v_row->>'phone', ''),
      nullif(v_row->>'email', ''),
      nullif(v_row->>'websiteUrl', ''),
      nullif(v_row->>'websiteUrl', '') is not null,
      coalesce((v_row->>'estimatedValue')::numeric, 0),
      'csv'
    )
    returning id into v_lead_id;

    insert into public.lead_events (lead_id, actor_id, event_type, payload)
    values (
      v_lead_id,
      v_actor_id,
      'lead_imported',
      jsonb_build_object(
        'import_id', p_import_id,
        'row_number', (v_row->>'rowNumber')::integer,
        'filename', v_import.filename
      )
    );

    v_imported := v_imported + 1;
  end loop;

  update public.lead_imports
  set
    status = 'completed',
    imported_count = v_imported,
    duplicate_count = duplicate_count + v_skipped,
    valid_count = greatest(valid_count - v_skipped, 0),
    completed_at = now()
  where id = p_import_id;

  return jsonb_build_object('imported', v_imported, 'skipped', v_skipped);
end;
$$;

revoke execute on function public.confirm_lead_import(uuid) from public, anon;
grant execute on function public.confirm_lead_import(uuid) to authenticated;
