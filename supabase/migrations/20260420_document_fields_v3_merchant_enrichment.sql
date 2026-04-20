-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: document_fields v3 — merchant enrichment
-- Run in: Supabase Dashboard → SQL Editor (after normalize-document deploy)
-- Purpose: Unlock spending-intelligence analytics families (merchant-domain
--          lenses, geographic concentration, recurrence detection, line-item
--          unit density) by adding structured signal that the normalizer can
--          extract from raw_json.
--
-- Non-breaking: all columns nullable / booleans default false. Existing reads
-- keep working. Rows stamped with normalization_version < 3 are eligible for
-- lazy re-normalization via the reprocess-documents function.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. New structured columns (all nullable; is_recurring defaults false).
ALTER TABLE document_fields
  ADD COLUMN IF NOT EXISTS merchant_domain          text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS merchant_address_city    text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS merchant_address_region  text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS merchant_address_country text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_recurring             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_cadence       text    DEFAULT NULL;

-- 2. Enum-like constraints. Kept in lock-step with the normalizer prompt —
--    if the prompt taxonomy changes, drop + recreate the constraint in a
--    follow-up migration. Using explicit enums (not a pg ENUM type) keeps
--    evolution cheap.
ALTER TABLE document_fields
  DROP CONSTRAINT IF EXISTS chk_merchant_domain;

ALTER TABLE document_fields
  ADD CONSTRAINT chk_merchant_domain
  CHECK (merchant_domain IS NULL OR merchant_domain IN (
    'food_service',         -- restaurants, cafes, bars
    'grocery',              -- supermarkets, convenience stores
    'fuel',                 -- gas stations
    'transit',              -- ride-share, taxi, public transit, parking, tolls
    'travel',               -- airlines, hotels, lodging, car rental
    'retail',               -- general retail, department, apparel
    'software_saas',        -- SaaS, cloud services, app subscriptions
    'telecom',              -- phone, internet, mobile carriers
    'utilities',            -- electricity, water, gas
    'professional_services',-- legal, accounting, consulting, freelance
    'healthcare',           -- medical, pharmacy, insurance claims
    'financial_services',   -- banks, cards, insurance premiums, fees
    'government',           -- taxes, permits, licenses, fines
    'education',            -- training, courses, conferences, dues
    'entertainment',        -- streaming, events, media (non-deductible post-TCJA)
    'home_office',          -- home-office-specific spend
    'other'
  ));

ALTER TABLE document_fields
  DROP CONSTRAINT IF EXISTS chk_recurrence_cadence;

ALTER TABLE document_fields
  ADD CONSTRAINT chk_recurrence_cadence
  CHECK (recurrence_cadence IS NULL OR recurrence_cadence IN (
    'weekly', 'biweekly', 'monthly', 'quarterly', 'annual', 'irregular'
  ));

-- 3. Index on merchant_domain — Phase 2 R&D layer and Phase 3 family flips
--    (stacked composition by domain, domain-drift correlations) filter here.
--    Partial index keeps size small on sparse early corpora.
CREATE INDEX IF NOT EXISTS idx_document_fields_merchant_domain
  ON document_fields (merchant_domain) WHERE merchant_domain IS NOT NULL;

-- 4. Index on is_recurring — recurrence-aware widgets filter to true.
CREATE INDEX IF NOT EXISTS idx_document_fields_is_recurring
  ON document_fields (is_recurring) WHERE is_recurring = true;

-- ─────────────────────────────────────────────────────────────────────────────
-- Column summary after this migration:
--
-- IDENTITY     id, file_id, created_at
-- CORE         vendor_name, vendor_normalized, employer_name, document_date,
--              currency, jurisdiction
-- MERCHANT     merchant_domain, merchant_address_city,
--              merchant_address_region, merchant_address_country
-- RECURRENCE   is_recurring, recurrence_cadence
-- AMOUNTS      total_amount, gross_income, net_income, tax_amount, discount_amount
-- DETAIL       expense_category, income_source, classification_rationale,
--              invoice_number, payment_method, counterparty_name,
--              period_start, period_end
-- STRUCTURED   line_items (jsonb — items now may include unit_quantity),
--              raw_json (jsonb)
-- PIPELINE     confidence_score, normalization_status, normalization_version,
--              normalized_at, normalization_error
-- ─────────────────────────────────────────────────────────────────────────────
