# Error Monitoring and Maintenance Workflow

**Goal:** Give AVIntelligence a repeatable CLI-first workflow for finding user-visible errors, diagnosing root cause, documenting recurring issues, and turning fixes into prevention loops.

**Current posture:** The project already emits structured JSON errors from selected Next.js API routes through `lib/api-error.ts`, structured Supabase Edge Function logs through `supabase/functions/_shared/log.ts`, health status through `/api/health`, Smart Security integrity status through `/api/smart-security/health`, and maintenance jobs for stuck Smart Storage processing. This workflow coordinates those pieces until a dedicated `pnpm ops:*` CLI exists.

## When To Run

Run this workflow in these cases:

- A user reports a failed upload, checkout, report, dashboard, login, deletion, or webhook-driven action.
- The owner status indicator shows degraded infrastructure.
- Supabase `processing_jobs` rows remain failed or stuck after the existing cron sweep/reprocess cycle.
- A deployment changed API routes, Supabase functions, payment flows, document processing, report generation, or auth behavior.
- Weekly maintenance review, even if no user complained.

## Severity

Use the highest matching severity.

| Severity | Meaning | Examples | Response |
| --- | --- | --- | --- |
| P0 | Active data loss, security exposure, payment corruption, or broad outage | files deleted incorrectly, webhook granting wrong access, auth bypass, all uploads failing | Stop shipping, preserve logs, fix or rollback immediately |
| P1 | User cannot complete a paid/core workflow | checkout fails, upload stuck, reports 500 for many users, account deletion broken | Same day fix or mitigation |
| P2 | Feature failure with workaround or limited scope | one report type fails, one provider fallback path is noisy, analytics generation fails for some files | Schedule fix, document recurrence |
| P3 | Noise, transient provider issue, non-user-visible maintenance item | one-off provider timeout, health status unknown, isolated retry success | Track only if recurring |

## Required Inputs

For a user-reported issue, collect:

- User email or user id.
- Approximate time window with timezone.
- Action attempted.
- File name or file id when the issue involves Smart Storage.
- Browser-visible message or screenshot if available.
- Whether retry succeeded.

For proactive maintenance, choose a date window:

- Daily quick check: last 24 hours.
- Post-deploy check: deployment time through now.
- Weekly review: last 7 days.
- Incident review: 30 minutes before first report through 30 minutes after mitigation.

## Date Window Rules

Always record windows in ISO-like form with timezone:

```text
from: 2026-05-31 09:00 Asia/Manila
to:   2026-05-31 12:00 Asia/Manila
```

When querying tools that require UTC, convert explicitly and record both:

```text
local: 2026-05-31 09:00-12:00 Asia/Manila
utc:   2026-05-31 01:00-04:00 UTC
```

## Evidence Sources

Use these sources in this order.

### 1. App Health

Check provider health first so you do not misdiagnose an upstream outage as an app regression.

```bash
curl -sS "$NEXT_PUBLIC_APP_URL/api/health"
curl -sS "$NEXT_PUBLIC_APP_URL/api/smart-security/health"
```

Record:

- overall status
- provider statuses
- Smart Security status
- whether the health check itself fails

### 2. Vercel Runtime Logs

Use Vercel logs for Next.js route handlers, middleware/proxy failures, and frontend/server runtime errors.

```bash
vercel logs "$NEXT_PUBLIC_APP_URL" --since 24h
```

Search for:

- JSON log lines with `level:"error"`
- route names from `lib/api-error.ts`
- raw `console.error` messages
- `500`, `Unhandled`, `TypeError`, `ReferenceError`, `Supabase`, `Creem`, `Smart Security`

Important user-facing routes:

- `/api/creem/checkout`
- `/api/webhooks/creem`
- `/api/chat`
- `/api/reports/[report]`
- `/api/report-assumptions`
- `/api/delete-file`
- `/api/delete-account`
- `/api/redeem-gift`
- `/api/fx/rates`

### 3. Supabase Edge Function Logs

Use Supabase logs for document processing, normalization, analytics, reprocessing, and prescan failures.

