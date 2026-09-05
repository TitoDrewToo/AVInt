-- Reduce idle database write amplification before production traffic.
--
-- The unconditional pg_net retry ran every ten minutes, including when no
-- extraction needed work. That created a permanent HTTP queue/response write
-- workload and repeatedly scanned extraction state. Recovery remains available
-- through the explicit reprocess function and user-triggered retry paths.

do $$
begin
  perform cron.unschedule('reprocess-stuck-normalizations');
exception
  when others then null;
end $$;

-- Keep the cheap stuck-state safety net, but hourly is sufficient for a row
-- that is already considered stuck only after thirty minutes.
do $$
begin
  perform cron.unschedule('sweep-stuck-jobs');
exception
  when others then null;
end $$;

select cron.schedule(
  'sweep-stuck-jobs',
  '17 * * * *',
  $cron$ select public.sweep_stuck_processing_jobs(); $cron$
);

-- Rate-limit windows are at most one hour. Daily retention cleanup still
-- preserves the full 24-hour debugging window without waking Postgres 96
-- times per day.
do $$
begin
  perform cron.unschedule('rate-limits-cleanup');
exception
  when others then null;
end $$;

select cron.schedule(
  'rate-limits-cleanup',
  '30 4 * * *',
  $cron$ delete from public.rate_limits where window_start < now() - interval '24 hours'; $cron$
);

-- Bound the remaining recovery queries when the corpus grows. Partial indexes
-- cover only actionable states, keeping index write and storage overhead low.
create index if not exists processing_jobs_stuck_idx
  on public.processing_jobs (created_at)
  where status in ('uploaded', 'processing');

create index if not exists extractions_reprocess_eligibility_idx
  on public.extractions (created_at, file_id)
  where attempt_number = 1 and status = 'succeeded';

create index if not exists extractions_successful_retry_idx
  on public.extractions (file_id, attempt_number)
  where attempt_number > 1 and status = 'succeeded';
