-- Collaboration foundation: private user workspaces remain the default.
-- Organizations, scoped workflow grants, and actor audit events are additive.
-- No existing user-owned object becomes shared by this migration.
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 180),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  seats_purchased integer not null default 0 check (seats_purchased >= 0),
  seats_used integer not null default 0 check (seats_used >= 0 and seats_used <= seats_purchased),
  partner_rate_cents integer check (partner_rate_cents is null or partner_rate_cents > 0),
  founding boolean not null default false,
  legacy_firm_id uuid unique references public.firms(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.organizations is
  'Future shared-workspace owner. Personal user-owned data remains separate.';
comment on column public.organizations.legacy_firm_id is
  'Optional bridge to the historical CPA firm account; existing firm rows are not auto-migrated.';

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'reviewer', 'viewer')),
  active boolean not null default true,
  evidence_allowed boolean not null default false,
  export_allowed boolean not null default false,
  invited_at timestamptz,
  accepted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  constraint organization_members_acceptance_consistent check (
    (active = true and removed_at is null)
    or (active = false and removed_at is not null)
  )
);

create index if not exists organization_members_user_idx
  on public.organization_members(user_id, active, created_at desc);

create table if not exists public.collaboration_workflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 180),
  target_kind text not null check (target_kind in ('workflow', 'report', 'dashboard')),
  target_id uuid not null,
  intake_folder_id uuid,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collaboration_workflows_one_owner check (
    (owner_user_id is not null and organization_id is null)
    or (owner_user_id is null and organization_id is not null)
  )
);

comment on table public.collaboration_workflows is
  'Explicit binding of an owned report/dashboard/workflow to an intake target. Target dependencies are authorized separately.';
comment on column public.collaboration_workflows.target_id is
  'Polymorphic UUID validated by the trusted server against target_kind; no public client write is allowed.';
create index if not exists collaboration_workflows_owner_idx
  on public.collaboration_workflows(owner_user_id, active, updated_at desc);
create index if not exists collaboration_workflows_org_idx
  on public.collaboration_workflows(organization_id, active, updated_at desc);

create table if not exists public.collaboration_grants (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  workflow_id uuid not null references public.collaboration_workflows(id) on delete cascade,
  role text not null check (role in ('viewer', 'submitter', 'operator', 'editor')),
  intake_folder_id uuid,
  evidence_allowed boolean not null default false,
  export_allowed boolean not null default false,
  accepted_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collaboration_grants_distinct_users check (owner_user_id <> recipient_user_id),
  constraint collaboration_grants_acceptance_order check (accepted_at is null or accepted_at >= created_at),
  constraint collaboration_grants_expiry_order check (expires_at is null or expires_at > created_at),
  constraint collaboration_grants_folder_required_for_submission check (
    role not in ('submitter', 'operator', 'editor') or intake_folder_id is not null
  )
);

create unique index if not exists collaboration_grants_active_key
  on public.collaboration_grants(workflow_id, recipient_user_id)
  where revoked_at is null;
create index if not exists collaboration_grants_recipient_idx
  on public.collaboration_grants(recipient_user_id, revoked_at, expires_at);
create index if not exists collaboration_grants_owner_idx
  on public.collaboration_grants(owner_user_id, revoked_at, created_at desc);

create table if not exists public.collaboration_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  workflow_id uuid references public.collaboration_workflows(id) on delete set null,
  action text not null check (action in ('invite', 'accept', 'revoke', 'view', 'submit', 'review', 'run', 'edit', 'evidence', 'export', 'manage', 'delete')),
  outcome text not null check (outcome in ('allowed', 'denied', 'completed', 'failed')),
  grant_id uuid references public.collaboration_grants(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

comment on table public.collaboration_audit_events is
  'Append-only collaboration activity. Do not store file contents, signed URLs, secrets, or raw provider payloads.';
create index if not exists collaboration_audit_workflow_idx
  on public.collaboration_audit_events(workflow_id, created_at desc);
create index if not exists collaboration_audit_actor_idx
  on public.collaboration_audit_events(actor_user_id, created_at desc);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.collaboration_workflows enable row level security;
alter table public.collaboration_grants enable row level security;
alter table public.collaboration_audit_events enable row level security;

-- All collaboration mutations and reads go through trusted server routes until
-- the shared-workspace UI is introduced. Empty policy sets are intentional:
-- authenticated PostgREST callers cannot discover organization membership or
-- grant rows by guessing identifiers.
revoke all on public.organizations, public.organization_members,
  public.collaboration_workflows, public.collaboration_grants,
  public.collaboration_audit_events from anon, authenticated;
grant all on public.organizations, public.organization_members,
  public.collaboration_workflows, public.collaboration_grants,
  public.collaboration_audit_events to service_role;

drop trigger if exists organizations_set_updated_at on public.organizations;
create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
drop trigger if exists organization_members_set_updated_at on public.organization_members;
create trigger organization_members_set_updated_at before update on public.organization_members
  for each row execute function public.set_updated_at();
drop trigger if exists collaboration_workflows_set_updated_at on public.collaboration_workflows;
create trigger collaboration_workflows_set_updated_at before update on public.collaboration_workflows
  for each row execute function public.set_updated_at();
drop trigger if exists collaboration_grants_set_updated_at on public.collaboration_grants;
create trigger collaboration_grants_set_updated_at before update on public.collaboration_grants
  for each row execute function public.set_updated_at();
