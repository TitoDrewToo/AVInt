-- Additive follow-up for the directly-applied AI usage ledger.
-- Apply this file directly; do not run supabase db push until migration
-- history reconciliation is complete.
alter table public.ai_usage_events
  add column if not exists pricing_version text not null default '2026-08-26-v1',
  add column if not exists duration_ms integer;

alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_duration_ms_check;

alter table public.ai_usage_events
  add constraint ai_usage_events_duration_ms_check
  check (duration_ms is null or duration_ms >= 0);
