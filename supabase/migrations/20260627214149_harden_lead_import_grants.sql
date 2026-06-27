-- Remove privileges that bypass or modify RLS infrastructure.
revoke truncate, references, trigger on all tables in schema public
  from anon, authenticated;

revoke all on table public.lead_imports from anon, authenticated;
grant select, insert, update, delete on table public.lead_imports
  to authenticated;

-- New public tables must be exposed deliberately in their own migration.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;
