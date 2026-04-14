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

## Analysis Expectations

When asked to review or assess:
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
