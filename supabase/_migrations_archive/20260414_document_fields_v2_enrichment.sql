-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: document_fields v2 enrichment
-- Run in: Supabase Dashboard → SQL Editor (after coding pass is complete)
-- Purpose: Adds structured fields that let reports be pure SELECTs instead of
--          downstream assumptions / advisory banners / folder-based failsafes.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Structured semantic fields populated by the normalizer from raw_json.
ALTER TABLE document_fields
  ADD COLUMN IF NOT EXISTS income_source           text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS vendor_normalized       text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS jurisdiction            text  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS classification_rationale text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS normalization_version   int   DEFAULT 1;

-- 2. Allowed income_source values. business → Schedule C base. wage → W-2-like
--    (shown informationally, never offset by Schedule C expenses). investment,
--    rental, interest, other → surfaced in reports but excluded from SchedC math.
ALTER TABLE document_fields
  DROP CONSTRAINT IF EXISTS chk_income_source;

ALTER TABLE document_fields
  ADD CONSTRAINT chk_income_source
  CHECK (income_source IS NULL OR income_source IN (
    'business', 'wage', 'investment', 'rental', 'interest', 'other'
  ));

-- 3. Index for period-overlap queries. Tax Bundle and other period-scoped
--    reports filter on (period_start, period_end) overlap with the user's
--    selected range — a btree on period_end is sufficient because the outer
--    filter is `period_end >= :from AND period_start <= :to`.
CREATE INDEX IF NOT EXISTS idx_document_fields_period_end
  ON document_fields (period_end);

CREATE INDEX IF NOT EXISTS idx_document_fields_income_source
  ON document_fields (income_source) WHERE income_source IS NOT NULL;

-- 4. Rows already normalized under the v1 prompt get version 1. A backfill
--    job (scripts/renormalize.ts) bumps rows to the current version lazily.
UPDATE document_fields
  SET normalization_version = 1
  WHERE normalization_version IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Column summary after this migration:
--
-- IDENTITY     id, file_id, created_at
-- CORE         vendor_name, vendor_normalized, employer_name, document_date,
--              currency, jurisdiction
-- AMOUNTS      total_amount, gross_income, net_income, tax_amount, discount_amount
-- DETAIL       expense_category, income_source, classification_rationale,
--              invoice_number, payment_method, counterparty_name,
--              period_start, period_end
-- STRUCTURED   line_items (jsonb), raw_json (jsonb)
-- PIPELINE     confidence_score, normalization_status, normalization_version,
--              normalized_at, normalization_error
-- ─────────────────────────────────────────────────────────────────────────────
