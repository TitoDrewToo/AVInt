# Prescan Security and Smart Security Roadmap

**Status:** Phases 1–7 are deployed; externally anchored checkpoints and legal-process review remain future work

**Updated:** 2026-09-08
**Authority:** this document supersedes every earlier Smart Security Cloud Run, middleware, Gemma-service, Antigravity, and autonomous-defense plan in this repository.

## Product definition

Smart Security is AVIntelligence's integrated upload-defense, rejection-evidence, and investigation capability. It is not a separate Cloud Run product or middleware service.

`prescan-document` is the enforcement point:

```text
upload
  -> protected _inbox object
  -> prescan authentication and ownership check
  -> deterministic file validation
  -> file-type security inspection
  -> optional AI suitability / abuse classification
  -> durable prescan decision
  -> approve, quarantine, reject, or hold for retry
  -> existing process-document flow only when approved
```

Nothing in this roadmap changes extraction, normalization, reports, dashboards, or the canonical data layer. `process-document` remains downstream and receives only approved new uploads.

## Retired architecture

The following are abandoned and must not be treated as current dependencies or future requirements:

- the standalone `smart-security` Cloud Run scanner;
- the proposed `smart-security-llm` Cloud Run service;
- the deleted Next.js request middleware / `proxy.ts` integration;
- `/v1/scan/file`, `/v1/decide`, and `/v1/events` as AVIntelligence service boundaries;
- signed-URL handoff from prescan to a standalone scanner;
- `SMART_SECURITY_URL`, `SMART_SECURITY_API_KEY`, `SMART_SECURITY_REQUIRED`, `SMART_SECURITY_MIDDLEWARE_MODE`, and `SMART_SECURITY_LLM_*`;
- Gemma, Gemini, or another model as a malware authority;
- the May 2026 Antigravity, autonomous-defense, two-service, and external Smart Security product plans.

The old `smart-security/` schemas and policies are historical scaffolding. They are non-authoritative and should be removed with the stale health route during implementation after dependency checks.

## Current baseline

`supabase/functions/prescan-document/index.ts` already provides:

- authenticated browser and internal calls;
- file ownership and `_inbox` path validation;
- file-size and supported-type limits;
- magic-byte and extension consistency checks;
- PDF active-content inspection;
- CSV formula / command-cell detection;
- XLSX container, macro, ActiveX, embedded-object, and external-link checks;
- SHA-256 calculation and known-quarantined-hash refusal;
- AI suitability classification for PDFs, images, CSV, and XLSX through distinct OpenAI-primary and Anthropic-fallback providers;
- bounded representative CSV/XLSX previews; raw XLSX containers are never sent to an AI provider;
- quarantine and approved-file storage moves;
- `scan_reason`, `scanned_at`, and approved/quarantined file state;
- the existing handoff into `process-document`.
- no dependency on the retired standalone scanner in application or prescan code.

Known gaps:

- the middleware-era `smart_security_events`, `smart_security_decisions`, and `smart_security_blocks` tables do not represent the new prescan product;
- without a selected antivirus engine, the product must not claim comprehensive signature-based malware scanning.

## Security authority

Native prescan is authoritative for the controls it can prove:

- file identity and type;
- size and container validity;
- prohibited active content;
- PDF structural risks;
- Office macro, ActiveX, embedded-object, and external-link risks;
- CSV formula injection patterns;
- known rejected hashes;
- bounded content suitability and abuse classification.

AI may classify suitability, detect suspicious content, or explain a rejection. AI never certifies a file as malware-free and never overrides a deterministic security rejection.

Comprehensive antivirus signatures are a separate future decision. Adding a managed malware scanner requires privacy, retention, latency, and vendor-review approval. The retired Cloud Run service is not the default answer.

## Phase 1: remove retired integration

- [x] Remove the external Smart Security request and response types from `prescan-document`.
- [x] Remove the abandoned Smart Security environment variables from active code and repository configuration.
- [x] Remove `/api/smart-security/health` and the historical in-repo Smart Security scaffold after confirming no remaining imports.
- [x] Update operational and product documentation so no current-state claim implies Cloud Run, ClamAV, YARA, Gemma, Gemini, or request middleware is live.
- [x] Deploy native prescan version 34, verify it is active, and remove the only remaining retired Supabase secret (`SMART_SECURITY_API_KEY`). The separate infrastructure remains retired and was not deleted by this repository change.

Closure:

- no executable reference remains to the retired endpoints or environment variables;
- prescan continues through its native checks and provider chain;
- the application builds without the historical scaffold.

## Phase 2: prescan-native file defense

**Implementation status:** the CSV/XLSX parser, archive-bound, active-content, preview, strict model-response, and provider-fallback increment is deployed in `prescan-document` version 37. The dedicated retry outcome remains coupled to Phase 3 because it requires the approved additive file lifecycle.

