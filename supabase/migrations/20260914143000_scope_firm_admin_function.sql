-- Keep authenticated callers bound to their own identity. The two-argument
-- helper remains service-role-only for trusted server-side checks.
create or replace function public.is_firm_admin(p_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.firm_admins
    where firm_id = p_firm_id and user_id = auth.uid()
  );
$$;

revoke all on function public.is_firm_admin(uuid) from public;
grant execute on function public.is_firm_admin(uuid) to authenticated, service_role;

drop function if exists public.is_firm_admin(uuid, uuid) cascade;

create function public.is_firm_admin(p_firm_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.firm_admins
    where firm_id = p_firm_id and user_id = p_user_id
  );
$$;
revoke all on function public.is_firm_admin(uuid, uuid) from public, authenticated, anon;
grant execute on function public.is_firm_admin(uuid, uuid) to service_role;

create policy firms_select_linked_admin on public.firms
  for select to authenticated using (public.is_firm_admin(id));
create policy firm_admins_select_linked_admin on public.firm_admins
  for select to authenticated using (public.is_firm_admin(firm_id));
create policy firm_clients_select_self_or_admin on public.firm_clients
  for select to authenticated using (user_id = auth.uid() or public.is_firm_admin(firm_id));