```bash
supabase functions logs process-document --since 24h
supabase functions logs normalize-document --since 24h
supabase functions logs prescan-document --since 24h
supabase functions logs reprocess-documents --since 24h
supabase functions logs analyze-spreadsheet --since 24h
supabase functions logs generate-advanced-analytics --since 24h
supabase functions logs generate-context-summary --since 24h
supabase functions logs generate-rd-analytics --since 24h
```

Search for:

- `level:"error"`
- `stage`
- `fn`
- `file_id`
- `job_id`
- provider failures
- timeout messages
- JSON parse/validation failures
- failed status updates

### 4. Processing Job State

Use database state to connect logs to what the user experienced.

Run in Supabase SQL editor or equivalent service-role SQL shell:

```sql
select
  id,
  file_id,
  user_id,
  status,
  error_message,
  created_at,
  completed_at
from processing_jobs
where created_at >= now() - interval '24 hours'
order by created_at desc;
```

For one user:

```sql
select
  id,
  file_id,
  user_id,
  status,
  error_message,
  created_at,
  completed_at
from processing_jobs
where user_id = '<user_id>'
  and created_at between '<from_utc>' and '<to_utc>'
order by created_at desc;
```

Classify job states:

- `completed`: user issue may be frontend display, report query, or stale UI state.
- `failed` with error: use `error_message` plus function logs for root cause.
- `uploaded` or `processing` older than 30 minutes: cron sweep failed, cron disabled, or row not matching sweep conditions.
- repeated failed rows for same file: reprocessor cannot recover without code/data fix.

### 5. User-Facing Reproduction

If the issue is current and safe to reproduce, use the same flow the user took:

- login state
- upload type
- selected report
- folder/filter/date range
- checkout product
- account action

Record:

- URL
- action sequence
- expected behavior
- actual behavior
- browser-visible message
- whether the backend logs correlate with the same timestamp

## Triage Procedure

Follow this sequence.

1. Define the investigation window.
2. Check `/api/health` and `/api/smart-security/health`.
3. Pull Vercel logs for the window.
4. Pull Supabase function logs for the window.
5. Query `processing_jobs` for the window and affected user.
6. Group errors by stable signature:
   - `route` or `fn`
   - `stage`
   - normalized message
   - file id or user id if relevant
7. Pick the highest severity group.
8. Determine whether the user actually experienced the grouped error.
9. Diagnose root cause.
10. Apply mitigation or fix.
11. Record the issue using the template below.
12. Add a prevention action if the same signature has happened before or could silently recur.

## Error Signature Format

Use this format when documenting recurring issues:

```text
<surface>:<operation>:<stage>:<normalized_message_hash>
```

Examples:

```text
api:creem_checkout:unhandled:fetch_failed
edge:normalize_document:provider_failed:anthropic_timeout
edge:process_document:insert_result:duplicate_key
db:processing_jobs:sweep:stuck_over_30m
ui:smart_storage:upload:prescan_fetch_error
```

Normalization rules:

- Remove file ids, job ids, user ids, request ids, and timestamps from the message.
- Keep provider name, route, function, stage, status code, and database constraint names.
- If a stack trace exists, classify by the top app-owned frame.

## Issue Record Template

Create one file per meaningful issue:

```text
docs/ops/issues/YYYY-MM-DD-<short-slug>.md
```

Use this structure:

```markdown
# <Short Issue Title>

**Status:** investigating | mitigated | fixed | monitoring | closed
**Severity:** P0 | P1 | P2 | P3
**First seen:** 2026-05-31 09:20 Asia/Manila
**Last seen:** 2026-05-31 10:05 Asia/Manila
**Date window reviewed:** 2026-05-31 09:00-10:30 Asia/Manila / 2026-05-31 01:00-02:30 UTC
**User impact:** <who was affected and what they experienced>
**Signature:** <surface:operation:stage:normalized_message_hash>
**Owner:** AVIntelligence

## Symptoms

- <browser-visible error or user report>
- <failed route/function/job state>

## Evidence

- Vercel logs: <route/stage/message/count>
- Supabase logs: <fn/stage/message/count>
- Database rows: <job ids/file ids/statuses, without secrets>
- Health status: <provider status>

## Diagnosis

<Root cause in one or two paragraphs. State whether this was app code, data shape, provider outage, configuration, cron, or user input.>

## Resolution

- <mitigation or code fix>
- <deployment or manual action>
- <verification result>

## Prevention

- <test to add>
- <structured log to add>
- <health check to add>
- <retry/dead-letter behavior to add>
- <runbook update>

## Recurrence

- Prior matching issues: <links or "none">
- Recurrence threshold: <for example, 3 times in 7 days or any P1 repeat>
- Next action if repeated: <specific fix or escalation>
```