Apply the same prescan boundary to PDF, image, CSV, and XLSX uploads.

### Common checks

- authenticate the caller and verify file ownership;
- require an object under the owning user's `_inbox` path;
- enforce byte-size limits while reading;
- compare declared MIME, extension, magic bytes, and actual container type;
- calculate SHA-256 before expensive work;
- reject known quarantined hashes for the same user;
- bound parsing by bytes, rows, columns, sheets, archive entries, nesting depth, memory, and time;
- reject malformed or ambiguous files rather than guessing.

### PDF and image checks

- preserve the existing executable PDF-marker rules;
- continue allowing benign `/OpenAction` and `/AA` view actions unless paired with executable actions;
- reject embedded files, JavaScript, launch actions, rich media, form submission, and import-data actions;
- reject malformed or unsupported images before model calls.

### CSV and spreadsheet checks

- scan CSV with a delimiter-aware parser instead of naive string splitting;
- inspect the complete bounded CSV for formula / command-cell prefixes;
- validate XLSX ZIP structure before reading workbook content;
- reject macros, ActiveX, OLE objects, embedded payloads, external executable links, and archive bombs;
- allow ordinary XLSX formulas but never execute or evaluate them;
- cap sheets, rows, columns, representative cells, decompression ratio, and XML depth.

### Suitability classification

- preserve OpenAI to Anthropic fallback for supported documents;
- construct a bounded CSV preview from headers and representative rows;
- construct a bounded XLSX preview from sheet names, dimensions, headers, and representative scalar values;
- never send a raw XLSX container to an AI provider;
- keep model choice environment-overridable without changing the security contract;
- record provider, model, duration, fallback status, and result;
- provider exhaustion blocks processing as `retry_required`, not as malware.

## Phase 3: lifecycle and idempotency

**Implementation status:** deployed in `prescan-document` version 38. The conditional update permits only one concurrent claimant. New `rejected` and `scan_failed` states are live; blocked jobs are terminal and both browser and MCP retries understand the new lifecycle.

Make the `pending_scan` to `scanning` claim conditional and atomic. Only the invocation that successfully claims the row may continue.

Per file, guarantee:

- one active prescan attempt;
- one durable decision per attempt;
- one storage move;
- one rejection notice;
- at most one `process-document` invocation.

Outcomes:

- `approved`: all required checks passed;
- `quarantined`: security risk or prohibited active content;
- `rejected`: malformed, unsupported, or unsuitable content;
- `scan_failed`: a transient provider or internal failure; retry is allowed and processing remains blocked.

The new outcomes require an additive file-status migration and updates to status consumers. They do not change extraction or normalization.

Every current upload entry point must create `pending_scan`. Add a contract test preventing new direct `uploaded` writers. The processor's legacy acceptance of `uploaded` remains transitional debt until old rows are reconciled under a separate approval.

Authenticated clients may create physical-file rows only under their own `_inbox` path. Database column grants and an insert trigger force `pending_scan`/`unknown` and prevent clients from authoring hashes, scan results, claim timestamps, normalization counters, or later lifecycle states. After creation, browsers may update only filename, folder placement, and spreadsheet-review metadata; the service role owns security and processing state.

## Phase 4: canonical rejection evidence

**Implementation status:** deployed through migration `20260908090000_prescan_lifecycle_and_evidence`. `prescan_security_events` is the service-role-only canonical append-only store. Each attempt has a correlation ID and action intent is persisted before a storage move. Missing terminal events remain visible as reconciliation gaps.

Create a service-role-only `prescan_security_events` table as the authoritative append-only trail. Do not reuse the generic middleware-era Smart Security tables.

Each event records:

- event ID and correlation ID;
- account ID and file ID;
- filename, size, SHA-256, declared MIME, and detected MIME;
- prescan stage and event type;
- outcome, normalized reason code, safe reason, and internal signals;
- prescan version;
- AI provider and model only when AI was called;
- timestamps and duration;
- intended and completed storage action.

Never store signed URLs, raw file contents, model prompts containing unnecessary content, credentials, or another account's activity.

Required event sequence:

```text
prescan.requested
prescan.claimed
prescan.validation_completed
prescan.suitability_completed (when applicable)
prescan.action_intended
prescan.approved | prescan.quarantined | prescan.rejected | prescan.retry_required
```

Persist `action_intended` before moving or approving the object. The terminal event records the actual result. Systems reporting must flag an intended action without a terminal event for reconciliation.

Access:

- service role may insert;
- Systems administrators may read through authenticated server APIs;
- customers never read this table directly;
- account deletion and evidence retention follow an approved retention policy.

