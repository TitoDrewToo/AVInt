-- Fails when a SECURITY DEFINER function in public is executable by anon or
-- authenticated, except for the reviewed is_system_admin() RLS helper.
-- Run after a fresh `supabase db reset` and against staging before promotion.

do $$
declare
  violations text;
begin
  select string_agg(
    format(
      '%s (anon=%s, authenticated=%s)',
      p.oid::regprocedure,
      has_function_privilege('anon', p.oid, 'EXECUTE'),
      has_function_privilege('authenticated', p.oid, 'EXECUTE')
    ),
    E'\n'
    order by p.oid::regprocedure::text
  )
  into violations
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      or has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
    and p.oid <> 'public.is_system_admin()'::regprocedure;

  if violations is not null then
    raise exception 'Unexpected browser-executable SECURITY DEFINER functions:%', E'\n' || violations;
  end if;

  if not has_function_privilege('authenticated', 'public.is_system_admin()'::regprocedure, 'EXECUTE')
     or has_function_privilege('anon', 'public.is_system_admin()'::regprocedure, 'EXECUTE') then
    raise exception 'is_system_admin() grant contract changed; review its three dependent RLS policies before editing grants';
  end if;
end
$$;
