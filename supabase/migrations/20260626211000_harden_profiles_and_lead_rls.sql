-- Prevent self-service role escalation and make lead access explicitly
-- dependent on a valid authenticated user.

revoke insert, update on public.profiles from authenticated;
grant insert (id, full_name, email) on public.profiles to authenticated;
grant update (full_name, email) on public.profiles to authenticated;

drop policy if exists "leads_all_authenticated" on public.leads;

create policy "leads_select_authenticated"
on public.leads for select
to authenticated
using ((select auth.uid()) is not null);

create policy "leads_insert_authenticated"
on public.leads for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "leads_update_authenticated"
on public.leads for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "leads_delete_authenticated"
on public.leads for delete
to authenticated
using ((select auth.uid()) is not null);

