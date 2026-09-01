-- document_fields.notes was created by migration 20260418
-- (document_fields_notes_and_select_policy), which is RECORDED in
-- schema_migrations with the ADD COLUMN statement intact — but the column did
-- not exist in production and nothing anywhere drops it. The migration was
-- recorded without ever executing.
--
-- Consequence: the manual entry form has written `notes` since commit 3eabfcf
-- and every save failed with "Could not find the 'notes' column of
-- 'document_fields' in the schema cache". Nobody hit it because nobody used
-- manual entry.
--
-- This is the exact failure mode the baseline squash exists to prevent, found
-- the day after it landed. Restoring the column rather than removing the field,
-- because the recorded history says it should be here and the UI depends on it.
--
-- Short-lived: document_fields is dropped at M4.

alter table public.document_fields
  add column if not exists notes text default null;

update public.document_fields
   set notes = raw_json->>'notes'
 where notes is null
   and raw_json ? 'notes';
