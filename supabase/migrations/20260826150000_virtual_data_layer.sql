-- Normalization-plus virtual data layer.
-- Additive by design: document_fields remains the compatibility projection used
-- by existing reports and dashboards while this layer provides a generalized,
-- discoverable record/field contract.

create table if not exists public.virtual_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  source_record_id uuid not null unique references public.document_fields(id) on delete cascade,
  document_type text,
  record_type text not null default 'document_record',
  status text not null default 'raw' check (status in ('raw', 'normalized', 'manual', 'failed')),
  normalization_version integer,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_virtual_records_user on public.virtual_records(user_id);
create index if not exists idx_virtual_records_file on public.virtual_records(file_id);
create index if not exists idx_virtual_records_type on public.virtual_records(user_id, document_type, record_type);

create table if not exists public.virtual_record_fields (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  virtual_record_id uuid not null references public.virtual_records(id) on delete cascade,
  field_key text not null,
  value jsonb,
  value_type text not null check (value_type in ('string', 'number', 'boolean', 'date', 'array', 'object', 'null')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_custom boolean not null default false,
  source_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (virtual_record_id, field_key)
);

create index if not exists idx_virtual_record_fields_user_key
  on public.virtual_record_fields(user_id, field_key);
create index if not exists idx_virtual_record_fields_record
  on public.virtual_record_fields(virtual_record_id);

create table if not exists public.virtual_field_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  field_key text not null,
  label text not null,
  value_types text[] not null default '{}',
  occurrence_count integer not null default 0,
  is_custom boolean not null default false,
  source_kinds text[] not null default '{}',
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  unique (user_id, field_key)
);

create index if not exists idx_virtual_field_catalog_user on public.virtual_field_catalog(user_id);

alter table public.virtual_records enable row level security;
alter table public.virtual_record_fields enable row level security;
alter table public.virtual_field_catalog enable row level security;

drop policy if exists "Users can read own virtual records" on public.virtual_records;
create policy "Users can read own virtual records"
  on public.virtual_records for select
  using (user_id = auth.uid());

drop policy if exists "Users can read own virtual record fields" on public.virtual_record_fields;
create policy "Users can read own virtual record fields"
  on public.virtual_record_fields for select
  using (user_id = auth.uid());

drop policy if exists "Users can read own virtual field catalog" on public.virtual_field_catalog;
create policy "Users can read own virtual field catalog"
  on public.virtual_field_catalog for select
  using (user_id = auth.uid());

-- Keep updated_at correct for direct writes as well as edge-function writes.
create or replace function public.set_virtual_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists virtual_records_updated_at on public.virtual_records;
create trigger virtual_records_updated_at
  before update on public.virtual_records
  for each row execute function public.set_virtual_updated_at();

drop trigger if exists virtual_record_fields_updated_at on public.virtual_record_fields;
create trigger virtual_record_fields_updated_at
  before update on public.virtual_record_fields
  for each row execute function public.set_virtual_updated_at();
