-- The legacy-layer retirement removed document_fields, but delete_user_data
-- still compiled with a DELETE against that table. PostgreSQL allows the
-- dependent PL/pgSQL function to survive the DROP, so the break only appears
-- when account deletion runs (or under plpgsql_check).
--
-- Repair the function forward: the retirement migration is already recorded
-- remotely and must not be rewritten. This also removes the unused legacy
-- field catalog and closes two account-deletion gaps exposed by the audit.

-- No runtime reader remains. The Data Model viewer derives its catalog from
-- record_attributes so this cache would otherwise become stale stored data.
drop table if exists public.virtual_field_catalog;

-- The report-definitions migration was recorded remotely before its local
-- draft gained the filters column. Reassert the complete final contract in a
-- new version so migration history and the live table converge.
alter table public.report_definitions
  add column if not exists filters jsonb not null default '[]'::jsonb;

alter table public.report_definitions
  drop constraint if exists report_definitions_slug_format,
  drop constraint if exists report_definitions_authored_by_check,
  drop constraint if exists report_definitions_blocks_is_array,
  drop constraint if exists report_definitions_filters_is_array,
  drop constraint if exists report_definitions_source_is_object,
  drop constraint if exists report_definitions_version_positive;

alter table public.report_definitions
  add constraint report_definitions_slug_format
    check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  add constraint report_definitions_authored_by_check
    check (authored_by in ('user', 'assistant')),
  add constraint report_definitions_blocks_is_array
    check (jsonb_typeof(blocks) = 'array'),
  add constraint report_definitions_filters_is_array
    check (jsonb_typeof(filters) = 'array'),
  add constraint report_definitions_source_is_object
    check (jsonb_typeof(source) = 'object'),
  add constraint report_definitions_version_positive
    check (version > 0);

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

-- Preserve issued gift codes as business records without letting the issuer
-- foreign key block deletion of that issuer's auth account.
alter table public.gift_codes
  drop constraint if exists gift_codes_issued_by_user_id_fkey;
alter table public.gift_codes
  add constraint gift_codes_issued_by_user_id_fkey
  foreign key (issued_by_user_id) references auth.users(id) on delete set null;

create or replace function public.delete_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_paths              text[];
  v_records_count      int;
  v_extractions_count  int;
  v_datasets_count     int;
  v_pj_count           int;
  v_po_count           int;
  v_files_count        int;
  v_folders_count      int;
  v_aw_count           int;
  v_dl_count           int;
  v_cs_count           int;
  v_ra_count           int;
  v_rd_count           int;
  v_uap_count          int;
  v_subs_count         int;
begin
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}')
    into v_paths
    from public.files
   where user_id = p_user_id;

  -- These rows cascade when files are deleted. Count first so the response
  -- still describes the canonical data that was removed.
  select count(*) into v_records_count
    from public.records where user_id = p_user_id;
  select count(*) into v_extractions_count
    from public.extractions where user_id = p_user_id;
  select count(*) into v_datasets_count
    from public.datasets where user_id = p_user_id;

  with d as (
    delete from public.processing_jobs
     where file_id in (select id from public.files where user_id = p_user_id)
     returning 1
  )
  select count(*) into v_pj_count from d;

  with d as (
    delete from public.payment_obligations where user_id = p_user_id returning 1
  )
  select count(*) into v_po_count from d;

  with d as (
    delete from public.report_definitions where user_id = p_user_id returning 1
  )
  select count(*) into v_rd_count from d;

  with d as (
    delete from public.files where user_id = p_user_id returning 1
  )
  select count(*) into v_files_count from d;

  -- folders.user_id intentionally has no ON DELETE CASCADE, and the original
  -- function omitted it. Files are gone first, then the self-referencing
  -- folder tree can cascade safely from its roots.
  with d as (
    delete from public.folders where user_id = p_user_id returning 1
  )
  select count(*) into v_folders_count from d;

  with d as (
    delete from public.advanced_widgets where user_id = p_user_id returning 1
  )
  select count(*) into v_aw_count from d;

  with d as (
    delete from public.dashboard_layouts where user_id = p_user_id returning 1
  )
  select count(*) into v_dl_count from d;

  with d as (
    delete from public.context_summaries where user_id = p_user_id returning 1
  )
  select count(*) into v_cs_count from d;

  with d as (
    delete from public.report_assumptions where user_id = p_user_id returning 1
  )
  select count(*) into v_ra_count from d;

  with d as (
    delete from public.user_analytics_profile where user_id = p_user_id returning 1
  )
  select count(*) into v_uap_count from d;

  update public.subscriptions
     set user_id = null, email = null
   where user_id = p_user_id;
  get diagnostics v_subs_count = row_count;

  return jsonb_build_object(
    'storage_paths', v_paths,
    'counts', jsonb_build_object(
      -- Retained as zero for older clients that still read this response key.
      'document_fields',          0,
      'records',                  v_records_count,
      'extractions',              v_extractions_count,
      'datasets',                 v_datasets_count,
      'processing_jobs',          v_pj_count,
      'payment_obligations',      v_po_count,
      'report_definitions',       v_rd_count,
      'files',                    v_files_count,
      'folders',                  v_folders_count,
      'advanced_widgets',         v_aw_count,
      'dashboard_layouts',        v_dl_count,
      'context_summaries',        v_cs_count,
      'report_assumptions',       v_ra_count,
      'user_analytics_profile',   v_uap_count,
      'subscriptions_anonymized', v_subs_count
    )
  );
end;
$$;
