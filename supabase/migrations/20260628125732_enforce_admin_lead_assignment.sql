-- Keep assignment admin-only even when a client attempts a direct table update.

alter function public.assign_lead(uuid, uuid) security invoker;

create or replace function private.enforce_admin_lead_assignment()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.assigned_to is distinct from old.assigned_to
    and current_user not in ('postgres', 'service_role')
    and not exists (
      select 1 from public.profiles
      where id = (select auth.uid()) and role = 'admin'
    )
  then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke execute on function private.enforce_admin_lead_assignment()
  from public, anon, authenticated, service_role;

drop trigger if exists enforce_admin_lead_assignment on public.leads;
create trigger enforce_admin_lead_assignment
before update of assigned_to on public.leads
for each row
execute function private.enforce_admin_lead_assignment();
