-- Record layer M1 parity migration.
-- Already applied to the live database; kept guarded for fresh environments.

create table if not exists public.extractions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  attempt_number integer not null default 1,
  provider text,
  model text,
  status text not null default 'succeeded',
  payload jsonb not null default '{}'::jsonb,
  source_row_count integer,
  document_type text,
  error_category text,
  created_at timestamptz not null default now(),
  unique (file_id, attempt_number)
);

create index if not exists extractions_user_id_idx on public.extractions(user_id);
create index if not exists extractions_file_id_idx on public.extractions(file_id);

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  extraction_id uuid not null references public.extractions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.files(id) on delete cascade,
  parent_record_id uuid references public.records(id) on delete cascade,
  source_key text not null,
  record_type text not null default 'general_document',
  document_type text,
  status text not null default 'active',
  occurred_on date,
  amount numeric,
  currency text,
  direction text not null default 'neutral' check (direction in ('inflow', 'outflow', 'neutral')),
  counterparty text,
  counterparty_normalized text,
  category text,
  description text,
  period_start date,
  period_end date,
  is_recurring boolean,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  field_confidence jsonb not null default '{}'::jsonb,
  needs_review boolean not null default false,
  has_user_edits boolean not null default false,
  amount_base numeric,
  fx_rate numeric,
  fx_rate_date date,
  line_index integer,
  source_row_ref jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (file_id, source_key)
);

create index if not exists records_user_parent_idx on public.records(user_id, parent_record_id) where parent_record_id is null;
create index if not exists records_file_source_key_idx on public.records(file_id, source_key);
create index if not exists records_occurred_on_idx on public.records(user_id, occurred_on) where parent_record_id is null;

create table if not exists public.record_attributes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  field_key text not null,
  value jsonb,
  value_type text not null check (value_type in ('string', 'number', 'boolean', 'date', 'array', 'object', 'null')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  is_custom boolean not null default false,
  source_evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (record_id, field_key)
);

create index if not exists record_attributes_user_field_idx on public.record_attributes(user_id, field_key);
create index if not exists record_attributes_record_idx on public.record_attributes(record_id);

create table if not exists public.record_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id uuid not null references public.records(id) on delete cascade,
  field_key text not null,
  previous_value jsonb,
  new_value jsonb,
  change_kind text not null,
  created_at timestamptz not null default now()
);

create index if not exists record_revisions_record_created_idx on public.record_revisions(record_id, created_at desc);
create index if not exists record_revisions_user_idx on public.record_revisions(user_id);

alter table public.extractions enable row level security;
alter table public.records enable row level security;
alter table public.record_attributes enable row level security;
alter table public.record_revisions enable row level security;

revoke all on public.extractions, public.records, public.record_attributes, public.record_revisions from anon;
revoke all on public.extractions, public.records, public.record_attributes, public.record_revisions from authenticated;
grant select on public.extractions, public.records, public.record_attributes, public.record_revisions to authenticated;

drop policy if exists "Owners can read own extractions" on public.extractions;
create policy "Owners can read own extractions" on public.extractions for select using (user_id = auth.uid());
drop policy if exists "Owners can read own records" on public.records;
create policy "Owners can read own records" on public.records for select using (user_id = auth.uid());
drop policy if exists "Owners can read own record attributes" on public.record_attributes;
create policy "Owners can read own record attributes" on public.record_attributes for select using (user_id = auth.uid());
drop policy if exists "Owners can read own record revisions" on public.record_revisions;
create policy "Owners can read own record revisions" on public.record_revisions for select using (user_id = auth.uid());
