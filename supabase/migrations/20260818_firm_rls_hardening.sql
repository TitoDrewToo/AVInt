-- Avoid recursive RLS evaluation when policies ask whether the current user
-- is a firm administrator. This helper is intentionally not user-callable.
create or replace function public.is_firm_admin(p_firm_id uuid, p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.firm_admins where firm_id = p_firm_id and user_id = p_user_id); $$;

revoke all on function public.is_firm_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.is_firm_admin(uuid, uuid) to service_role;

drop policy if exists firms_select_linked_admin on public.firms;
create policy firms_select_linked_admin on public.firms for select to authenticated using (public.is_firm_admin(id));
drop policy if exists firm_admins_select_linked_admin on public.firm_admins;
create policy firm_admins_select_linked_admin on public.firm_admins for select to authenticated using (public.is_firm_admin(firm_id));
drop policy if exists firm_clients_select_self_or_admin on public.firm_clients;
create policy firm_clients_select_self_or_admin on public.firm_clients for select to authenticated using (user_id = auth.uid() or public.is_firm_admin(firm_id));
