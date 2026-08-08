-- Phase 3 diagnosis cache and observation review metadata.
-- Apply this migration to Supabase before deploying diagnose-error.

alter table public.error_groups
  add column if not exists ai_analysis text,
  add column if not exists proposed_fix text,
  add column if not exists risk_level text check (risk_level in ('low', 'medium', 'high')),
  add column if not exists confidence numeric check (confidence >= 0 and confidence <= 1),
  add column if not exists severity text,
  add column if not exists diagnosed_at timestamptz,
  add column if not exists ai_model text,
  add column if not exists review_verdict text check (review_verdict in ('matched', 'partial', 'wrong')),
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

-- Existing error_groups RLS remains admin-read-only. There are still no client
-- write policies; diagnosis and review writes use service role after a server
-- side system-admin check.
