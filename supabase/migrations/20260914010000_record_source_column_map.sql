-- Preserve the derivation link between canonical record fields and the
-- physical spreadsheet columns that supplied them. This is metadata only;
-- dataset_rows remains immutable source evidence.
alter table public.records
  add column if not exists source_column_map jsonb not null default '{}'::jsonb;

comment on column public.records.source_column_map is
  'Canonical record field to physical source-column mapping captured at derivation time.';
