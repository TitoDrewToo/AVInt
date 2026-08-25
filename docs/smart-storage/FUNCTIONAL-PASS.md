# Smart Storage functional pass

Date: 2026-08-25

Scope: read-only code and configuration audit for the Smart Storage ingestion path through the dashboard and reports. No application or database fixes were made.

## Verification boundary

The live Supabase project could not be reached from this environment. The configured hostname failed DNS resolution with `ENOTFOUND`, and `supabase status` could only report that local Docker was unavailable. Therefore live table columns, row counts, storage objects, applied migration history, and live function deployment state remain **UNVERIFIABLE**. RLS coverage and the zero-policy table list below were confirmed separately by the owner. I did not retry through network probing or escalate permissions.

## 1. Upload — BROKEN / partially works

Code evidence:

- `app/tools/smart-storage/page.tsx:2061` accepts PDF, JPEG, PNG, WebP, HEIC, CSV, and XLSX in the browser input.
- `lib/smart-storage.ts:77-89` defines the same MIME/extension allowlist and a 60 MB limit.
- `app/tools/smart-storage/page.tsx:906-915` silently skips unsupported or over-quota files during the preflight pass; `:964-977` logs unsupported/oversized files to the console rather than presenting a per-file rejection to the user.
- `app/tools/smart-storage/page.tsx:985-1005` uploads to the `documents` bucket at `<user id>/_inbox/<uuid>.<extension>`, then inserts the `files` row and `processing_jobs` row.
- `supabase/migrations/20260415_phase_b_upload_gate.sql:40-75` documents the intended bucket limit and `_inbox`/canonical storage boundary.
- `lib/smart-storage-ingest.ts:9-27` uses a separate MCP limit of 15 MB and uploads to the same `documents/<user id>/_inbox/` prefix.

The browser path has the intended 60 MB boundary, but the MCP ingestion path rejects files above 15 MB. Unsupported/oversized browser files are not surfaced clearly to the user. The actual live bucket limit and object state are unverified.

## 2. Extraction — WORKS in code; live execution UNVERIFIABLE

Code evidence:

- `app/tools/smart-storage/page.tsx:1015-1029` calls `prescan-document` with the signed-in user token.
- `supabase/functions/prescan-document/index.ts:577-605` performs the AI safety pass for non-spreadsheets, using the configured provider chain; spreadsheet files use deterministic structural checks.
- `supabase/functions/prescan-document/index.ts:607-631` moves approved files from `_inbox` to the canonical user prefix and chains `process-document` using the service key.
- `supabase/functions/process-document/index.ts:675-745` calls Gemini 2.5 Flash or OpenAI `gpt-4o-mini`, each with a 60-second timeout (`:694-695`, `:732-733`).
- `supabase/functions/process-document/index.ts:748-767` retries provider failures according to `PROCESS_PROVIDERS`; parse failures are included in provider-failure matching by `supabase/functions/_shared/ai-providers.ts:34-46`.
- `supabase/functions/process-document/index.ts:980-991` rejects malformed/no-row extraction output; `:1109-1125` marks the processing job failed and returns an error response.
- Every function block in `supabase/config.toml:2-73` has `verify_jwt = false` where configured. Repository policy requires deployment with `--no-verify-jwt` (`docs/Days_1-3_Build_Brief.md:36`, `docs/System_Journal.md:9`), but the currently deployed function configuration could not be verified.

The code has explicit timeout, provider-failure, malformed-output, and terminal-job paths. Whether the deployed functions match this source and whether provider calls succeed is unverified.

## 3. Persistence — BROKEN / live schema unverified

Code writes:

- Browser upload: `files` and `processing_jobs` at `app/tools/smart-storage/page.tsx:993-1013`.
- MCP upload: `files` and `processing_jobs` at `lib/smart-storage-ingest.ts:31-35`.
- Extraction: `document_fields` at `supabase/functions/process-document/index.ts:997-1051`.
- File state: `files.document_type`, `normalization_batch_id`, and `upload_status` at `supabase/functions/process-document/index.ts:1053-1066`.
- Normalization: `supabase/functions/process-document/index.ts:1068-1103` invokes `normalize-document`, which updates the extracted rows.

The repository migration history contains alterations to `files` and `document_fields`, but no base `CREATE TABLE files`, `CREATE TABLE document_fields`, or `CREATE TABLE processing_jobs` migration is present in the checked-out migration directory. The live schema and migration ledger could not be inspected, so I cannot safely state which columns exist or whether any migration is unapplied. This is a concrete verification failure, not evidence that the live tables are absent.

The source currently expects, among others, `files.user_id`, `filename`, `storage_path`, `file_type`, `file_size`, `document_type`, `upload_status`, `folder_id`, `source_rows_json`, `normalization_batch_id`; `processing_jobs.file_id`, `status`, `created_at`, `error_message`; and the extracted columns written at `process-document/index.ts:1002-1025`. Live column compatibility is UNVERIFIABLE.

Migration filenames are unique in the checked-out directory by version prefix. Applied-versus-local status could not be checked without the live project.

## 4. Dashboard and reports — WORKS in code; live data/error behavior UNVERIFIABLE

Code evidence:

