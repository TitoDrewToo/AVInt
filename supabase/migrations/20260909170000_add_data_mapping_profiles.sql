-- Reusable, preview-gated field mappings for the report/dashboard data layer.
-- Profiles store declarative field names and allowlisted coercions only. They do
-- not rewrite canonical records or store preview sample values.

create table if not exists public.data_mapping_profiles (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  slug              text not null,
  title             text not null,
  description       text,
  source            jsonb not null,
  scope             jsonb,
  mappings          jsonb not null,
  status            text not null default 'draft',
  authored_by       text not null default 'user',
  version           integer not null default 1,
  previewed_version integer,
  preview_summary   jsonb,
  activated_by      uuid,
  activated_at      timestamptz,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint data_mapping_profiles_slug_format check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$'),
  constraint data_mapping_profiles_source_is_object check (jsonb_typeof(source) = 'object'),
  constraint data_mapping_profiles_mappings_is_array check (jsonb_typeof(mappings) = 'array' and jsonb_array_length(mappings) between 1 and 50),
  constraint data_mapping_profiles_status_check check (status in ('draft', 'active')),
  constraint data_mapping_profiles_authored_by_check check (authored_by in ('user', 'assistant')),
  constraint data_mapping_profiles_version_positive check (version > 0),
  constraint data_mapping_profiles_preview_version_valid check (previewed_version is null or previewed_version > 0),
  constraint data_mapping_profiles_activation_consistent check (
    (status = 'draft' and activated_at is null and activated_by is null)
    or (status = 'active' and activated_at is not null and activated_by is not null and previewed_version = version)
  )
);

create unique index if not exists data_mapping_profiles_user_slug_key
  on public.data_mapping_profiles (user_id, slug) where archived_at is null;
create index if not exists data_mapping_profiles_user_status_idx
  on public.data_mapping_profiles (user_id, status, updated_at desc);

alter table public.data_mapping_profiles enable row level security;

drop policy if exists data_mapping_profiles_select_own on public.data_mapping_profiles;
create policy data_mapping_profiles_select_own on public.data_mapping_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

-- Writes are intentionally service-route-only. Allowing owner INSERT/UPDATE over
-- PostgREST would bypass definition validation and the preview-before-activation gate.

drop trigger if exists data_mapping_profiles_set_updated_at on public.data_mapping_profiles;
create trigger data_mapping_profiles_set_updated_at before update on public.data_mapping_profiles
  for each row execute function public.set_updated_at();

-- Keep account deletion atomic now that mapping profiles are durable user data.
create or replace function public.delete_user_data(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_paths text[]; v_records_count int; v_extractions_count int; v_datasets_count int;
  v_pj_count int; v_po_count int; v_files_count int; v_folders_count int;
  v_aw_count int; v_dp_count int; v_dl_count int; v_cs_count int; v_ra_count int;
  v_rd_count int; v_vdd_count int; v_dmp_count int; v_uap_count int; v_subs_count int;
begin
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}') into v_paths
    from public.files where user_id = p_user_id;
  select count(*) into v_records_count from public.records where user_id = p_user_id;
  select count(*) into v_extractions_count from public.extractions where user_id = p_user_id;
  select count(*) into v_datasets_count from public.datasets where user_id = p_user_id;

  with d as (delete from public.processing_jobs where file_id in (select id from public.files where user_id = p_user_id) returning 1)
    select count(*) into v_pj_count from d;
  with d as (delete from public.payment_obligations where user_id = p_user_id returning 1)
    select count(*) into v_po_count from d;
  with d as (delete from public.report_definitions where user_id = p_user_id returning 1)
    select count(*) into v_rd_count from d;
  with d as (delete from public.virtual_dataset_definitions where user_id = p_user_id returning 1)
    select count(*) into v_vdd_count from d;
  with d as (delete from public.data_mapping_profiles where user_id = p_user_id returning 1)
    select count(*) into v_dmp_count from d;
  with d as (delete from public.files where user_id = p_user_id returning 1)
    select count(*) into v_files_count from d;
  with d as (delete from public.folders where user_id = p_user_id returning 1)
    select count(*) into v_folders_count from d;
  with d as (delete from public.advanced_widgets where user_id = p_user_id returning 1)
    select count(*) into v_aw_count from d;
  with d as (delete from public.dashboard_pages where user_id = p_user_id returning 1)
    select count(*) into v_dp_count from d;
  with d as (delete from public.dashboard_layouts where user_id = p_user_id returning 1)
    select count(*) into v_dl_count from d;
  with d as (delete from public.context_summaries where user_id = p_user_id returning 1)
    select count(*) into v_cs_count from d;
  with d as (delete from public.report_assumptions where user_id = p_user_id returning 1)
    select count(*) into v_ra_count from d;
  with d as (delete from public.user_analytics_profile where user_id = p_user_id returning 1)
    select count(*) into v_uap_count from d;

  update public.subscriptions set user_id = null, email = null where user_id = p_user_id;
  get diagnostics v_subs_count = row_count;
  return jsonb_build_object('storage_paths', v_paths, 'counts', jsonb_build_object(
    'document_fields', 0, 'records', v_records_count, 'extractions', v_extractions_count,
    'datasets', v_datasets_count, 'processing_jobs', v_pj_count, 'payment_obligations', v_po_count,
    'report_definitions', v_rd_count, 'virtual_dataset_definitions', v_vdd_count,
    'data_mapping_profiles', v_dmp_count, 'files', v_files_count, 'folders', v_folders_count,
    'advanced_widgets', v_aw_count, 'dashboard_pages', v_dp_count, 'dashboard_layouts', v_dl_count,
    'context_summaries', v_cs_count, 'report_assumptions', v_ra_count,
    'user_analytics_profile', v_uap_count, 'subscriptions_anonymized', v_subs_count));
end;
$$;
revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
