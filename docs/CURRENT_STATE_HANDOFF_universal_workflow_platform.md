# Current-State Handoff — AVIntelligence Smart Storage Foundation

**Purpose:** Portable context document for a fresh Claude conversation that may not have repository access.  
**Relationship to P0:** The P0 handoff describes the target direction. This document describes what exists today.  
**Repository:** `/Users/avin/Documents/AVINTELLIGENCE/avint`  
**Snapshot date:** 2026-08-21  
**Implementation posture:** Evidence-based. Do not assume a capability exists because it is described in product copy, roadmap documents, or migration comments.

## How to use this document

Read this document together with `P0_HANDOFF_universal_workflow_platform.md`.

- P0 = target product hypothesis and questions for architectural review.
- This document = current implementation and known limitations.

Claude’s job is to compare the two, map reusable foundations, identify tax-specific coupling, inspect or request missing evidence, and draft the rebuild/execution plan. Neither document is permission to perform a broad schema rewrite or destructive migration.

## Current product state

AVIntelligence currently operates as a tax-oriented Smart Storage and Smart Dashboard application with:

- authenticated individual accounts;
- document upload and storage;
- security prescan and quarantine flow;
- AI-assisted document extraction;
- deterministic spreadsheet row extraction;
- normalization into structured financial fields;
- financial dashboards and advanced analytics;
- tax/accounting reports;
- QuickBooks/Xero exports;
- evidence ZIP exports;
- Google Drive import;
- authenticated Claude/MCP tools;
- subscription and entitlement controls;
- account and file deletion;
- operational error/security monitoring.

The current system is a meaningful proof of secure ingestion, extraction, normalization, reporting, and AI integration. It is not yet a generic company/workspace virtual-table platform.

## Current data flow

The current primary path is approximately:

```text
browser/MCP upload
  → storage object in documents/_inbox/
  → files row
  → processing_jobs row
  → prescan-document
  → approved canonical storage path or quarantine
  → process-document
  → document_fields rows
  → normalize-document
  → dashboards/reports/exports/MCP
```

The main implementation files are:

- `lib/smart-storage-ingest.ts` — server-side ingestion helper used by MCP and shared upload flow.
- `supabase/functions/prescan-document/index.ts` — authentication, ownership, file validation, hashing, Smart Security, AI safety, quarantine, and chaining to processing.
- `supabase/functions/process-document/index.ts` — file download, spreadsheet or AI extraction, `document_fields` insertion, and normalization dispatch.
- `supabase/functions/normalize-document/index.ts` — normalization, provider fallback, normalization version, retries, and batch settlement.
- `supabase/functions/reprocess-documents/index.ts` — scheduled/manual normalization retry path.
- `supabase/functions/_shared/ai-providers.ts` — provider selection and fallback chain.
- `app/tools/smart-dashboard/page.tsx` — dashboard UI and advanced analytics trigger.
- `supabase/functions/generate-advanced-analytics/index.ts` — fixed financial/dashboard aggregate computation and widget generation.
- `app/api/mcp/[[...transport]]/route.ts` — authenticated MCP ingestion, report, and export tools.
- `app/api/reports/[report]/route.ts` and `lib/report-engine.ts` — tax/report routes and shared report engine.

## Ingestion implementation

`lib/smart-storage-ingest.ts` currently:

1. Accepts base64 file data with name and MIME type.
2. Applies a synchronous MCP per-file size cap of 15 MB.
3. Uploads to a random path under `${userId}/_inbox/` with `upsert: false`.
4. Inserts a `files` row with user ownership, filename, storage path, MIME type, size, status, and optional Google Drive source metadata.
5. Inserts a `processing_jobs` row with `uploaded` status.
6. Claims document usage through an atomic RPC.
7. Calls `prescan-document` using the service role for the internal chain.
8. Optionally polls `document_fields` for normalized/manual rows for up to 60 seconds.

Important current limitations:

- No general ingestion API contract exists yet for customer-controlled API pushes.
- The MCP file schema is tax/financial-document oriented.
- The source model currently supports Google Drive metadata but is not generic.
- Random storage paths prevent accidental object overwrite but do not provide content deduplication.
- There is no ingestion manifest with expected versus received versus completed items.
- The caller can receive `processing` while asynchronous work continues.

## Prescan and file security

