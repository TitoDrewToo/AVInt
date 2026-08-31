-- Per-user rate limiting via fixed-window counters.
--
-- Chat, reports, delete-account, and gift-redeem routes are rate-limited at
-- the API layer to cap AI credit burn, expensive SQL repetition, destructive
-- retries, and code brute-forcing. Design goals:
--   - no new vendor (stay in Supabase; no Upstash/Redis)
--   - atomic increment-or-insert (no races)
--   - fail-open on infra error (don't block legit users if this is down)
--   - self-pruning (pg_cron deletes rows older than 24h every 15 minutes)
--
-- Windows are fixed buckets aligned to epoch (floor(now()/window)*window)
-- rather than sliding — simpler, good enough for abuse control. Every hit
-- inside a window increments a single counter row.

create table if not exists public.rate_limits (
  bucket        text        not null,
  key           text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 1,
  primary key (bucket, key, window_start)
);

create index if not exists idx_rate_limits_window on rate_limits(window_start);

alter table public.rate_limits enable row level security;

create or replace function public.rate_limit_hit(
  p_bucket          text,
  p_key             text,
  p_window_seconds  integer,
  p_max_calls       integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window  timestamptz;
  v_count   integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits (bucket, key, window_start, count)
  values (p_bucket, p_key, v_window, 1)
  on conflict (bucket, key, window_start)
  do update set count = rate_limits.count + 1
  returning count into v_count;

  return v_count <= p_max_calls;
end
$$;

revoke all on function public.rate_limit_hit(text, text, integer, integer) from public;
grant execute on function public.rate_limit_hit(text, text, integer, integer) to service_role;

-- Reclaim space. 24h retention is enough for any reasonable window size
-- (longest configured is 1h) and makes the table small + the lookup cheap.
do $$
begin
  perform cron.unschedule('rate-limits-cleanup');
exception
  when others then null;
end $$;

select cron.schedule(
  'rate-limits-cleanup',
  '*/15 * * * *',
  $cron$ delete from rate_limits where window_start < now() - interval '24 hours'; $cron$
);
