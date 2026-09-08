-- Smart Security prescan lifecycle and append-only investigative evidence.

alter table public.files
  drop constraint if exists files_upload_status_check;

alter table public.files
  add constraint files_upload_status_check
  check (upload_status in (
    'uploaded',
    'pending_scan',
    'scanning',
    'approved',
    'processing',
    'normalized',
    'done',
    'quarantined',
    'rejected',
    'scan_failed'
  ));

create table public.prescan_security_events (
  id uuid primary key default gen_random_uuid(),
  correlation_id uuid not null,
  account_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid references public.files(id) on delete set null,
  filename text not null,
  file_size bigint,
  sha256 text,
  declared_mime text,
  detected_mime text,
  stage text not null,
  event_type text not null,
  outcome text,
  reason_code text,
  safe_reason text,
  signals jsonb not null default '{}'::jsonb,
  prescan_version text not null,
  ai_provider text,
  ai_model text,
  duration_ms integer,
  storage_action_intended text,
  storage_action_completed text,
  created_at timestamptz not null default now(),
  constraint prescan_security_events_event_type_check check (event_type in (
    'prescan.requested',
    'prescan.claimed',
    'prescan.validation_completed',
    'prescan.suitability_completed',
    'prescan.action_intended',
    'prescan.approved',
    'prescan.quarantined',
    'prescan.rejected',
    'prescan.retry_required'
  )),
  constraint prescan_security_events_outcome_check check (
    outcome is null or outcome in ('approved', 'quarantined', 'rejected', 'scan_failed')
  ),
  constraint prescan_security_events_storage_action_check check (
    (storage_action_intended is null or storage_action_intended in ('approve', 'quarantine', 'hold'))
    and (storage_action_completed is null or storage_action_completed in ('approved', 'quarantined', 'held'))
  ),
  constraint prescan_security_events_duration_check check (duration_ms is null or duration_ms >= 0),
  constraint prescan_security_events_unique_step unique (correlation_id, event_type)
);

create index prescan_security_events_account_time_idx
  on public.prescan_security_events (account_id, created_at desc);

create index prescan_security_events_file_time_idx
  on public.prescan_security_events (file_id, created_at desc);

create index prescan_security_events_hash_time_idx
  on public.prescan_security_events (sha256, created_at desc)
  where sha256 is not null;

create index prescan_security_events_incomplete_action_idx
  on public.prescan_security_events (created_at)
  where event_type = 'prescan.action_intended';

alter table public.prescan_security_events enable row level security;

revoke all on table public.prescan_security_events from public, anon, authenticated;
grant select, insert on table public.prescan_security_events to service_role;

comment on table public.prescan_security_events is
  'Append-only, service-role Smart Security prescan evidence. Never stores file contents, signed URLs, or provider prompts.';

create table public.prescan_rejection_notices (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  outcome text not null check (outcome in ('quarantined', 'rejected', 'scan_failed')),
  reason_code text not null,
  safe_reason text not null,
  dismissed_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prescan_rejection_notices_file_unique unique (file_id)
);

create index prescan_rejection_notices_account_open_idx
  on public.prescan_rejection_notices (account_id, created_at desc)
  where dismissed_at is null and resolved_at is null;

alter table public.prescan_rejection_notices enable row level security;

create policy "Users can read own prescan notices"
  on public.prescan_rejection_notices
  for select to authenticated
  using ((select auth.uid()) = account_id);

create policy "Users can dismiss own prescan notices"
  on public.prescan_rejection_notices
  for update to authenticated
  using ((select auth.uid()) = account_id)
  with check ((select auth.uid()) = account_id);

revoke all on table public.prescan_rejection_notices from public, anon, authenticated;
grant select, update (dismissed_at) on table public.prescan_rejection_notices to authenticated;
grant all on table public.prescan_rejection_notices to service_role;

comment on table public.prescan_rejection_notices is
  'Owner-visible, dismissible prescan outcome notices. Dismissal never modifies security evidence or quarantined bytes.';
