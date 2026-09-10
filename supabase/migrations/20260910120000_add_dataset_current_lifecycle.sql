-- Preserve stable dataset identities without allowing a sheet that disappeared
-- during re-derivation to remain current evidence in folder-backed models.

alter table public.datasets
  add column if not exists archived_at timestamptz;

comment on column public.datasets.archived_at is
  'Set when a previously ingested sheet is absent from the current source file. Stable identity and history remain inspectable, but current loaders exclude it.';

create index if not exists datasets_user_current_idx
  on public.datasets (user_id, updated_at desc)
  where archived_at is null;

