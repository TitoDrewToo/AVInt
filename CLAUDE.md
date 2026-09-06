# AVIntelligence Claude Instructions

## Project Context

AVIntelligence is a document-intelligence platform for financial and operational records.

Core product areas:
- Smart Storage: upload receipts, invoices, payslips, contracts, and related documents
- Reports: Tax Bundle Summary, Business Expense Report, P&L, Expense Summary, Income Summary, Contract Summary, Key Terms
- Smart Dashboard: historical analytics, trends, summaries, and advanced visual outputs
- Payments and access: Free, Day Pass, Pro, and gift-code based access
- Stack: Next.js, Supabase, API routes, edge functions, browser and server-side access controls

The product goal is not generic file storage. The service is intended to turn messy business documents into structured outputs that are useful for reporting, review, dashboarding, and operational decisions.

## Working Priorities

Optimize for:
- precision
- correctness
- deep analysis
- defensible recommendations
- thorough execution

Do not optimize for speed at the expense of correctness.
Do not produce shallow answers just to finish quickly.

A slower correct answer is better than a fast incorrect one.

## Governance

Default workflow:
1. study the codebase first
2. validate the issue against the repository
3. analyze root cause
4. prepare a clear action plan
5. wait for approval before material implementation
6. implement only after approval

Material changes require review before execution, especially:
- access control
- subscription or billing logic
- privacy/security fixes
- tax/report logic
- schema or data model changes
- deletion/retention logic
- architecture changes

Do not silently implement material changes without approval.

## Engineering Standards

- Prefer centralized logic over duplicated logic when the behavior must remain consistent.
- Treat access control as real enforcement, not only UI behavior.
- Distinguish clearly between:
  - UI gating
  - page-level gating
  - route/API/server enforcement
- Prefer server-side truth over client-side assumptions.
- When evaluating report logic, do not allow labels or disclaimers to overstate the accuracy of the underlying math.
- If a report is not suitable for accountant-ready or tax-prep use, state that directly.

## Edge Function Deploy Policy — --no-verify-jwt

**All Supabase edge functions in this project are deployed with `--no-verify-jwt`.**
Do not redeploy without this flag. Auth is enforced inside each function, not at the gateway.

Why this exists:
- The project uses the new Supabase asymmetric JWT format (ES256, JWKS-based)
  for user tokens and the new `sb_secret_...` format for service role keys.
  Neither is accepted by the edge gateway's default `verify_jwt` path, which
  expects legacy HS256 JWTs signed with the project JWT secret.
- With the default setting, the gateway returns 401 before the function body
  runs (`execution_id: null` in logs), making every call fail — both
  client-originated (user JWT) and internal chains (service role).
- Disabling gateway verification moves auth into the function where we can
  validate tokens ourselves via `supabaseAdmin.auth.getUser(token)` for user
  calls, and direct comparison against `SUPABASE_SERVICE_ROLE_KEY` for
  service-role-only functions.

Deploy command for every function in this project:

```
supabase functions deploy <function-name> --no-verify-jwt
```

Security model this relies on:
- Every edge function must verify the Authorization header inside its own
  handler before touching data. Missing in-function auth = open endpoint.
- User-facing functions: call `adminClient.auth.getUser(token)` and compare
  `userData.user.id` against resource ownership.
- Service-role-only functions (normalize-document, reprocess-documents):
  reject any token that is not exactly `SUPABASE_SERVICE_ROLE_KEY`.

If any future deploy omits `--no-verify-jwt`, every call to that function
will start returning 401 at the gateway with no function logs to diagnose.
That is the signature of this issue.

### Service role key — the two-key reality (added 2026-05-07)

The Supabase dashboard's API Keys page shows **two distinct service role
keys** in different sections. They are not interchangeable:

- **"Secret keys" section** → new format, prefix `sb_secret_...`, ~41 chars.
  This is what edge functions auto-receive as `SUPABASE_SERVICE_ROLE_KEY`
  env var (derived from `SUPABASE_SECRET_KEYS` dictionary).
- **Legacy section** (labeled `service_role` / `anon` and marked Deprecated)
  → old format, prefix `eyJhbGciOi...`, ~219 chars (HS256 JWT).

For service-role-only functions to accept incoming auth:
- The `Authorization: Bearer ...` header value MUST match the new
  `sb_secret_...` value (what the function compares against).
- `vault.secrets` entries used by `pg_cron` + `pg_net` to invoke these
  functions MUST hold the same `sb_secret_...` value.
- Local `.env.local` `SUPABASE_SERVICE_ROLE_KEY` MUST hold the
  `sb_secret_...` value (NOT the legacy eyJ JWT).
- The legacy `eyJhbGciOi...` value will always fail with
  `"Service role required"` because the function's env var no longer
  matches it.

`SUPABASE_SERVICE_ROLE_KEY` env var name is officially deprecated by
Supabase; the long-term migration is `SUPABASE_SECRET_KEYS` (JSON dict).
The auto-injection still works under the deprecated name for now.

### `supabase/config.toml` gotcha

Every `[functions.<name>]` section in `supabase/config.toml` MUST have
`verify_jwt = false`. The default is `true`, which causes silent
regressions: a function deployed correctly with `--no-verify-jwt` CLI
flag may be reverted on a subsequent deploy if config.toml hasn't
been aligned. Symptom: function starts 401-ing at the gateway with
`"Not a JWT, invalid Base64-URL"` despite no code change. Audit
config.toml on any function that mysteriously starts failing auth.

