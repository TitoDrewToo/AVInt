-- Lookup auth.users.id by email without pulling the full user list.
--
-- Replaces supabaseAdmin.auth.admin.listUsers() in the Creem webhook handler,
-- which defaulted to a single unpaginated page (~50 users) and silently
-- failed to resolve any user past that cap — meaning their subscription row
-- was never linked back to a user_id. This RPC is O(1) on the unique email
-- index instead of O(total_users).
--
-- security definer is required to read auth.users from service-role contexts.
-- Exact-match semantics match the prior `u.email === email` comparison.

create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
stable
set search_path = public, auth
as $$
  select id from auth.users where email = p_email limit 1;
$$;

revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;
