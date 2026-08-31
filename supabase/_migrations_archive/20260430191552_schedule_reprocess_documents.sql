-- Schedules automatic retry of stuck normalizations every 10 minutes.
-- Prerequisite (one-time, run manually in Supabase SQL Editor):
--   insert into vault.secrets (name, secret) values
--     ('service_role_key', '<sb_secret_... key>'),
--     ('supabase_url', 'https://<project>.supabase.co');
--
-- Mirrors the pattern of supabase/migrations/20260421_sweep_stuck_processing_jobs.sql
-- but uses pg_net to call the reprocess-documents edge function.

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Re-schedule idempotently
do $$
begin
  perform cron.unschedule('reprocess-stuck-normalizations');
exception
  when others then null;
end $$;

select cron.schedule(
  'reprocess-stuck-normalizations',
  '*/10 * * * *',
  $cron$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'supabase_url') || '/functions/v1/reprocess-documents',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cron$
);