Phase 7 adds database-level seals and administrator access history. Those controls make the records tamper-evident inside the operational database; they do not make them legally certified chain-of-custody evidence.

## Phase 5: customer rejection experience

**Implementation status:** persistent batch identity is deployed across browser, MCP, and integration uploads. Open notices are grouped with accepted, quarantined, rejected, retry-required, and still-checking totals. Individual and dismiss-all controls are implemented without modifying evidence or file outcomes.

Add a persistent, closable rejection panel beside the existing ingestion activity presentation in Smart Storage.

The panel shows:

- batch counts for accepted, quarantined, rejected, and retry-required files;
- filename, timestamp, status, and short safe reason;
- an appropriate next action: replace, remove, retry, or contact support;
- expandable customer-safe detail where helpful.

Customer reason categories:

- security risk detected;
- unsupported active content;
- malformed file;
- unsupported file type;
- unsuitable content;
- security or suitability check could not complete.

Do not expose internal rule names, raw signatures, stack traces, storage paths, other-account correlations, or sensitive detector details.

Dismissal changes only notification state. It never deletes the file, quarantine result, or evidence. Store dismissal server-side in an owner-scoped rejection-notice record so it follows the account across devices.

## Phase 6: Systems security operations

**Implementation status:** deployed with `prescan-document` version 39. The read-only administrator API, `/systems/security` evidence console, Systems overview summary, and bounded stale-prescan reconciliation are live. The reconciler fails closed: recoverable moved objects are restored to `_inbox`, stale files become `scan_failed`, and no interrupted decision is inferred or passed to processing.

Add an internal Security destination at `/systems/security` and a summary card on `/systems`.

The first release is read-only.

### Posture

- last successful prescan;
- pass, quarantine, rejection, retry, and failure counts;
- evidence coverage;
- active prescan version;
- unresolved quarantine count;
- incomplete event sequences requiring investigation.

### Rejections

Search and filter by time, account, filename, outcome, reason, MIME type, hash, and signal. Selecting an event opens a detail drawer showing:

```text
upload received
  -> prescan claimed
  -> validation
  -> suitability check
  -> decision persisted
  -> storage action
  -> customer notice
```

### Quarantine

Show unresolved quarantined files, decision, reason, age, retention state, and re-scan eligibility. Do not provide raw-file preview or download in version one.

### Intelligence

Show repeated hashes, recurring signals, rejection spikes, repeated attempts, error patterns, and false-positive outcomes. Cross-account correlation stays restricted to administrators and never identifies one customer to another.

Use the existing Systems administrator gate and server-authorized APIs. Service credentials and unrestricted evidence queries never reach the browser. Visual redesign of `/systems` is deferred.

## Phase 7: operations and retention

**Implementation status:** deployed through migrations `20260908150000_add_security_retention_and_admin_audit` and `20260908153000_enforce_append_only_security_evidence_grants`, `prescan-document` version 40, and web commit `6ede5f2`.

Operational policy:

- security-quarantined bytes remain private under `_quarantine` for 30 days;
- ordinary rejected bytes remain private under `_quarantine` for 24 hours;
- an administrator can place a reasoned investigation hold that suspends byte deletion;
- a held object cannot be re-scanned until the hold is released;
- re-scan returns the same private object to `_inbox` and invokes `prescan-document`; it never releases directly into processing;
- a daily reconciler repairs missing retention rows, safely claims eligible deletion work, and records intended, completed, failed, and recovered deletion actions;
- minimized evidence older than 180 days is reported as archive-eligible but is not automatically deleted;
- account deletion continues to remove account-scoped prescan evidence and file bytes under the approved product privacy behavior;
- no autonomous account punishment, permanent ban, credential revocation, or billing action exists.

Evidence integrity:

- prescan events are sealed from a canonical JSON payload with SHA-256;
- new events link to the previous event hash in the same prescan correlation;
- pre-Phase-7 events are explicitly treated as independently sealed baseline roots;
- evidence reads, exports, re-scan operations, holds, and retention actions append to a separately sealed administrator audit chain;
- service-role access is limited to `SELECT` and `INSERT` on both evidence tables; browser roles have no direct access;
- deleting an operational file cannot null or rewrite an already-sealed event identifier;
- the administrator export includes both chains and an offline verifier that detects changed fields, changed payloads, duplicate IDs, and broken links.

The current guarantee is **database-sealed, tamper-evident investigative evidence**. It is not yet an externally anchored or legally reviewed custody system. A sufficiently privileged database operator can still alter the database and its local chain, and application audit events do not capture direct Supabase platform access.

### Production proof — 2026-09-09

A controlled MCP-ingest proof exercised `prescan-document` version 40 against the owner/test account:

