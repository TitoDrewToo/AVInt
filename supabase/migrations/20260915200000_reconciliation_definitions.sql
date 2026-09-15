-- Governed, refreshable two-source reconciliation definitions.
create table if not exists public.reconciliation_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  source_a_dataset_id uuid not null references public.datasets(id) on delete restrict,
  source_b_dataset_id uuid not null references public.datasets(id) on delete restrict,
  key_fields jsonb not null,
  comparisons jsonb not null,
  version integer not null default 1,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reconciliation_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint reconciliation_key_fields_array check (jsonb_typeof(key_fields) = 'array' and jsonb_array_length(key_fields) between 1 and 5),
  constraint reconciliation_comparisons_array check (jsonb_typeof(comparisons) = 'array' and jsonb_array_length(comparisons) between 1 and 30),
  constraint reconciliation_sources_distinct check (source_a_dataset_id <> source_b_dataset_id),
  constraint reconciliation_version_positive check (version > 0)
);

create unique index if not exists reconciliation_definitions_user_slug_key
  on public.reconciliation_definitions(user_id, slug) where archived_at is null;
create index if not exists reconciliation_definitions_user_updated_idx
  on public.reconciliation_definitions(user_id, updated_at desc);

alter table public.reconciliation_definitions enable row level security;
revoke all on public.reconciliation_definitions from public, anon, authenticated;
grant select on public.reconciliation_definitions to authenticated;
grant all on public.reconciliation_definitions to service_role;

drop policy if exists reconciliation_definitions_select_own on public.reconciliation_definitions;
create policy reconciliation_definitions_select_own on public.reconciliation_definitions
  for select to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists reconciliation_definitions_set_updated_at on public.reconciliation_definitions;
create trigger reconciliation_definitions_set_updated_at
  before update on public.reconciliation_definitions
  for each row execute function public.set_updated_at();
