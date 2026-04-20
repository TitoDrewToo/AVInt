-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: user_analytics_profile — add corpus signature
-- Run in: Supabase Dashboard → SQL Editor
-- Purpose: Persist a compact snapshot of the user's corpus shape at the time
--          of the last Advanced Analytics run, so the client can detect
--          whether new signal is available for a fresh run and surface the
--          four-state trigger (unlock moment / new signal / stable / sparse).
--
-- Non-breaking: single nullable JSONB column added. All existing reads and
-- writes of user_analytics_profile continue to work unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_analytics_profile
  ADD COLUMN IF NOT EXISTS last_run_signature jsonb DEFAULT NULL;

COMMENT ON COLUMN user_analytics_profile.last_run_signature IS
  'Corpus signature captured on last successful Advanced Analytics run. Compared against current signature client-side to detect new-signal availability. Shape and versioning live in lib/analytics-readiness.ts — the v field gates forward compatibility as fields are added in Phase 1.';

-- Signature shape (v1):
-- {
--   "v": 1,
--   "fieldsCount": number,
--   "monthSpan": number,
--   "uniqueVendors": number,
--   "uniqueCategories": number,
--   "uniqueDomains": number,       -- zero until Phase 1 merchant_domain ships
--   "uniqueRegions": number,       -- zero until Phase 1 merchant_address_region ships
--   "hasRecurrence": boolean,      -- false until Phase 1 is_recurring ships
--   "hasLineItemUnits": boolean    -- false until normalizer populates unit_quantity
-- }
