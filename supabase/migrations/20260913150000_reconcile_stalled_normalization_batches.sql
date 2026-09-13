-- Reconcile normalization obligations when an edge worker is interrupted.
-- A file with expected rows still unsettled must never remain an unexplained
-- processing job forever; preserve the counters and name the deficit.
create or replace function public.sweep_stuck_processing_jobs() returns integer
language sql security definer
set search_path to 'public'
as $$
  with swept as (
    update public.processing_jobs p
       set status = 'failed',
           error_message = case
             when f.normalization_expected is not null
              and coalesce(f.normalization_settled, 0) < f.normalization_expected
             then format('Normalization stalled: %s of %s rows settled',
                         coalesce(f.normalization_settled, 0), f.normalization_expected)
             else coalesce(p.error_message, 'Stuck job — swept after 30 minutes')
           end,
           completed_at = coalesce(p.completed_at, now())
      from public.files f
     where p.file_id = f.id
       and p.status in ('uploaded', 'processing')
       and p.created_at < now() - interval '30 minutes'
    returning p.id
  )
  select count(*)::int from swept;
$$;

revoke all on function public.sweep_stuck_processing_jobs() from public, anon, authenticated;
grant execute on function public.sweep_stuck_processing_jobs() to service_role;