- `app/tools/smart-dashboard/page.tsx:1631-1658` loads account-owned `files`, then account-linked `document_fields`; it explicitly clears KPI/chart state when there are no files or fields.
- `app/tools/smart-dashboard/page.tsx:1743-1753` reads `context_summaries`; `:1759-1769` reads `advanced_widgets`; both are scoped by `session.user.id`.
- `app/api/reports/[report]/route.ts:22-95` authenticates the bearer token, resolves subscription or firm entitlement, and applies report export limits.
- `app/api/reports/[report]/route.ts:158-179` and subsequent report branches query `document_fields` through user-scoped file IDs; empty report sets return empty arrays, for example `:160-162`.
- `app/tools/smart-storage/reports/expense-summary/page.tsx:81-120` clears loading state and presents a user-facing error if its report request fails.

The code has intentional empty states and explicit error states. Live schema compatibility, representative data, and actual rendered report responses could not be verified.

## 5. Auth and access — WORKS for the confirmed RLS state; client-query check passes

Code-level evidence supports account scoping:

- Browser file reads use `user_id` filters, e.g. `app/tools/smart-storage/page.tsx:541-546`.
- Dashboard reads use `session.user.id`, e.g. `app/tools/smart-dashboard/page.tsx:1631-1635` and `:1718-1722`.
- Report authorization resolves the authenticated user and then uses owned file IDs, `app/api/reports/[report]/route.ts:26-53`, `:160-172`.
- Storage policies in `supabase/migrations/20260415_phase_b_upload_gate.sql:46-75` partition objects by the first path segment matching `auth.uid()` and hide `_inbox`/`_quarantine` from client reads.

The owner confirmed RLS is enabled on all 33 public tables. The seven tables with zero policies are `document_processing_usage`, `report_export_usage`, `rate_limits`, `gift_codes`, `firm_seat_purchases`, `processed_webhook_events`, and `retired_api_keys_20260823`; with RLS enabled and no policies, only service-role access is available. A client-code search found no browser/client queries to any of these seven tables. References are server-side only: usage tables via `app/api/usage/route.ts:30`, webhook/audit tables via `app/api/webhooks/creem/route.ts:125,222`, gift codes via `app/api/redeem-gift/route.ts:48,66` and `app/api/trusted-count/route.ts:22-32`. They therefore do not silently produce empty client results.

Static policy review found intentional `using(true)`/`with check(true)` policies for service-role or public-inquiry flows, including `context_summaries` (`supabase/migrations/20260331_context_summaries.sql:14-21`), `partner_inquiries` (`supabase/migrations/20260818_partner_inquiries.sql:22-33`), and `studio_inquiries` (`supabase/migrations/20260820_studio_inquiries.sql:19-21`). These are not Smart Storage user-data read policies. Per the confirmed live state, the Smart Storage user-data tables are protected by RLS; live row-level ownership behavior and storage object inventory remain unverified.

## 6. Service key — WORKS in source/config; live runtime UNVERIFIABLE

- `.env.local` contains `SUPABASE_SERVICE_ROLE_KEY` using the `sb_secret_` prefix; the value was not printed.
- Repository references are server routes, scripts, and Supabase edge functions. No `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` reference was found.
- `lib/entitlement.ts` explicitly separates client-safe entitlement logic from service-role-bearing modules, and `lib/smart-storage-ingest.ts:1-3,49-50` is server-side code that sends the service key to the internal function chain.

The local configuration and source boundaries match the required format. Production secret format, deployment environment, and client bundle contents cannot be verified without the unavailable live/deployment checks.

## Navigation status and Part B diff

`components/navbar.tsx:149-169` currently renders the logo, optional tool slot, theme toggle, system status indicator, and account button. It has no Products, Tools, Smart Storage, Smart Dashboard, report, or Connect links. The signed-in Account Panel separately contains the conditional Connect link (`components/account-panel.tsx:637-647`), but it is controlled by the MCP client flag and is not a complete tools navigation.

Before this pass, none of the listed Smart Storage or Smart Dashboard routes was reachable from the main navbar by clicking. The Connect route was reachable only through the conditional Account Panel link when its MCP client flag was enabled.

Restored in `components/navbar.tsx`:

- Added a signed-in, active-entitlement-only Tools dropdown on desktop.
- Added the same gated Tools menu on mobile.
- Added Smart Storage and Smart Dashboard links.
- Added all seven report links: Expense Summary, Income Summary, Tax Bundle, Profit & Loss, Contract Summary, Key Terms, and Business Expense.
- Added Connect to Claude when the existing `MCP_CONNECTOR_CLIENT_ENABLED` flag is enabled.
- Switched the navbar gate to the shared `useEntitlement` hook, which preserves subscription gating and includes firm-client entitlements.

Signed-out and inactive accounts see no Tools menu. No new component or dependency was added.

## Unverified items

- Live Supabase DNS/reachability, table schemas, row counts, RLS policies, storage bucket configuration/objects, and auth scoping.
- Applied migration ledger, unapplied migrations, and live duplicate-version collisions.
- Deployed edge-function source/config and actual `--no-verify-jwt` deployment state.
- Real provider calls, extraction success, normalization completion, dashboard/report responses, empty states, and runtime errors.
- Production service-key format and client-bundle secret exclusion.
