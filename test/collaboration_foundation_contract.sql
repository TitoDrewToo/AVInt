-- Static contract checks for the additive collaboration migration.
-- Run with a SQL-aware test harness against a schema containing the migration.

do $$
declare
  expected text[] := array[
    'organizations', 'organization_members', 'collaboration_workflows',
    'collaboration_grants', 'collaboration_audit_events'
  ];
  table_name text;
begin
  foreach table_name in array expected loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing collaboration table: %', table_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'organizations' and c.relrowsecurity
  ) then raise exception 'Organizations must have RLS enabled'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collaboration_grants'
      and column_name = 'intake_folder_id'
  ) then raise exception 'Delegated grants must bind an intake folder'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'collaboration_audit_events'
      and column_name = 'actor_user_id'
  ) then raise exception 'Audit events must preserve actor attribution'; end if;
end;
$$;
