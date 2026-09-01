-- User intent needs a home in the record layer.
--
-- The reclassify UI lets a user remove a row from their reports by setting
-- document_fields.normalization_status = 'excluded'. The record layer has no
-- equivalent: records.status only ever holds 'derived'. Zero rows are
-- excluded today, so a ported report would agree with the old one right up
-- until the first exclusion, and then silently disagree.
--
-- null = included. A timestamp rather than a boolean because we will want to
-- know when, and because it feeds record_revisions once that table has a
-- writer.

alter table public.records
  add column if not exists excluded_at timestamptz;

comment on column public.records.excluded_at is
  'Set when a user removes this record from their reports. null = included. Equivalent of the legacy document_fields.normalization_status = ''excluded''.';

-- Covering index for the shape every report query takes: one user, included
-- rows only, parents only (children carry duplicate amounts), by date.
create index if not exists records_included_parent_date_idx
  on public.records (user_id, occurred_on desc)
  where excluded_at is null and parent_record_id is null;
