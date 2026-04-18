-- Harden document_fields browser access and move user-editable notes out of raw_json.

ALTER TABLE document_fields
  ADD COLUMN IF NOT EXISTS notes text DEFAULT NULL;

-- Preserve existing notes entered through the browser editor without requiring
-- raw_json access in the client.
UPDATE document_fields
SET notes = raw_json->>'notes'
WHERE notes IS NULL
  AND raw_json ? 'notes';

ALTER TABLE document_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own document fields" ON document_fields;
CREATE POLICY "Users can read own document fields"
  ON document_fields FOR SELECT
  USING (
    file_id IN (
      SELECT id FROM files WHERE user_id = auth.uid()
    )
  );
