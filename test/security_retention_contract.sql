-- Run after a fresh `supabase db reset` and against staging before promotion.

do $$
begin
  if has_table_privilege('anon', 'public.prescan_file_retention', 'SELECT')
     or has_table_privilege('authenticated', 'public.prescan_file_retention', 'SELECT') then
    raise exception 'Browser roles can read internal blocked-file retention state';
  end if;

  if has_table_privilege('anon', 'public.prescan_admin_audit_events', 'SELECT')
     or has_table_privilege('authenticated', 'public.prescan_admin_audit_events', 'SELECT') then
    raise exception 'Browser roles can read security administrator audit events';
  end if;

  if has_table_privilege('service_role', 'public.prescan_admin_audit_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.prescan_admin_audit_events', 'DELETE')
     or has_table_privilege('service_role', 'public.prescan_admin_audit_events', 'TRUNCATE') then
    raise exception 'Administrator audit events are not append-only';
  end if;

  if not has_table_privilege('service_role', 'public.prescan_admin_audit_events', 'INSERT') then
    raise exception 'Service role cannot append administrator audit events';
  end if;

  if has_table_privilege('service_role', 'public.prescan_security_events', 'UPDATE')
     or has_table_privilege('service_role', 'public.prescan_security_events', 'DELETE')
     or has_table_privilege('service_role', 'public.prescan_security_events', 'TRUNCATE') then
    raise exception 'Prescan security evidence is not append-only';
  end if;

  if not has_table_privilege('service_role', 'public.prescan_security_events', 'SELECT')
     or not has_table_privilege('service_role', 'public.prescan_security_events', 'INSERT') then
    raise exception 'Service role cannot append and inspect prescan security evidence';
  end if;

  if has_function_privilege('anon', 'public.avint_seal_prescan_security_event()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.avint_seal_prescan_security_event()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.avint_seal_prescan_security_event()', 'EXECUTE') then
    raise exception 'Prescan event sealing trigger function is directly executable';
  end if;

  if has_function_privilege('anon', 'public.avint_seal_prescan_admin_audit_event()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.avint_seal_prescan_admin_audit_event()', 'EXECUTE')
     or has_function_privilege('service_role', 'public.avint_seal_prescan_admin_audit_event()', 'EXECUTE') then
    raise exception 'Administrator audit sealing trigger function is directly executable';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'prescan_security_events_seal' and not tgisinternal
  ) then
    raise exception 'Prescan evidence sealing trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'prescan_admin_audit_events_seal' and not tgisinternal
  ) then
    raise exception 'Administrator audit sealing trigger is missing';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prescan_security_events'
      and column_name in ('canonical_payload', 'event_hash', 'sealed_at')
      and is_nullable = 'YES'
  ) then
    raise exception 'Prescan evidence seal columns are nullable';
  end if;
end
$$;