`prescan-document` currently:

- authenticates browser or internal service-role requests;
- checks file ownership;
- processes only `pending_scan` rows;
- requires the object to be under the user’s `_inbox` path;
- downloads and size-checks the object;
- checks magic MIME and extension consistency;
- validates PDF/CSV/spreadsheet structure;
- computes SHA-256;
- rejects hashes previously quarantined;
- calls Smart Security;
- runs an AI safety pass for applicable non-spreadsheet files;
- moves approved files from `_inbox` to a canonical user path;
- records `sha256`, `scanned_at`, `scan_reason`, document type, and approved status;
- moves rejected files to `_quarantine`.

Storage RLS prevents normal clients from reading, updating, or deleting `_inbox` and `_quarantine` objects. Users can upload to their own user-prefixed path and access their canonical objects.

Important limitations:

- Hashes are indexed but not unique for approved files.
- Quarantined-hash rejection is not equivalent to general duplicate handling.
- The status read and status update are not a single atomic claim operation.
- Prescan/process failures can leave rows needing retry or intervention.
- Raw source objects are not represented as immutable version records.

Relevant evidence:

- `supabase/functions/prescan-document/index.ts:464-619`
- `supabase/functions/prescan-document/index.ts:655-670`
- `supabase/migrations/20260415_phase_b_upload_gate.sql`

## Extraction and normalization

`process-document` currently:

- accepts `approved` files and legacy `uploaded` files;
- checks ownership for non-service-role requests;
- applies subscription/firm entitlement and usage claims;
- downloads the canonical object;
- extracts spreadsheet rows deterministically with SheetJS;
- stores spreadsheet source rows in `files.source_rows_json`;
- uses an AI provider fallback for non-spreadsheet extraction;
- inserts one or more `document_fields` rows;
- stores raw extraction under `raw_json`;
- stores provider and source-row metadata in `raw_json`;
- assigns a random normalization batch ID;
- invokes `normalize-document`.

`normalize-document` currently:

- reads the latest/inline `document_fields` row;
- sends extracted fields plus `raw_json` to the selected provider;
- uses a provider chain, currently OpenAI then Anthropic by default;
- updates normalized financial fields;
- preserves enriched AI output in `raw_json`;
- records provider, version, timestamp, status, and error state;
- creates contract payment obligations when applicable;
- settles multi-row normalization batches;
- applies a retry ceiling to normalization.

Important limitations:

- Re-invoking `process-document` can insert another set of `document_fields` rows because extraction completion is not protected by a durable per-file idempotency invariant.
- `document_fields` is heavily financial/tax-shaped: vendor, employer, dates, currency, amounts, expense category, income source, tax amount, payment method, merchant enrichment, and related fields.
- Normalization versioning is implementation/prompt versioning, not user-defined profile/schema versioning.
- Reprocessing updates the current row rather than producing a clean immutable record-version history.
- Field-level source citations, page regions, and generic evidence coordinates are not implemented.

Relevant evidence:

- `supabase/functions/process-document/index.ts:832-946`
- `supabase/functions/process-document/index.ts:997-1103`
- `supabase/functions/normalize-document/index.ts:184-241`
- `supabase/functions/normalize-document/index.ts:313-371`
- `supabase/functions/reprocess-documents/index.ts:251-329`

## Current reports, dashboards, and outputs

The current output system is primarily financial:

- Tax Bundle / Schedule C-oriented reports;
- business-expense reporting;
- P&L and income/expense surfaces;
- QuickBooks and Xero CSV exports;
- firm/client tax export and evidence ZIP;
- Smart Dashboard financial metrics;
- AI-generated dashboard widgets and context summaries.

The reports and tax calculations are valuable existing proof and should be preserved while the universal profile/output layer is designed around them.

The current advanced analytics function is not a generic virtual-table output engine. It:

- loads all user files;
- selects fixed financial fields from `document_fields`;
- computes income, expenses, categories, vendors, currencies, monthly trends, and related aggregates;
- asks Anthropic Haiku by default, with provider fallback, to author validated dashboard widgets;
- persists widget/layout state.

This is a useful foundation for generic output authoring, but it must be generalized to accept a profile/schema/query contract rather than fixed financial fields.

Relevant evidence:

