-- Applied to production 2026-09-06 via Supabase MCP by Claude.
--
-- records.document_type is declared in the report-definition contract
-- (RECORD_DEFINITION_FIELDS) but was NULL on all 442 rows, so any saved definition
-- filtering or grouping by it matched nothing while validating cleanly.
--
-- document_type is NOT redundant with record_type: for parent rows the two coincide,
-- but for the 200 line_item children the record is a 'line_item' whose SOURCE document
-- is a receipt / invoice / bank_statement. document_type is the only field carrying that.
--
-- Backfill only. The forward-fill lives in process-document, not in a per-row trigger
-- on a table that receives bulk inserts.

update public.records r
set document_type = f.document_type
from public.files f
where f.id = r.file_id
  and r.document_type is null
  and f.document_type is not null;
