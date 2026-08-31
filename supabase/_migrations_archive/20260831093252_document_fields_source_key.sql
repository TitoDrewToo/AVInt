-- Give document_fields the same row identity the record layer already uses.
--
-- Today this table has no row key at all: that is why re-processing duplicates
-- rows, and why the per-row normalize fan-out loses track of which row it is
-- enriching (every invocation re-derives source_key = 'root' and races onto
-- one record).
--
-- Aligning both layers on (file_id, source_key) fixes the duplication now and
-- makes the eventual port of the reports a join on a key that means the same
-- thing on both sides, rather than a re-derivation.
--
-- Backfilling 'root' is correct rather than a guess: all 44 existing rows are
-- single-row documents, which is exactly what 'root' denotes in
-- derive-records.ts.

alter table public.document_fields
  add column if not exists source_key text;

update public.document_fields
   set source_key = 'root'
 where source_key is null;

alter table public.document_fields
  alter column source_key set not null;

create unique index if not exists document_fields_file_source_key_idx
  on public.document_fields (file_id, source_key);