- `supabase/functions/generate-advanced-analytics/index.ts:206-365`
- `app/tools/smart-dashboard/page.tsx:1814-1899`
- `lib/advanced-analytics-config.ts`
- `supabase/functions/_shared/widget-schemas.ts`

## Current Claude/MCP state

The authenticated MCP route currently exposes three tools:

1. `smart_storage.ingest`
   - accepts up to six financial documents;
   - writes to the signed-in user’s own storage;
   - runs the existing ingestion pipeline.

2. `smart_storage.report`
   - read-only;
   - produces tax-bundle or business-expense reports;
   - supports period and folder scope.

3. `smart_storage.export`
   - read-only;
   - produces QuickBooks/Xero-oriented CSV output.

Authentication is OAuth/account scoped, with entitlement and rate-limit guards. Reports and exports are described as read-only; ingestion is the write operation.

The MCP system is therefore a good authentication and integration foundation but not yet the generic agent interface described by P0. It lacks profile discovery, schema description, generic record queries, change queries, evidence retrieval, workflow execution, output-template operations, and company/workspace roles.

Relevant evidence:

- `app/api/mcp/[[...transport]]/route.ts:18-101`
- `lib/mcp-auth.ts`
- `docs/MCP_OAUTH_SETUP.md`
- `docs/CONNECT_TO_CLAUDE.md`

## Current hidden assistant state

The hidden in-app assistant exists but is currently a product/wiki assistant:

- `components/product-assistant-preview.tsx` contains the UI;
- `app/api/chat/route.ts` authenticates, checks entitlement, rate-limits, and calls OpenAI;
- `lib/product-assistant.ts` retrieves sections from `docs/product-assistant-knowledge.md` using simple lexical matching;
- `components/navbar.tsx` keeps the assistant rollout disabled with `assistantRolloutEnabled = false` until the wiki-backed source is ready.

This assistant is not currently connected to user records, virtual tables, or output-template generation. The P0 direction is to reuse the existing assistant and dashboard widget pipeline as a future in-app workflow/output authoring surface, not to mistake the current wiki assistant for that capability.

## Current Supabase table inventory and direction

The local migration history does not contain the original creation migration for every baseline table. In particular, the live definitions of `files`, `document_fields`, `processing_jobs`, and `folders` require a database inventory before migration decisions.

### Retain and generalize

- `files` — source-document layer.
- `document_fields` — likely virtual-record/record-version redesign or replacement; preserve tax compatibility.
- `processing_jobs` — generalized ingestion/workflow jobs.
- `folders` — clarify storage versus source/profile scope.
- `google_drive_connections` — migrate toward generic `source_connections`.
- `advanced_widgets`, `dashboard_layouts`, `context_summaries`, `user_analytics_profile` — dashboard/output projections.
- `document_processing_usage`, `report_export_usage` — generalize toward workflow/output usage.
- `firms`, `firm_admins`, `firm_clients` — possible company/workspace foundation, subject to terminology and authorization review.

### Likely additions to evaluate

```text
workspaces
workspace_members
data_profiles
profile_schema_versions
source_connections
source_objects
ingestion_runs
ingestion_items
virtual_records
record_versions
record_corrections
workflow_templates
workflow_runs
output_templates
output_runs
output_artifacts
reconciliation_results
audit_events
```

These are design candidates, not approved table names.

### Preserve as tax/domain modules

- `report_assumptions`;
- `payment_obligations`;
- tax-specific columns and report logic;
- Schedule C and accounting exporters;
- tax report routes and evidence packaging.

### Retain as platform infrastructure

- subscriptions and entitlement tables;
- gift codes and referrals;
- rate limits and usage metering;
- processed webhook events;
- error monitoring tables;
- Smart Security event/decision/block tables;
- inquiry tables, subject to current product posture.

### Deprecation candidates, only after dependency audit

- `api_keys`, if OAuth-only API/MCP becomes final;
- `google_drive_connections`, after generic connections exist;
- firm-specific naming, after workspace/role migration;
- tax-specific usage/report naming, after generalized contracts exist.

No table should be dropped from this document alone. The migration sequence should be:

```text
inventory live schema and dependencies
  → define generic contracts
  → add or dual-write new structures
  → update readers and writers
  → verify reports, dashboards, exports, RLS, and deletion
  → deprecate old structures
  → remove only after audited migration and rollback window
```

## Enterprise-hardening current assessment

