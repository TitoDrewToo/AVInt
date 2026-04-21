-- Idempotency ledger for provider webhook deliveries. Creem retries the same
-- event on any 5xx/timeout; without a dedup guard the handler would re-run
-- increment_user_counter, re-insert gift codes, and re-fire side effects.
--
-- The handler inserts (provider, event_id) before any side effects. A unique
-- violation (PG 23505) means the event was already processed → short-circuit
-- with 200. No FK, no RLS — service-role-only writes.

create table if not exists public.processed_webhook_events (
  provider     text        not null default 'creem',
  event_id     text        not null,
  event_type   text        not null,
  received_at  timestamptz not null default now(),
  primary key  (provider, event_id)
);

alter table public.processed_webhook_events enable row level security;
