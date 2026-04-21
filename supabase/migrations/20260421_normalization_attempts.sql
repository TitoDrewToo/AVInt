-- Retry ceiling for document normalization.
--
-- normalize-document previously had no cap on retries. A row whose raw_json
-- can't be parsed, or whose payload breaks both providers, could be
-- re-invoked indefinitely by scripts/renormalize.ts, manual reprocess calls,
-- or future scheduled sweeps — each retry burning OpenAI/Anthropic tokens.
--
-- Counter resets to 0 on a successful normalization so legitimate
-- version-upgrade re-runs aren't blocked by stale failure history. Manual
-- override: set normalization_attempts = 0 on the row.

alter table public.document_fields
  add column if not exists normalization_attempts integer not null default 0;