## Analysis Expectations

When asked to review or assess:
- read `docs/review-scope.md` first
- skip known deferred roadmap items unless new code changes the risk
- inspect the actual repository
- cite relevant files
- separate confirmed facts from inference
- identify agreement/disagreement with prior findings when applicable
- state what remains uncertain

When asked to produce a plan:
- include issue summary
- current implementation shape
- root cause
- recommended approach
- closure criteria
- implementation order

## Collaboration Style

Be direct, specific, and repo-aware.
Do not answer with generic best-practice advice detached from the current codebase.
Do not invent architecture that is not justified by the repository.
If the repository contradicts assumptions, follow the repository.

## Spreadsheet Extraction Architecture

`process-document` uses a deterministic + AI-augmented pattern for
XLSX/CSV inputs (commit `003faac`, May 2026). The earlier all-AI approach
hit 30s timeouts and 8K output token ceilings on row counts >30 — the
deterministic split removed the scaling ceiling.

Flow per spreadsheet upload:

1. **SheetJS** (`xlsx@0.18.5`, imported via `esm.sh` at runtime) extracts
   raw rows from each sheet via `sheet_to_json({ header: 1 })`. No AI
   involvement for row splitting.
2. **One small Gemini call per sheet** maps the sheet's headers to
   canonical field names. Output: `{ mapping, document_type }` JSON.
   Bounded ~2K output tokens; well within all timeouts and budgets.
3. The mapping is **applied deterministically** to every row in the sheet
   to produce `document_fields` rows. No per-row AI call.
4. **Garbage rows filtered**: empty rows, subtotal/total markers,
   month-section headers (e.g. "January 2025"). Symmetric filter on both
   `extractedRows` and `source_rows_json`.
5. **Date and number sanitization**: `safeDate()` and `safeNumber()`
   handle malformed cells (Feb 30, currency symbols, etc.). Bad values
   become `null` with a `sanitized_fields` entry in the row's `raw_json`.
   One bad date in a 200-row file does NOT kill the batch INSERT.
6. **Source rows preserved** in `files.source_rows_json` for the Reclassify
   Sheet modal's per-row popover.

Custom workbook columns that don't map to canonical fields are preserved
in `document_fields.raw_json.custom_fields` as a JSON dict, not lost.

## Failure Visibility (Observability-First)

Every catch boundary must surface the actual error, not generic
placeholders. Today's session burned hours on multiple "Something went
wrong" cases that hid the real cause — never repeat:

- **No generic catches.** Edge functions return
  `{ error: <actual message>, stage: <where it failed> }`. Logged in
  structured form via `logEvent`/`logError` in `_shared/log.ts`.
- **Toaster mounted globally** in `app/layout.tsx` so destructive errors
  surface in user-facing UI rather than silently failing.
- **Structured logging at every transition** — function entry, AI call,
  DB write, response return. Stage names distinct enough to grep.
- **Service-role auth checks** must log expected vs received key prefix
  (length + first 12 chars only — never full secrets) on rejection. Helps
  diagnose env/vault drift in seconds rather than hours.
- **Save handler patterns** (e.g., Reclassify Sheet modal): every
  `.update()` checks the error AND verifies `rowsAffected` matches expected
  count. Throws on mismatch with a specific message.
- **Field name aliases** map AI shorthand to canonical column names
  defensively. Inference logic must NOT vacuously match against missing
  columns or empty values.

Sentry/Logflare aggregation is queued. Until shipped, structured logs +
visible error toasts are the floor — they were the difference between
debugging in seconds (post-instrumentation) vs. hours (pre-).

## CLAUDE.md Maintenance

Claude (or any AI assistant working in this repo) is permitted to update
CLAUDE.md when material discoveries warrant clarifying operational
reality. Conditions:

- The change captures a pattern, gotcha, or convention that affects future
  work — not session-specific minutiae.
- Brief commit message noting what was added and why.
- Don't bloat. Small, dense, additive sections only.
- Opinionated/strategic changes get surfaced for user review first;
  factual operational reality (like the two-key gotcha) can be added
  directly.

This keeps CLAUDE.md a living source-of-truth, not a stale snapshot.

## Function Grants

PostgreSQL grants `EXECUTE` on newly created functions to `PUBLIC` by default.
The project-level default-privilege change removes Supabase's explicit grants to
`anon` and `authenticated`, but it cannot remove PostgreSQL's hard-wired
`PUBLIC` default.

Every migration that creates or replaces a function in `public` must therefore:

1. use the exact function signature in an explicit `REVOKE ... FROM PUBLIC, anon, authenticated`;
2. grant `EXECUTE` only to the roles that invoke it; and
3. update `test/function_grant_contract.sql` when a browser-executable
   `SECURITY DEFINER` function is intentionally introduced.

`public.is_system_admin()` is the current reviewed exception. Authenticated
execution is required because three RLS policies call it. Do not revoke it or
expand the allowlist without checking the live `pg_proc.proacl`, `pg_policies`,
and every dependent policy.

Function and policy names are not evidence of effective access. Read function
ACLs from `pg_proc.proacl`; a null ACL still inherits PostgreSQL's `PUBLIC`
default. Read policy roles and expressions from `pg_policies`; permissive
policies are combined with OR, so the broadest matching policy wins.
