# Prescan Security and Smart Security Roadmap

**Status:** approved direction, implementation pending

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
- AI suitability classification for supported PDFs and images;
- quarantine and approved-file storage moves;
- `scan_reason`, `scanned_at`, and approved/quarantined file state;
- the existing handoff into `process-document`.

Known gaps:

- CSV and XLSX skip AI suitability classification;
- the abandoned external scanner call still exists and can fail open;
- the `pending_scan` to `scanning` claim is not atomic;
- rejection presentation is limited to a small Blocked label;
- no canonical file-scan evidence model exists;
- the middleware-era `smart_security_events`, `smart_security_decisions`, and `smart_security_blocks` tables do not represent the new prescan product;
- the old `/api/smart-security/health` route reports historical scaffold state, not prescan health;
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

- Remove the external Smart Security request and response types from `prescan-document`.
- Remove the abandoned Smart Security environment variables from active code and deployment configuration.
- Remove `/api/smart-security/health` and the historical in-repo Smart Security scaffold after confirming no remaining imports.
- Mark the separate Smart Security repositories and infrastructure as retired outside this repository; do not delete external infrastructure from this code change.
- Update operational and product documentation so no current-state claim implies Cloud Run, ClamAV, YARA, Gemma, Gemini, or request middleware is live.

Closure:

- no executable reference remains to the retired endpoints or environment variables;
- prescan continues through its native checks and provider chain;
- the application builds without the historical scaffold.

## Phase 2: prescan-native file defense

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

## Phase 4: canonical rejection evidence

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

Until tamper-evident storage and access history exist, call these investigative records, not legal-grade chain-of-custody evidence.

## Phase 5: customer rejection experience

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

Before commercial rollout, approve:

- quarantine-byte retention;
- evidence-metadata retention;
- account-deletion behavior;
- human re-scan and false-positive release procedures;
- safe deletion procedure;
- access logging for security evidence;
- incident export format.

Recommended starting policy for review:

- quarantined bytes retained for 30 days;
- minimized security metadata retained for 180 days where permitted;
- account deletion removes file bytes;
- no autonomous account punishment, permanent ban, credential revocation, or billing action.

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
- tenant ownership holds across scan, notice, quarantine, and Systems APIs;
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
7. Run the fixture and concurrency suite locally.
8. Deploy prescan with `--no-verify-jwt`, then deploy the application UI.
9. Verify production evidence coverage before changing public security claims.
