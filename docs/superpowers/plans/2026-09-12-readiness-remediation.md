# Client readiness remediation implementation plan

**Goal:** Close verified audit defects before customer proof testing.

**Architecture:** Harden existing service boundaries and preserve the canonical pipeline. Gate incomplete collaboration at the server; migration deployment and local checks are not acceptance evidence.

**Tech stack:** Next.js, TypeScript, Supabase PostgreSQL and Edge Functions.

## Execution order and acceptance

- [ ] Ingestion: reject user-controlled reprocessing at the Edge boundary; require approved state for initial processing and trusted claimed state for reprocessing; enforce quota before extraction; remove extracted content from diagnostics. Test denied states and safe diagnostics.
- [ ] Delegation: bind retries to actor/workflow/folder, verify actual folder ownership, redact duplicate metadata, record result identifiers, recheck permissions on each request. Keep incomplete collaboration disabled by default on API and MCP.
- [ ] Membership: require acceptance, reject paused organizations, support reinvitation without restoring previous acceptance, verify administrative rights inside seat transactions, preserve audit evidence. Test pending, removed, expired and concurrent requests.
- [ ] Workflow readiness: keep organization-owned ingestion/output disabled until actual organization ownership exists. Existing tables are foundations, not a completed organization product. Do not enable rollout based on compilation alone.
- [ ] Billing: atomically commit database-local effects with their delivery marker; verify every write and preserve idempotence of individual effects. Test failure after claim and duplicate delivery. A lease/saga is only needed if future effects leave the database transaction.
- [ ] Outputs/costs: bounded paginated reads with count verification; correct status/plan classification and annual monthly equivalent; show missing cost coverage and distinguish receipts from estimates. Test page caps, empty periods and actual entitlement shapes.
- [ ] Verification: targeted regressions, type checks, diff review; production migrations/functions only after local verification. Run three app/MCP proof packs and billing sandbox checks before client certification.

## Release boundaries

No UI/pricing redesign, API-key restoration, GraphQL, or native connector expansion. Keep personal workspace ownership intact. Never report unexecuted integration tests as passed. Preserve unrelated working-tree edits.

## Execution evidence — first remediation batch

Implemented locally:

- Edge processing rejects direct user reprocess requests and legacy unscanned uploads. Trusted reprocess requires the app route's claimed `processing` state. Quota claim moved ahead of storage download and paid extraction.
- Removed extracted sample rows and raw AI parse payloads from processing and both normalization handlers' diagnostics.
- Organization resource policy requires a valid, non-future acceptance timestamp. Submission resolver checks actual intake-folder ownership.
- All collaboration HTTP handlers and the shared MCP access resolver are disabled by a hard server release gate. This contains incomplete delegation; it does not complete shared-workspace functionality. No environment override is provided.
- Operational estimates use actual `pro` status and `monthly`/`annual` plans, UTC month boundaries, empty-month rows, and count-verified pagination. Responses distinguish incomplete estimated spend from cash receipts and profit.
- Added reusable bounded complete-read helper and server-cap regression cases. This helper is not yet wired into report reads and does not provide a transaction snapshot.

Verification: 27 targeted scripts passed; application TypeScript check and diff whitespace check passed. These include policy/structural wiring tests, not live Edge, database concurrency, or billing tests.

Still required: delegated batch scope and redaction; atomic membership administration/reinvitation and audit enforcement; recoverable billing webhook effects; report-read pagination; cost endpoint integration/financial reconciliation tests; production deployment and three full app/MCP proof packs. No new migration or function deployment was performed for this batch. Do not certify customer readiness or reopen collaboration from these local results.

## Execution evidence — second remediation batch

Implemented locally:

- Creem uses a single database RPC for effects and the event receipt. An injected failure after the subscription write rolls back both; retry succeeds. Separate effect identities prevent duplicate gifts/firm orders and repeated subscription counters. Active/paid events no longer erase the checkout order. Gift inserts now provide the required 24-hour duration. Unknown payment products and unmatched refunds fail instead of acknowledging a nonexistent effect.
- Chose a database transaction rather than a lease: current payment effects are entirely database-local, so no partially committed workflow needs resuming. Never move an external API/email side effect inside this claim without designing its own delivery semantics.
- Batch claims and status checks bind owner, actor, workflow and folder. Historical unscoped batches stay personal. Intake-file moves cause denial; duplicate responses and persisted messages omit the original private filename. In-app delegated submission uses the same idempotent batch engine, file-size check and fail-closed burst limit. App/MCP audit events include batch and created file IDs.
- Actual PostgreSQL testing discovered that the existing ingest claim CTE returned old status/lease columns despite assigning a new lease. A corrective migration returns the updated columns from the CTE's RETURNING result. Compare-and-set item writes also verify a matching lease row was updated.
- Membership invitation, acceptance and removal run under the organization lock with accepted active admin checks. Removed members can be reinvited without old acceptance/evidence/export permissions. Invitations expire after seven days; expired invitations reserve their seat until removed. Audit insertion is in the same transaction. Service-role audit access is read/append only; old actor-less seat RPC execution is revoked.
- Report records, attributes, datasets, dataset rows/columns, source files and folder context now use bounded count-checked pagination and deterministic ordering. Over-limit sources fail instead of silently producing partial totals. Count checking is not a database snapshot and does not prove concurrent-edit consistency.

