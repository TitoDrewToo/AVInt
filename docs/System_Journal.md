# AVIntelligence — System Journal

*Living system-state doc, authored/maintained by Claude. Purpose: give the AI error-triage layer accurate, current context so it can reason about a failure without reading raw source. Sectioned by **tool key** (matches `error_events.tool`) so the triage pulls only the relevant slice. Keep sections dense and factual; update on material changes; append the Changelog.*

---

## GLOBAL — architecture & conventions
- **Stack:** Next.js (App Router, TS, Tailwind) on Vercel · Supabase (Postgres + RLS + Storage + Auth) · Gemini/OpenAI for AI extraction · Creem for payments (Merchant of Record) · Resend planned for email (not yet configured).
- **Security model:** RLS is the boundary. `SUPABASE_SERVICE_ROLE_KEY` (new `sb_secret_…` format) is server-only. Edge functions are deployed with `--no-verify-jwt` and every `[functions.<name>]` in `supabase/config.toml` has `verify_jwt = false`; each function verifies auth *inside* the handler (`adminClient.auth.getUser(token)` for user calls; exact `SERVICE_ROLE_KEY` compare for service-only functions). If a function suddenly 401s at the gateway with `execution_id: null`, a deploy dropped `--no-verify-jwt`/config alignment.
- **Observability:** structured single-line JSON logs via `_shared/log.ts` (edge) and `lib/api-error.ts` (`serverError`) — `fn/stage/event/message/stack`. Every catch surfaces the real error + a `stage`, never a generic placeholder.
- **Common failure signature:** *code deployed before its migration is applied* → RPC signature mismatch (function-not-found) → the calling path errors. Fix = apply the pending `supabase/migrations/*.sql`.

## smart-storage — upload & document processing
- **Purpose:** upload receipts/invoices/payslips/contracts → AI extraction → structured `document_fields`.
- **Flow:** upload to `_inbox/` → **prescan-document** (safety + validity) → **process-document** (extraction) → `files` + `document_fields`. Spreadsheets: SheetJS extracts rows deterministically + **one** Gemini call per sheet maps headers → canonical fields; rows applied deterministically (no per-row AI). Bad dates/numbers → `safeDate`/`safeNumber` → null + `sanitized_fields`; one bad cell must NOT kill the batch insert.
- **Gotchas:** garbage rows (subtotals, month headers) are filtered symmetrically on `extractedRows` and `source_rows_json`; custom columns preserved in `raw_json.custom_fields`. 30s edge timeout + 8K output-token ceiling was the reason spreadsheet extraction is deterministic-split (commit 003faac).

## prescan — file safety gate (prescan-document)
- **Purpose:** reject unsafe/invalid uploads before processing. MIME/extension allowlist → structural parse → AI safety classifier (Gemini/OpenAI) → Smart Security scan (clamav + structural, via `smart-security-runner`).
- **Gotchas:** `analyzePdf` blocks PDFs containing `SUSPICIOUS_PDF_MARKERS`. **`/OpenAction` and `/AA` are containers, usually benign** (a `[page /FitH]` view action from many PDF generators). We fixed this to only reject `/OpenAction`/`/AA` when they reference `/JavaScript`/`/JS`/`/Launch` (commit f33868e). If legit PDFs show as "Blocked", check `scan_reason` — a benign OpenAction false-positive is the classic case. Truly-executable markers (`/JavaScript`,`/JS`,`/Launch`,`/EmbeddedFile`,`/RichMedia`,`/SubmitForm`,`/ImportData`) are still hard-blocked.

