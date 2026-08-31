-- Diagnosis context observability: record which journal time-window + topic-scope
-- the AI triage used for each error group. Observation-only; no gating impact.
alter table public.error_groups
  add column if not exists context_scope text;

comment on column public.error_groups.context_scope is
  'Journal retrieval scope used by the last diagnosis, e.g. "week/narrow" (timeWindow/topicScope). Observation-only.';