## Recurrence and Prevention Loop

For every issue, decide one of these outcomes:

- **One-off external:** Provider outage or transient network issue. Keep existing fallback/retry if user impact was low.
- **Known noisy:** Add log filtering or downgrade severity only after proving no user-visible impact.
- **Recoverable app failure:** Add retry, backoff, timeout, or reprocessor coverage.
- **User-visible app bug:** Add a regression test and fix the code path.
- **Silent data failure:** Add database state check, health metric, or maintenance query.
- **Security/payment/account issue:** Add explicit audit logging and a post-fix verification checklist.

Recurring issue thresholds:

- Any P0 repeat: immediate root-cause fix before new feature work.
- Any P1 repeat within 30 days: convert to tracked engineering task.
- Same P2 signature 3 times in 7 days: add prevention work.
- Same P3 signature 5 times in 30 days: either suppress intentionally or fix source noise.

## Daily Quick Check

Use this for a 10-minute health pass.

1. Set window: last 24 hours.
2. Check `/api/health`.
3. Check recent `processing_jobs` failures.
4. Pull Vercel logs and count structured `level:"error"` by route/stage.
5. Pull Supabase logs and count `level:"error"` by fn/stage.
6. Create issue records only for P0-P2 or recurring P3 signatures.
7. Close with one line:

```text
Ops check YYYY-MM-DD: <no user-visible issues | N issues opened>, highest severity <Px>, next action <action>.
```

## Post-Deploy Check

Use this immediately after a deploy involving app routes, functions, database migrations, auth, payments, or document processing.

1. Set window from deploy start to now.
2. Check `/api/health`.
3. Smoke test:
   - home page loads
   - login/session still works
   - Smart Storage page loads
   - one report endpoint works for a known test user if available
   - checkout route returns expected validation for invalid product without 500
4. Pull Vercel logs for the deploy window.
5. Pull Supabase logs for changed functions.
6. Query failed or stuck processing jobs.
7. If errors match changed code, fix before continuing feature work.

## AI-Assisted Diagnosis Prompt

Paste this into Codex or Claude with the collected evidence:

```text
We are triaging AVIntelligence production errors.

Window:
- Local:
- UTC:

User impact:
- User:
- Action:
- Browser-visible result:
- Retry result:

Health:
<paste /api/health and /api/smart-security/health summaries>

Vercel grouped errors:
<route, stage, message, count, first seen, last seen>

Supabase grouped errors:
<fn, stage, message, count, file_id/job_id if relevant>

Database state:
<processing_jobs rows or summary>

Please:
1. Identify the most likely root cause.
2. Separate user-visible errors from background noise.
3. Assign P0/P1/P2/P3 severity.
4. Recommend immediate mitigation.
5. Recommend prevention work.
6. Draft or update the issue record in docs/ops/issues.
```

## Future CLI Automation

The manual workflow should later become:

```bash
pnpm ops:health
pnpm ops:errors --from "2026-05-31 09:00 Asia/Manila" --to "2026-05-31 12:00 Asia/Manila"
pnpm ops:triage --from "2026-05-31 09:00 Asia/Manila" --to "2026-05-31 12:00 Asia/Manila"
pnpm ops:issue --signature "edge:normalize_document:provider_failed:anthropic_timeout"
pnpm ops:maintenance --since 24h
```

Target outputs:

- `reports/ops/YYYY-MM-DD-health.json`
- `reports/ops/YYYY-MM-DD-errors.jsonl`
- `reports/ops/YYYY-MM-DD-triage.md`
- `docs/ops/issues/YYYY-MM-DD-<short-slug>.md`

Do not build a dashboard until the CLI workflow has produced useful reports for at least two real incidents or two weekly reviews.