| Requirement | Current reality |
|---|---|
| Idempotent ingestion | Partial/weak. Google Drive source uniqueness and state gates exist; general duplicate and concurrent-processing protection does not. |
| Reliable retries | Partial. Normalization retries exist; prescan and extraction retry/reconciliation are incomplete. |
| Job reconciliation | Partial. Jobs, batch IDs, and stuck-job sweeps exist; no authoritative ingestion manifest exists. |
| Immutable raw references | Partial. Storage paths, hashes, raw JSON, and source rows exist; immutable version history does not. |
| Record versioning | Missing. Reprocessing updates current records rather than creating complete record versions. |
| Profile/schema versioning | Missing for the target product. Normalization version is not a user/company profile schema. |
| Correction history | Partial. Manual fields/notes exist; field-level before/after audit history does not. |
| Audit events | Partial. Logs and error events exist; complete data lineage/audit events do not. |
| Generic export | Partial/weak. Existing exports are tax/accounting/evidence-specific. |
| Retention/deletion documentation | Weak/partial. Account deletion exists; retention, backup, restore, and deletion guarantees are incomplete. |
| Provider abstraction | Partial/good. Provider chains exist; generic output contracts and provider evaluation/migration controls do not. |
| Workspace/role authorization | Limited. Individual ownership and firm-admin checks exist; generic workspace roles do not. |
| MCP permissions | Partial/good for individual tax tools; no generic profile/workspace permission model. |
| Operational monitoring | Partial. Logs, error monitoring, security events, and job sweeps exist; end-to-end ingestion health does not. |
| API documentation/diagnostics | Mostly missing. MCP and Google Drive exist; generic ingestion API, setup diagnostics, and connection health do not. |

## Reusable foundation

The most reusable parts of the current build are:

- storage and file ownership boundaries;
- prescan/quarantine/security pipeline;
- raw source retention pattern;
- deterministic spreadsheet extraction;
- provider fallback pattern;
- processing and normalization states;
- evidence-oriented report rows;
- dashboard/widget schema validation;
- authenticated MCP transport;
- rate limiting and entitlement checks;
- account/file deletion mechanics;
- operational error/security logging.

## Tax-specific coupling to isolate

The main coupling to address is not the existence of tax reports; it is that the storage and processing shape assumes financial records:

- fixed financial columns in `document_fields`;
- tax-oriented prompts and classifications;
- tax report query and export assumptions;
- MCP tools named and scoped around tax/business expense;
- entitlement and usage language centered on documents/reports;
- firm/client semantics tied to CPA workflows;
- dashboard aggregates based on income, expense, currency, category, and tax fields.

These should become a tax domain/profile over a more generic ingestion and record layer, while remaining operational during migration.

## What the rebuild must answer

Before implementation, Claude should determine:

1. Can current `files` remain the source-document table?
2. Should `document_fields` become versioned virtual records or be replaced by a new record model?
3. What is the canonical ingestion-run and idempotency contract?
4. How are raw files, extraction attempts, normalized records, corrections, and outputs separated?
5. How are profile/schema versions stored and migrated?
6. How are company workspaces, roles, sources, and profile permissions enforced?
7. How does the customer-controlled ingestion API authenticate and report status?
8. How does the system reconcile source counts, duplicate records, deletions, and changed files?
9. How do native outputs query arbitrary profiles without allowing unsafe AI-generated math?
10. How does MCP expose generic read/query/output tools with clear permissions?
11. How are retention, backups, deletion, exports, and rollback documented?
12. What is the smallest complete vertical slice that proves the founder profile and then supports the four synthetic role profiles?

## Required next deliverable from Claude

Claude should produce, in this order:

1. current-state capability and dependency map;
2. live Supabase schema/RLS/function inventory;
3. tax-domain versus universal-core boundary map;
4. table disposition: retain, modify, add, deprecate;
5. target virtual-profile/record/output data model;
6. API-first ingestion contract;
7. provenance, correction, reconciliation, and export model;
8. enterprise-hardening gap plan;
9. migration and rollback strategy;
10. phased execution plan beginning with the founder profile and synthetic role demos.

The execution plan must include acceptance tests, security tests, data fixtures, migration gates, and explicit non-goals. It must preserve the current tax reports and dashboards until their replacement or internal continuation is verified.
