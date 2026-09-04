-- The definition engine's store. One object per saved report, written by two
-- editors — the in-app builder and Claude over MCP — and rendered by one
-- renderer. Blocks and theme tokens only; never free-form HTML.
--
-- slug is stable and human-readable so an agent can resolve a report from a
-- phrase ("my monthly ops report") while the structure stays in the database
-- where it can be computed and checked.

create table if not exists public.report_definitions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  slug         text not null,
  title        text not null,
  description  text,

  -- what it reads: {"kind":"records"|"dataset", ...filters}
  source       jsonb not null,
  -- folder scope and any additional narrowing; null means the whole account
  scope        jsonb,
  -- the window and how it rolls: {"kind":"rolling","unit":"month","count":1,"offset":-1}
  period       jsonb,
  filters      jsonb not null default '[]'::jsonb,
  -- ordered declarative ReportDefinitionBlock[]; resolved values are never persisted here
  blocks       jsonb not null default '[]'::jsonb,
  theme        jsonb,

  authored_by  text not null default 'user',
  version      integer not null default 1,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint report_definitions_slug_format
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint report_definitions_authored_by_check
    check (authored_by in ('user', 'assistant')),
  constraint report_definitions_blocks_is_array
    check (jsonb_typeof(blocks) = 'array'),
  constraint report_definitions_filters_is_array
    check (jsonb_typeof(filters) = 'array'),
  constraint report_definitions_source_is_object
    check (jsonb_typeof(source) = 'object'),
  constraint report_definitions_version_positive
    check (version > 0)
);

create unique index if not exists report_definitions_user_slug_key
  on public.report_definitions (user_id, slug) where archived_at is null;
create index if not exists report_definitions_user_idx
  on public.report_definitions (user_id, updated_at desc);

alter table public.report_definitions enable row level security;

drop policy if exists report_definitions_select_own on public.report_definitions;
create policy report_definitions_select_own on public.report_definitions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists report_definitions_insert_own on public.report_definitions;
create policy report_definitions_insert_own on public.report_definitions
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists report_definitions_update_own on public.report_definitions;
create policy report_definitions_update_own on public.report_definitions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists report_definitions_delete_own on public.report_definitions;
create policy report_definitions_delete_own on public.report_definitions
  for delete to authenticated using (auth.uid() = user_id);

drop trigger if exists report_definitions_set_updated_at on public.report_definitions;
create trigger report_definitions_set_updated_at
  before update on public.report_definitions
  for each row execute function public.set_updated_at();