## reports — tax bundle & report generator
- **Purpose:** map documented expenses to IRS Schedule C; income partitioning; report generator + CSV exports.
- **Core:** `lib/tax-bundle.ts` (`computeTaxBundle`) is pure/tested (135 tests). Schedule-C net = **business income only** (income_statement docs) − deductible expenses. **Wage income (payslips) is never netted** against Schedule C. Meals (Line 24b) halved (50%). Uncategorized excluded; review-flagged included. `app/api/reports/[report]/route.ts` gates on entitlement + folder targeting (`getFileIds` walks the folder subtree).
- **Gotchas:** report **default year** picks the most-active tax year (not `max(year)`) — a Jan-issued 1099 dated the following year used to hijack the view (fixed). CSV exports: **QuickBooks (`Date,Description,Amount`)** + **Xero (`Date,Amount,Payee,Description`)**, US dates, **expenses NEGATIVE, meals at RAW amount** (not the 50% deductible — bookkeeping uses actual spend). QB/Xero export is gated to Day Pass/Pro/Business.

## billing — entitlement, tiers & usage metering
- **Purpose:** plan access + document/report usage limits.
- **Model:** one `subscriptions` row per user (by email); `computeEntitlement` (`lib/entitlement.ts`) is the single source of truth → `isPro/isDayPass/isGiftCode/business`. Day pass/gift expire on `current_period_end`; Pro/Business webhook-managed. Creem checkout → webhook sets status.
- **Tiers (value-based):** Free 10 docs/mo + 1 report export/mo · Day Pass/Gift 50 docs/24h · Pro 500/mo · Business 2,000/mo (hidden behind `ENABLE_BUSINESS_PLAN`, needs `BUSINESS_CHECKOUT_URL`). Storage GB limits were removed.
- **Metering:** atomic RPCs with `pg_advisory_xact_lock` — `avint_claim_document_processing(...,p_soft_cap boolean)` (6-arg) + `avint_claim_report_export(...)`. **Free/Day Pass = HARD cap** (reject over limit); **Pro/Business = SOFT fair-use** (keep processing, set `fair_use_warning`). Tables `document_processing_usage`, `report_export_usage`.
- **Gotchas:** the 6-arg claim RPC (migration `20260509`) must be applied or the deployed caller fails on signature mismatch → document processing errors. Limits/prices are centralized in the tier policy config.

## dashboard — Smart Dashboard & advanced analytics
- **Purpose:** interactive dashboards + narrated AI insights over `document_fields`. `lib/advanced-analytics-config.ts` (many widgets `status:"planned"`). Reads the same structured data as reports.

## auth — sessions & accounts
- `@supabase/ssr` cookie auth · Google sign-in (`signInWithOAuth`, client id in Supabase dashboard, GCP project `avint-core`). Sign-out clears the httpOnly cookie via a server action. Gift-code redemption + `delete_user_data` RPC exist.

## systems — error monitoring (this feature)
- **Capture:** `lib/error-capture.ts` (`captureServerError` = `void persistErrorEvent(...)`, fire-and-forget, swallows failures, no recursion) + `_shared/error-capture.ts` (edge) + `lib/client-error-capture.ts` (boundary + global handlers) → `app/api/errors` (rate-limited, length-bounded) → `record_error_event` RPC (inserts `error_events`, upserts `error_groups`). `occurred_at` UTC + `occurred_at_manila` (GMT+8 generated col). Admin-only via `is_system_admin()` (`system_admins` allowlist). Page `/systems`, gated, below Sign out. **Phase 3 adds AI triage columns (observation mode; Execute stays disabled).**

---

## CHANGELOG (recent material changes)
- **2026-08-08** — Error monitoring Phases 1–2 (capture + `/systems` page).
- **2026-08-08** — Value-based re-tiering + usage metering (hard Free/Day Pass, soft Pro/Business) + Business tier (hidden).
- **2026-08-07** — QuickBooks/Xero CSV export; Smart Storage repositioning (homepage reverted to brand identity; product copy on `/products/smart-storage`).
- **2026-08-07** — Prescan `/OpenAction` false-positive fix; tax-bundle default-year fix.
- *(Append future material changes, migrations, and newly-learned gotchas here.)*
