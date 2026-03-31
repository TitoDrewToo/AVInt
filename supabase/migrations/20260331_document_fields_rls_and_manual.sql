-- RLS policies for document_fields (browser client / manual entry support)
-- Previously only service role (webhook/edge functions) could write to this table

CREATE POLICY "Users can insert own document fields"
  ON document_fields FOR INSERT
  WITH CHECK (
    file_id IN (
      SELECT id FROM files WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own document fields"
  ON document_fields FOR UPDATE
  USING (
    file_id IN (
      SELECT id FROM files WHERE user_id = auth.uid()
    )
  );

-- Allow 'manual' as a valid normalization_status value
ALTER TABLE document_fields
  DROP CONSTRAINT chk_normalization_status;

ALTER TABLE document_fields
  ADD CONSTRAINT chk_normalization_status
  CHECK (normalization_status IN ('raw', 'normalized', 'failed', 'manual'));