Validation: **31 TypeScript test scripts passed**, application TypeScript compilation and whitespace checks passed. **Three additional isolated PostgreSQL/PGlite suites passed**: payment transaction rollback/retry/duplicates/ACLs; batch scope/legacy isolation/returned leases; membership lifecycle/audit rollback/ACLs. The report-loader test uses the real Supabase query builder against a fake 100-row-cap transport and verifies 1,105 rows, attributes and folders. The webhook route test exercises signature rejection, database failure, retry and duplicate acknowledgement without provider traffic. PGlite is installed only in a disposable temp directory, not added to app dependencies.

### Deployment order — not executed

1. Review/apply the four new migrations in order: `20260912130000_atomic_creem_effects`, `20260912133000_ingest_batch_scope`, `20260912134000_ingest_claim_returned_lease`, `20260912140000_atomic_membership_administration`.
2. Deploy the app only after those RPCs exist. Keep collaboration hard-gated; the old actor-less seat RPCs are intentionally unavailable after migration.
3. Deploy `process-document`, `normalize-document`, and `reprocess-documents` with `--no-verify-jwt` and verify in-function authentication and the processing chain.
4. Run actual Creem sandbox event sequences and all three app/MCP proof packs. Validate deployed function grants and production schema separately; the isolated tests use baseline table shapes, not a clone of production.

### Still open before certification

- Live parallel-session/concurrent claim tests, permission revocation during uploads, and whole-request upload memory limits (the current multipart size check occurs after form parsing).
- Organization creation/owner lifecycle, target/dependency validation and organization-owned ingestion/reporting remain unfinished. Do not reopen sharing merely because these RPCs pass.
- Reconcile historical webhook markers/counters against Creem: old receipt rows may represent earlier partial effects. No historical receipts were deleted or guessed to be successful. Test out-of-order events, renewal-order matching, cancellation timing, partial refunds, and gift/firm refund handling; unmatched refunds deliberately retry for reconciliation rather than falsely revoke unrelated access.
- Cost endpoint integration, invoice/cash reconciliation, report behavior during concurrent data changes, backup/restore and full production security/functional proof remain outstanding.

No production migration, function deployment, commit or push was performed in this batch. Existing unrelated app/docs/Smart Security changes were preserved.

## Production migration deployment and third local batch — 2026-09-12

**Current deployment state supersedes the earlier batch snapshots above.**

- Linked project: `njbxbltgtxvhmcctdluz`.
- `supabase migration list` initially showed precisely the four remediation migrations pending.
- `supabase db push --dry-run` confirmed only those four targets.
- Authorized `supabase db push --yes` applied `20260912130000`, `20260912133000`, `20260912134000`, and `20260912140000` successfully.
- Post-deployment `supabase migration list` confirms local/remote parity through `20260912140000`.
- No tables or customer data were deleted. The membership migration gives pending legacy invitations a seven-day expiry and revokes the old actor-less seat RPCs as designed.
- This verifies deployment history, not a fresh production ACL query or an end-to-end payment/upload run. The existing ingest-claim function correction is live; new app-specific RPCs are available but the revised app has not been deployed from this worktree.

Further local implementation:

- Added a streamed 91 MiB total-body limit **before** multipart parsing for delegated submissions (six 15 MiB files plus envelope allowance). Requests with missing or false Content-Length are also bounded and oversized streams are cancelled. Existing per-file limits and the sharing release gate remain intact. Hosting-provider body limits may be lower; this is an application safety ceiling, not a promise of supported deployment upload size.
- Added actual cost-route tests through a fake capped transport: unauthorized/non-operator denial, 1,105 AI events, monthly/annual revenue estimates, unknown plans, uncertain cost coverage, empty months and fail-closed incomplete reads. Extracted UTC reporting-window calculation for explicit month-end/year-boundary tests.
- Multipart fixture testing independently reproduced a Node 25 generated-FormData cancellation error; tests now use serialized inbound bytes and a controlled chunked stream rather than that outgoing-body generator.

Validation: **33 targeted TypeScript scripts passed**, application type-check and whitespace check passed; three isolated PostgreSQL transaction suites were rerun. These are not production concurrency or provider sandbox tests.

Next: deploy the reviewed app and the three changed Edge Functions separately, then verify live RPC grants, real Creem event semantics/order/refunds, and the three app/MCP proof packs. Organization ownership/creation lifecycle, concurrent permission changes and financial reconciliation remain open. Sharing stays disabled. No app deployment, Edge Function deployment, commit or push occurred during this migration deployment turn.

## App build and production smoke — 2026-09-12

- Application production build completed successfully with Next.js 16.2.4. It compiled, type-checked, generated all 113 static pages, and included the remediation routes.
- Read-only smoke checks: `https://www.avintph.com/` returned HTTP 200; `/api/mcp` returned the expected HTTP 401 and OAuth resource challenge without a token; `/api/health` returned HTTP 200 with its current degraded provider summary. No authenticated customer data was accessed.
- The checkout webhook and application routes are not live until the focused app commit reaches the connected Vercel deployment. Edge Functions and database migrations are already live.
