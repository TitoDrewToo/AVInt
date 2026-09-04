-- M4 phase E. Retire the legacy extraction and virtual-record layers.
-- No code reads any of these; the readers moved in phases 3a-3b and C.

-- 1. Move the ai_usage_events row-level link onto the surviving layer.
--    document_field_id pointed at the extracted row that caused a provider
--    call; extractions is that layer now. 66 of 259 events carry the old
--    link and all 66 resolve through (file_id, source_key) -> records.
--    The match yields the record's current extraction, which for a
--    re-processed file may not be the exact historical one — an accepted
--    approximation across 3 test files.
alter table public.ai_usage_events
  add column if not exists extraction_id uuid references public.extractions(id) on delete set null;

update public.ai_usage_events a
   set extraction_id = r.extraction_id
  from public.document_fields d
  join public.records r
    on r.file_id = d.file_id
   and r.source_key is not distinct from d.source_key
 where a.document_field_id = d.id
   and a.extraction_id is null
   and r.extraction_id is not null;

create index if not exists ai_usage_events_extraction_id_idx
  on public.ai_usage_events (extraction_id);

alter table public.ai_usage_events
  drop column if exists document_field_id;

-- 2. Drop the virtual-record layer. Superseded by records / record_attributes
--    / record_revisions. syncVirtualRecord and every reader were removed in
--    phase B; no runtime code references these tables.
drop function if exists public.rollback_virtual_record(uuid, uuid, uuid);

drop table if exists public.virtual_record_version_fields;
drop table if exists public.virtual_record_versions;
drop table if exists public.virtual_record_fields;
drop table if exists public.virtual_records;

-- 3. Drop the legacy extraction store. Replaced by extractions + records.
--    The single non-null notes value was the literal string 'test'.
drop table if exists public.document_fields;
