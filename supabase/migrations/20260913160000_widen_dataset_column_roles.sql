-- Layer 2 semantic roles are suggestions recorded by the dataset profiler.
-- Keep the legacy measure value for rows created before the role vocabulary
-- was expanded.
alter table public.dataset_columns
  drop constraint if exists dataset_columns_role_check;

alter table public.dataset_columns
  add constraint dataset_columns_role_check
  check (role is null or role = any (array[
    'measure', 'time', 'currency', 'identifier', 'dimension', 'descriptor',
    'ignored', 'measure_additive', 'measure_semi_additive',
    'measure_non_additive'
  ]::text[]));
