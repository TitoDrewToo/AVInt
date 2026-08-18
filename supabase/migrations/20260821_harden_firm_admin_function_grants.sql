-- Policies need a user-scoped helper, but authenticated callers must not be
-- able to pass an arbitrary user_id to the SECURITY DEFINER two-argument form.
revoke execute on function public.is_firm_admin(uuid, uuid) from authenticated;

create or replace function public.is_firm_admin(p_firm_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_firm_admin(p_firm_id, auth.uid());
$$;

revoke all on function public.is_firm_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_firm_admin(uuid) to authenticated;
