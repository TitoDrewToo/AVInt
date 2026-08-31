-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: document_fields enrichment columns
-- Run in: Supabase Dashboard → SQL Editor
-- Purpose: Adds fields for richer OpenAI normalization output,
--          pipeline state tracking, and future manual_entries parity
-- ─────────────────────────────────────────────────────────────────────────────

-- Financial detail fields (extractable from raw_json by OpenAI)
ALTER TABLE document_fields
  ADD COLUMN IF NOT EXISTS tax_amount         numeric        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS discount_amount    numeric        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS invoice_number     text           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS payment_method     text           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_start       date           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS period_end         date           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS counterparty_name  text           DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS line_items         jsonb          DEFAULT NULL;

-- Pipeline state tracking
ALTER TABLE document_fields
  ADD COLUMN IF NOT EXISTS normalization_status  text        DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS normalized_at         timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS normalization_error   text        DEFAULT NULL;

-- Constraint: only allow known status values
ALTER TABLE document_fields
  DROP CONSTRAINT IF EXISTS chk_normalization_status;

ALTER TABLE document_fields
  ADD CONSTRAINT chk_normalization_status
  CHECK (normalization_status IN ('raw', 'normalized', 'failed'));

-- Index for re-processing queries (find all rows that need normalization or failed)
CREATE INDEX IF NOT EXISTS idx_document_fields_norm_status
  ON document_fields (normalization_status);

-- Backfill: existing rows were processed without the new columns — mark as raw
-- so they can be re-normalized on next run if needed
UPDATE document_fields
  SET normalization_status = 'raw'
  WHERE normalization_status IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Summary of columns after migration:
--
-- IDENTITY        id, file_id, created_at
-- CORE FIELDS     vendor_name, employer_name, document_date, currency
-- AMOUNTS         total_amount, gross_income, net_income,
--                 tax_amount, discount_amount
-- DETAIL          expense_category, invoice_number, payment_method,
--                 counterparty_name, period_start, period_end
-- STRUCTURED      line_items (jsonb), raw_json (jsonb)
-- PIPELINE        confidence_score, normalization_status,
--                 normalized_at, normalization_error
-- ─────────────────────────────────────────────────────────────────────────────
