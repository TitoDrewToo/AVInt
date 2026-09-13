# Smart Storage Certification Fix Pass

**Goal:** Correct run-1 defects without modifying certification fixtures, answer keys, or production rows directly.

**Approval:** Andrew approved report math, source-preservation/data-layer behavior, and separation of suitability from safety on 13 September 2026. Collaboration remains disabled. Implementation proceeds inline.

**Architecture:** Keep deterministic datasets authoritative. Fix shared report contracts before interfaces. Preserve structural/security checks while removing business-subject admission decisions. No historic data backfill without a separate supported reprocessing decision.

**Stack:** Next.js/TypeScript, Supabase Edge Functions/PostgreSQL, MCP/Zod.

## Batch 1 — reports
- [ ] Add failing null/zero aggregation and temporal-source round-trip tests in `scripts/test-certification-reports.ts`; reproduce using `npx tsx scripts/test-certification-reports.ts`.
- [ ] Reject missing/non-numeric values before aggregation or ordering comparisons; retain actual zero. Verify sum 100550, mean 7734.615385, minimum 650 for CF period 1.
- [ ] Preserve virtual-dataset date/currency selectors, resolve explicit selectors before period filtering, and reject missing projected temporal fields at save time.
- [ ] Keep split-series limit semantics; test a full 30-day series and fix singular caption grammar.
- [ ] Run report, mapping, relationship, dashboard and PDF regression scripts plus typecheck.

## Batch 2 — source preservation and admission
- [ ] Add tests for subject-classification uncertainty without weakening abuse/structural checks.
- [ ] Add deterministic spreadsheet normalization: preserve source nulls/amounts/names, reject ambiguous amount mappings, annotate header currency derivation, and propagate row/column evidence.
- [ ] Ensure operational datasets do not acquire guessed financial fields or invented confidence.
- [ ] Run prescan, extraction, corrections and dataset parity tests; document supported reprocessing required for historical rows.

## Batch 3 — MCP
- [ ] Publish definition schemas, make create/update handles explicit, expose record pagination and bounded file discovery including failures.
- [ ] Add owned folder discovery/creation and validate personal ingest destinations independently from collaboration.
- [ ] Return safe account/entitlement context and durable status reasons.
- [ ] Investigate duplicate hashes/routes and status evidence before changing duplicate policy. Do not delete existing files.

## Release gate
- [ ] Run typecheck, affected tests and production build; inspect only task-owned diffs.
- [ ] Record deployment evidence for app and changed functions (all functions require `--no-verify-jwt`).
- [ ] Publish exact fixed/open/reclassified defect status and Claude retest instructions. Local passes alone do not mean production is ready.

## Known investigation qualifications
SS-013 limits split groups, not date buckets. MCP-008 is not explained by a current-code file-status filter. Historical traffic admission, duplicate bytes and SS-010 stage differences require production evidence. Existing security architecture document has unrelated user edits and must be preserved.
