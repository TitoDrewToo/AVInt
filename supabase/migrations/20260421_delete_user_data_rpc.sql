-- Atomic account deletion.
--
-- The delete-account API route previously fired 8+ sequential .delete() calls
-- with no error checking; any failure mid-sequence left partial-state DB rows
-- (e.g. files gone, dashboards still present). This RPC wraps the full DB
-- deletion in a single SECURITY DEFINER function so all table operations happen
-- in one implicit transaction — any failure rolls back everything.
--
-- Shape: returns jsonb { storage_paths: text[], counts: {...} }
--   storage_paths: captured BEFORE deleting files rows so the API can remove
--                  the corresponding storage objects after the txn commits.
--   counts:        per-table row counts for structured logging.
--
-- Deletion order (children → parents):
--   1. document_fields            (by file_id)
--   2. processing_jobs            (by file_id)
--   3. payment_obligations        (by user_id — covers file-derived + orphans)
--   4. files                      (by user_id)
--   5. advanced_widgets, dashboard_layouts, context_summaries,
--      report_assumptions, user_analytics_profile  (by user_id)
--   6. subscriptions              — ANONYMIZED, not deleted. Row retained for
--                                   chargeback / refund / tax audit with only
--                                   non-identifying fields (plan, tier, dates,
--                                   provider IDs). user_id + email are nulled.
--
-- gift_codes.redeemed_by_user_id is handled by its own FK ON DELETE SET NULL
-- when the auth.users row is removed by the API route after this RPC returns.

create or replace function public.delete_user_data(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths        text[];
  v_df_count     int;
  v_pj_count     int;
  v_po_count     int;
  v_files_count  int;
  v_aw_count     int;
  v_dl_count     int;
  v_cs_count     int;
  v_ra_count     int;
  v_uap_count    int;
  v_subs_count   int;
begin
  select coalesce(array_agg(storage_path) filter (where storage_path is not null), '{}')
    into v_paths
    from files
   where user_id = p_user_id;

  with d as (
    delete from document_fields
     where file_id in (select id from files where user_id = p_user_id)
     returning 1
  )
  select count(*) into v_df_count from d;

  with d as (
    delete from processing_jobs
     where file_id in (select id from files where user_id = p_user_id)
     returning 1
  )
  select count(*) into v_pj_count from d;

  with d as (
    delete from payment_obligations where user_id = p_user_id returning 1
  )
  select count(*) into v_po_count from d;

  with d as (
    delete from files where user_id = p_user_id returning 1
  )
  select count(*) into v_files_count from d;

  with d as (
    delete from advanced_widgets where user_id = p_user_id returning 1
  )
  select count(*) into v_aw_count from d;

  with d as (
    delete from dashboard_layouts where user_id = p_user_id returning 1
  )
  select count(*) into v_dl_count from d;

  with d as (
    delete from context_summaries where user_id = p_user_id returning 1
  )
  select count(*) into v_cs_count from d;

  with d as (
    delete from report_assumptions where user_id = p_user_id returning 1
  )
  select count(*) into v_ra_count from d;

  with d as (
    delete from user_analytics_profile where user_id = p_user_id returning 1
  )
  select count(*) into v_uap_count from d;

  update subscriptions
     set user_id = null, email = null
   where user_id = p_user_id;
  get diagnostics v_subs_count = ROW_COUNT;

  return jsonb_build_object(
    'storage_paths', v_paths,
    'counts', jsonb_build_object(
      'document_fields',          v_df_count,
      'processing_jobs',          v_pj_count,
      'payment_obligations',      v_po_count,
      'files',                    v_files_count,
      'advanced_widgets',         v_aw_count,
      'dashboard_layouts',        v_dl_count,
      'context_summaries',        v_cs_count,
      'report_assumptions',       v_ra_count,
      'user_analytics_profile',   v_uap_count,
      'subscriptions_anonymized', v_subs_count
    )
  );
end
$$;

revoke all on function public.delete_user_data(uuid) from public;
grant execute on function public.delete_user_data(uuid) to service_role;
