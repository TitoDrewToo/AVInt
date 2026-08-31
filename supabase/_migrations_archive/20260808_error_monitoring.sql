-- Phase 1 error monitoring capture.
-- Apply this migration to Supabase before deploying the capture helpers.

create table if not exists public.error_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  occurred_at_manila timestamp generated always as
    (occurred_at at time zone 'Asia/Manila') stored,
  user_id uuid references auth.users(id) on delete set null,
  tool text,
  fn text,
  action text,
  route text,
  level text not null check (level in ('error', 'warn', 'info')),
  message text not null,
  stack text,
  fingerprint text not null,
  context jsonb,
  release text,
  environment text
);

create table if not exists public.error_groups (
  fingerprint text primary key,
  title text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  count integer not null default 0,
  status text not null default 'new'
);

create table if not exists public.system_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

-- TODO Andrew: insert your user UUID here before enabling the Phase 2 monitoring page.
-- insert into public.system_admins (user_id) values ('ANDREW_USER_UUID');

create or replace function public.is_system_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.system_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_system_admin() from public, anon;
grant execute on function public.is_system_admin() to authenticated, service_role;

create index if not exists error_events_fingerprint_idx
  on public.error_events (fingerprint);
create index if not exists error_events_occurred_at_idx
  on public.error_events (occurred_at desc);
create index if not exists error_events_user_id_idx
  on public.error_events (user_id);

alter table public.error_events enable row level security;
alter table public.error_groups enable row level security;
alter table public.system_admins enable row level security;

drop policy if exists "System admins can read error events" on public.error_events;
create policy "System admins can read error events"
  on public.error_events for select
  using (public.is_system_admin());

drop policy if exists "System admins can read error groups" on public.error_groups;
create policy "System admins can read error groups"
  on public.error_groups for select
  using (public.is_system_admin());

drop policy if exists "Existing system admins can read allowlist" on public.system_admins;
create policy "Existing system admins can read allowlist"
  on public.system_admins for select
  using (public.is_system_admin());

-- All writes happen through the service-role-only function below. No client
-- insert/update/delete policies are intentionally defined on these tables.
create or replace function public.record_error_event(
  p_user_id uuid,
  p_tool text,
  p_fn text,
  p_action text,
  p_route text,
  p_level text,
  p_message text,
  p_stack text,
  p_fingerprint text,
  p_context jsonb,
  p_release text,
  p_environment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  event_id uuid;
  event_time timestamptz := now();
begin
  insert into public.error_events (
    occurred_at, user_id, tool, fn, action, route, level, message, stack,
    fingerprint, context, release, environment
  ) values (
    event_time, p_user_id, p_tool, p_fn, p_action, p_route, p_level,
    p_message, p_stack, p_fingerprint, p_context, p_release, p_environment
  ) returning id into event_id;

  insert into public.error_groups (fingerprint, title, first_seen, last_seen, count)
  values (p_fingerprint, p_message, event_time, event_time, 1)
  on conflict (fingerprint) do update set
    last_seen = excluded.last_seen,
    count = public.error_groups.count + 1;

  return event_id;
end;
$$;

revoke all on function public.record_error_event(
  uuid, text, text, text, text, text, text, text, text, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.record_error_event(
  uuid, text, text, text, text, text, text, text, text, jsonb, text, text
) to service_role;
