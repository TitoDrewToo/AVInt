-- Smart Security retention state and administrator accountability.
-- Quarantine bytes default to 30 days and ordinary rejection bytes to 24 hours.
-- Minimized prescan evidence becomes archive-eligible after 180 days, but this
-- migration deliberately creates no automatic evidence-deletion path.

create table public.prescan_file_retention (
  file_id uuid primary key references public.files(id) on delete cascade,
  account_id uuid not null references auth.users(id) on delete cascade,
  outcome text not null,
  reason_code text not null,
  status text not null default 'retained',
  quarantined_at timestamptz not null default now(),
  bytes_expires_at timestamptz not null default (now() + interval '30 days'),
  bytes_deleted_at timestamptz,
  evidence_hold_at timestamptz,
  evidence_hold_by uuid references auth.users(id) on delete set null,
  evidence_hold_reason text,
  last_rescan_requested_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint prescan_file_retention_outcome_check check (outcome in ('quarantined', 'rejected')),
  constraint prescan_file_retention_status_check check (
    status in ('retained', 'deleting', 'released_to_rescan', 'bytes_deleted')
  ),
  constraint prescan_file_retention_expiry_check check (bytes_expires_at >= quarantined_at),
  constraint prescan_file_retention_hold_check check (
    (evidence_hold_at is null and evidence_hold_by is null and evidence_hold_reason is null)
    or (evidence_hold_at is not null and evidence_hold_reason is not null and char_length(evidence_hold_reason) between 3 and 500)
  )
);

create index prescan_file_retention_expiry_idx
  on public.prescan_file_retention (bytes_expires_at, file_id)
  where status = 'retained' and evidence_hold_at is null;

create index prescan_file_retention_account_idx
  on public.prescan_file_retention (account_id, quarantined_at desc);

alter table public.prescan_file_retention enable row level security;
revoke all on table public.prescan_file_retention from public, anon, authenticated;
grant all on table public.prescan_file_retention to service_role;

comment on table public.prescan_file_retention is
  'Service-managed byte retention for rejected and quarantined uploads. Customers receive safe notices but cannot release blocked content.';

insert into public.prescan_file_retention (
  file_id, account_id, outcome, reason_code, quarantined_at, bytes_expires_at
)
select
  id,
  user_id,
  upload_status,
  coalesce(nullif(split_part(scan_reason, ':', 1), ''), 'historical_block'),
  coalesce(scanned_at, created_at, now()),
  coalesce(scanned_at, created_at, now())
    + case when upload_status = 'quarantined' then interval '30 days' else interval '1 day' end
from public.files
where upload_status in ('quarantined', 'rejected')
on conflict (file_id) do nothing;

alter table public.prescan_security_events
  add column if not exists previous_event_hash text,
  add column if not exists canonical_payload text,
  add column if not exists event_hash text,
  add column if not exists sealed_at timestamptz;

-- A deleted file must not rewrite an already-sealed historical event. Account
-- deletion still follows the previously approved cascade policy for this table.
alter table public.prescan_security_events
  drop constraint if exists prescan_security_events_file_id_fkey;

update public.prescan_security_events
set sealed_at = created_at
where sealed_at is null;

-- Existing evidence becomes a set of independently sealed baseline roots.
-- New events link to the latest hash in their correlation sequence.
update public.prescan_security_events event
set canonical_payload = (
  to_jsonb(event) - array['canonical_payload', 'event_hash']
)::text
where canonical_payload is null;

update public.prescan_security_events
set event_hash = encode(extensions.digest(convert_to(canonical_payload, 'UTF8'), 'sha256'), 'hex')
where event_hash is null;

alter table public.prescan_security_events
  alter column canonical_payload set not null,
  alter column event_hash set not null,
  alter column sealed_at set not null;

revoke update, delete, truncate on table public.prescan_security_events from service_role;
grant select, insert on table public.prescan_security_events to service_role;

create or replace function public.avint_seal_prescan_security_event()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.correlation_id::text, 0));

  select event_hash into new.previous_event_hash
  from public.prescan_security_events
  where correlation_id = new.correlation_id
  order by created_at desc, id desc
  limit 1;

  new.created_at := clock_timestamp();
  new.sealed_at := new.created_at;
  new.canonical_payload := (to_jsonb(new) - array['canonical_payload', 'event_hash'])::text;
  new.event_hash := encode(extensions.digest(convert_to(new.canonical_payload, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

revoke execute on function public.avint_seal_prescan_security_event()
  from public, anon, authenticated, service_role;

drop trigger if exists prescan_security_events_seal on public.prescan_security_events;
create trigger prescan_security_events_seal
before insert on public.prescan_security_events
for each row execute function public.avint_seal_prescan_security_event();

create table public.prescan_admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null,
  file_id uuid,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  previous_event_hash text,
  canonical_payload text not null default '',
  event_hash text not null default '',
  sealed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint prescan_admin_audit_action_length check (char_length(action) between 3 and 80),
  constraint prescan_admin_audit_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index prescan_admin_audit_actor_time_idx
  on public.prescan_admin_audit_events (actor_user_id, created_at desc);

create index prescan_admin_audit_file_time_idx
  on public.prescan_admin_audit_events (file_id, created_at desc)
  where file_id is not null;

alter table public.prescan_admin_audit_events enable row level security;
revoke all on table public.prescan_admin_audit_events from public, anon, authenticated;
grant select, insert on table public.prescan_admin_audit_events to service_role;

comment on table public.prescan_admin_audit_events is
  'Append-only audit of administrator evidence access, quarantine actions, and automated security retention.';

create or replace function public.avint_seal_prescan_admin_audit_event()
returns trigger
language plpgsql
security invoker
set search_path = public, extensions, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('prescan_admin_audit_events', 0));

  select event_hash into new.previous_event_hash
  from public.prescan_admin_audit_events
  order by created_at desc, id desc
  limit 1;

  new.created_at := clock_timestamp();
  new.sealed_at := new.created_at;
  new.canonical_payload := (to_jsonb(new) - array['canonical_payload', 'event_hash'])::text;
  new.event_hash := encode(extensions.digest(convert_to(new.canonical_payload, 'UTF8'), 'sha256'), 'hex');
  return new;
end;
$$;

revoke execute on function public.avint_seal_prescan_admin_audit_event()
  from public, anon, authenticated, service_role;

drop trigger if exists prescan_admin_audit_events_seal on public.prescan_admin_audit_events;
create trigger prescan_admin_audit_events_seal
before insert on public.prescan_admin_audit_events
for each row execute function public.avint_seal_prescan_admin_audit_event();
