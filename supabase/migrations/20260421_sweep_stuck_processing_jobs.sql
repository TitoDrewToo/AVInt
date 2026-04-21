-- Stuck-job sweeper.
--
-- processing_jobs rows can be left in 'uploaded' or 'processing' forever when
-- an edge function crashes or times out before writing its completion row.
-- The UI already hides its indicator after 30 minutes (cutoff in
-- app/tools/smart-storage/page.tsx), but the DB row stays — meaning any
-- dashboard aggregation or future retry path still treats it as live.
--
-- This migration installs a pg_cron job that runs every 5 minutes and flips
-- stuck rows to 'failed' with an explanatory error_message. No HTTP, no edge
-- function, no auth plumbing — the scheduler calls a SECURITY DEFINER SQL
-- function directly.

create extension if not exists pg_cron;

create or replace function public.sweep_stuck_processing_jobs()
returns integer
language sql
security definer
set search_path = public
as $$
  with swept as (
    update processing_jobs
       set status        = 'failed',
           error_message = coalesce(error_message, 'Stuck job — swept after 30 minutes'),
           completed_at  = coalesce(completed_at, now())
     where status in ('uploaded', 'processing')
       and created_at < now() - interval '30 minutes'
     returning id
  )
  select count(*)::int from swept;
$$;

revoke all on function public.sweep_stuck_processing_jobs() from public;
grant execute on function public.sweep_stuck_processing_jobs() to service_role;

-- Re-schedule idempotently. cron.unschedule raises if the job name isn't
-- registered yet, so swallow that case; any other error propagates.
do $$
begin
  perform cron.unschedule('sweep-stuck-jobs');
exception
  when others then null;
end $$;

select cron.schedule(
  'sweep-stuck-jobs',
  '*/5 * * * *',
  $cron$ select public.sweep_stuck_processing_jobs(); $cron$
);
