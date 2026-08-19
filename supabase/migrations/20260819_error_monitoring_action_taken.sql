-- Record the human-reviewed action taken after an AI diagnosis.
-- Execution remains observation-only; this is audit metadata for review.

alter table public.error_groups
  add column if not exists action_taken text,
  add column if not exists action_taken_at timestamptz,
  add column if not exists action_taken_by uuid references auth.users(id) on delete set null;
