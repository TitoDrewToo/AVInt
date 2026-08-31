-- Additive history for the virtual data layer.
-- virtual_records remains the current projection used by the workspace;
-- these tables preserve each observed projection for comparison and rollback.

create table if not exists public.virtual_record_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  virtual_record_id uuid not null references public.virtual_records(id) on delete cascade,
  source_record_id uuid not null references public.document_fields(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  document_type text,
  record_type text not null,
  status text not null check (status in ('raw', 'normalized', 'manual', 'failed')),
  normalization_version integer,
  change_reason text not null default 'projection_sync',
  captured_at timestamptz not null default now(),
  unique (virtual_record_id, version_number)
);

create index if not exists idx_virtual_record_versions_user
  on public.virtual_record_versions(user_id, captured_at desc);
create index if not exists idx_virtual_record_versions_record
  on public.virtual_record_versions(virtual_record_id, version_number desc);

create table if not exists public.virtual_record_version_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  version_id uuid not null references public.virtual_record_versions(id) on delete cascade,
  field_key text not null,
  value jsonb,
  value_type text not null check (value_type in ('string', 'number', 'boolean', 'date', 'array', 'object', 'null')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_custom boolean not null default false,
  source_evidence jsonb not null default '{}'::jsonb,
  unique (version_id, field_key)
);

create index if not exists idx_virtual_record_version_fields_user_key
  on public.virtual_record_version_fields(user_id, field_key);
create index if not exists idx_virtual_record_version_fields_version
  on public.virtual_record_version_fields(version_id);

alter table public.virtual_record_versions enable row level security;
alter table public.virtual_record_version_fields enable row level security;

drop policy if exists "Users can read own virtual record versions" on public.virtual_record_versions;
create policy "Users can read own virtual record versions"
  on public.virtual_record_versions for select
  using (user_id = auth.uid());

drop policy if exists "Users can read own virtual record version fields" on public.virtual_record_version_fields;
create policy "Users can read own virtual record version fields"
  on public.virtual_record_version_fields for select
  using (user_id = auth.uid());

-- Seed history for projections already materialized before this migration.
insert into public.virtual_record_versions (
  user_id, virtual_record_id, source_record_id, version_number,
  document_type, record_type, status, normalization_version, change_reason
)
select user_id, id, source_record_id, 1,
       document_type, record_type, status, normalization_version, 'initial_backfill'
from public.virtual_records
on conflict (virtual_record_id, version_number) do nothing;

insert into public.virtual_record_version_fields (
  user_id, version_id, field_key, value, value_type, confidence, is_custom, source_evidence
)
select fields.user_id, versions.id, fields.field_key, fields.value, fields.value_type,
       fields.confidence, fields.is_custom, fields.source_evidence
from public.virtual_record_fields fields
join public.virtual_record_versions versions on versions.virtual_record_id = fields.virtual_record_id
where versions.version_number = 1
on conflict (version_id, field_key) do nothing;
