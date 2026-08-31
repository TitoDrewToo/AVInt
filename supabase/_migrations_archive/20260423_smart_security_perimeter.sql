create table if not exists public.smart_security_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  app_id text not null,
  event_type text not null,
  source text not null,
  user_id uuid null,
  session_id text null,
  fingerprint text null,
  ip_prefix text null,
  method text null,
  path text null,
  severity text not null default 'low',
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_smart_security_events_created_at
  on public.smart_security_events (created_at desc);

create index if not exists idx_smart_security_events_type_time
  on public.smart_security_events (event_type, created_at desc);

create index if not exists idx_smart_security_events_fingerprint_time
  on public.smart_security_events (fingerprint, created_at desc);

create table if not exists public.smart_security_decisions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  app_id text not null,
  source text not null,
  decision text not null,
  reason text not null,
  risk_score numeric not null default 0,
  fingerprint text not null,
  user_id uuid null,
  session_id text null,
  ip_prefix text null,
  method text null,
  path text null,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_smart_security_decisions_fingerprint_time
  on public.smart_security_decisions (fingerprint, created_at desc);

create index if not exists idx_smart_security_decisions_path_time
  on public.smart_security_decisions (path, created_at desc);

create index if not exists idx_smart_security_decisions_user_time
  on public.smart_security_decisions (user_id, created_at desc);

create table if not exists public.smart_security_blocks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  subject_type text not null check (subject_type in ('fingerprint', 'user', 'ip_prefix')),
  subject_value text not null,
  reason text not null,
  created_by text not null default 'system',
  expires_at timestamptz null
);

create index if not exists idx_smart_security_blocks_subject
  on public.smart_security_blocks (subject_type, subject_value, expires_at);

alter table public.smart_security_events enable row level security;
alter table public.smart_security_decisions enable row level security;
alter table public.smart_security_blocks enable row level security;

drop policy if exists "Service role can manage smart_security_events" on public.smart_security_events;
create policy "Service role can manage smart_security_events"
  on public.smart_security_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage smart_security_decisions" on public.smart_security_decisions;
create policy "Service role can manage smart_security_decisions"
  on public.smart_security_decisions
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Service role can manage smart_security_blocks" on public.smart_security_blocks;
create policy "Service role can manage smart_security_blocks"
  on public.smart_security_blocks
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