- a clean synthetic CSV completed `pending_scan -> approved -> normalized`, produced one processing job, one canonical record, exact `normalization_expected = normalization_settled = 1`, and a valid six-event sealed prescan chain;
- its two extraction rows were verified as the intended raw attempt 1 and normalized `root` attempt 2, not duplicate processing;
- the clean file, canonical record, derived rows, storage bytes, and usage claim were removed after verification; its sealed security evidence remains;
- an inert CSV formula-injection fixture was quarantined with reason `csv_formula_cell`, produced zero extraction rows and zero canonical records, retained one terminal processing job, created an open customer notice, and created a valid 30-day private-byte retention case;
- the quarantine evidence contains four valid sealed events with three verified links and no signed URL or raw file content;
- the quarantined fixture remains intentionally available in `/systems/security` for the authenticated administrator hold/re-scan UI proof.

Still requiring an authenticated human-administrator exercise: place and release an investigation hold, start re-scan from the Systems console, and verify the resulting administrator-audit sequence. Timed 24-hour/30-day deletion should be accelerated in staging rather than waiting on production.

The proof also exposed and then closed a metering inconsistency. MCP ingest still reserves document-processing quota before prescan so over-limit uploads cannot incur downstream processing cost, but it now releases that reservation after any rejected, quarantined, or retry-required outcome. Approved processing retains the idempotent reservation. Production verification against the retained quarantine fixture changed usage from one to zero while leaving its file status, zero extraction and record counts, four sealed evidence events, and retention record unchanged. Security-blocked files therefore do not consume document-processing quota; abuse controls remain separate.

## Phase 8: external anchoring and legal-process readiness

This is a separate approval and key-management project, not a hidden completion claim in Phase 7:

- periodically sign the current prescan and administrator-audit chain heads;
- store signed checkpoints outside the primary Supabase project in immutable or independently controlled storage;
- verify checkpoint continuity during evidence export;
- capture direct database, storage, and platform administrator access through provider audit logs;
- define clock, signing-key rotation, evidence-hold, export, custody-transfer, and incident-handling procedures;
- approve retention and account-deletion exceptions for investigations;
- obtain legal review before describing exports as legal chain-of-custody evidence.

## Verification

Fixture coverage:

- clean receipt and contract PDFs;
- clean PNG and JPEG;
- clean CSV;
- clean XLSX with ordinary formulas;
- Office active-content fixture;
- suspicious PDF fixture;
- malformed and archive-bomb XLSX fixtures;
- oversized and MIME-mismatched files;
- CSV formula-injection fixtures;
- invalid ownership and storage paths;
- provider timeout and exhaustion;
- concurrent duplicate prescan calls.

Required assertions:

- every supported file type passes through prescan;
- clean files reach `process-document` exactly once;
- quarantined, rejected, and retry-required files never reach processing;
- transient failures never claim malware was detected;
- every completed action has a durable terminal event;
- no secrets or raw file content enter evidence metadata;
- dismissal leaves evidence intact;
- scheduled byte deletion never runs while an investigation hold exists;
- a held object cannot be re-scanned or released;
- every administrator evidence read and state-changing action is appended to the administrator audit trail;
- sealed exports fail verification when a visible field, canonical payload, event hash, or chain link changes;
- tenant ownership holds across scan, notice, quarantine, and Systems APIs;
- authenticated clients cannot author file security/lifecycle columns or insert outside their own `_inbox`;
- clean business fixtures produce no unexplained rejection;
- build, TypeScript, lint, edge checks, migration reset, and targeted security tests pass.

## Future malware-engine decision

Native prescan improves document safety but is not equivalent to antivirus signature coverage. If commercial requirements justify a dedicated malware engine, evaluate it as a separate project with these gates:

- customer-file privacy and retention terms;
- regional processing and data residency;
- supported file sizes and formats;
- latency and availability;
- signed request and response integrity;
- cost and abuse controls;
- false-positive corpus results;
- clear failure behavior.

No retired Cloud Run component is automatically revived by that decision.

## Execution order

1. Remove abandoned code, configuration, health surface, and documentation.
2. Add prescan-native CSV/XLSX inspection and bounded suitability previews.
3. Make prescan claiming and terminal actions idempotent.
4. Add the evidence and notification migrations with reviewed grants and RLS.
5. Add customer rejection notices.
6. Add `/systems/security` and authenticated server APIs.
7. Add bounded byte retention, investigation holds, re-scan controls, database seals, administrator audit history, and verifiable evidence export.
8. Run the fixture, concurrency, evidence-integrity, access-control, TypeScript, lint, edge, and production-build checks.
8. Deploy prescan with `--no-verify-jwt`, then deploy the application UI.
9. Verify production evidence coverage before changing public security claims.
