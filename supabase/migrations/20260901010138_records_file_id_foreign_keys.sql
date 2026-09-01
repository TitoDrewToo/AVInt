-- records.file_id and extractions.file_id had no foreign key to files.
--
-- Two consequences, both live:
--   1. Deleting a file left its records and extractions behind. 25 orphaned
--      records and 26 orphaned extractions existed in production, all from a
--      test file deleted earlier today. They kept counting toward any total
--      that did not join through files.
--   2. PostgREST cannot embed files!inner(...) without a declared
--      relationship, which blocked the report parity harness — that error is
--      how this was found.
--
-- records already cascaded correctly from extractions and from its own
-- parent; the link to files was simply missed when the layer was designed.
-- datasets got this right when it was added.
--
-- The deletes are required: the constraints will not build while orphans
-- exist. Verified before running that all 25 belonged to a single file the
-- owner had already deleted, and that the parent-only money total was
-- unchanged afterwards (994,173.37) because those rows carried no amounts.

delete from public.records r
 where not exists (select 1 from public.files f where f.id = r.file_id);

delete from public.extractions e
 where not exists (select 1 from public.files f where f.id = e.file_id);

alter table public.records
  add constraint records_file_id_fkey
  foreign key (file_id) references public.files(id) on delete cascade;

alter table public.extractions
  add constraint extractions_file_id_fkey
  foreign key (file_id) references public.files(id) on delete cascade;
