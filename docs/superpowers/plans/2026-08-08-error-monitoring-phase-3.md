# Error Monitoring Phase 3 AI Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add cached, admin-triggered AI diagnosis in observation mode without exposing raw documents, PII, or execution controls.

**Architecture:** Diagnosis columns are added to `error_groups`. A Supabase Edge Function is the only Anthropic caller and reads `ANTHROPIC_SYSTEMS_API_KEY`; it validates service-role requests, parses strict JSON, sanitizes input again, and writes diagnosis fields with service role. A server action checks the Phase 2 allowlist, loads recent events plus the matching `docs/System_Journal.md` section, rate-limits and caches diagnosis requests, then invokes the Edge Function. The existing `/systems` page displays diagnosis and records only review verdicts.

**Tech Stack:** Supabase PostgreSQL/RLS, Deno Edge Function, Anthropic Messages API, Next.js server action, React client page.

---

### Task 1: Add diagnosis storage and journal extraction

**Files:**
- Create: `supabase/migrations/20260808_error_monitoring_diagnosis.sql`
- Create: `lib/system-journal.ts`
- Test: `scripts/test-system-diagnosis.ts`

- [ ] Add nullable diagnosis/review columns and checks to `error_groups`; preserve existing admin-only RLS and service-role-only writes.
- [ ] Read `docs/System_Journal.md` server-side and select the section matching a normalized tool key, falling back to GLOBAL without including unrelated sections.
- [ ] Test tool-key matches, GLOBAL fallback, and diagnosis field validation helpers.
- [ ] Commit as `error-monitoring: add diagnosis storage and journal routing`; note that the migration must be applied to Supabase.

### Task 2: Add the Anthropic-only diagnosis Edge Function

**Files:**
- Create: `supabase/functions/diagnose-error/index.ts`
- Modify: `supabase/config.toml`

- [ ] Require an exact service-role Authorization token inside the function; reject browser/anon requests.
- [ ] Call Anthropic Messages API only with `ANTHROPIC_SYSTEMS_API_KEY`, model `ANTHROPIC_SYSTEMS_MODEL` or the configured fast default, and strict JSON instructions.
- [ ] Sanitize and bound journal/error input, reject raw document-content keys and email values, validate `{root_cause, affected_area, proposed_fix, risk_level, confidence, severity}`.
- [ ] Update only the diagnosis columns for the requested fingerprint and return the structured result; on provider failure return an error without fallback providers or execution.
- [ ] Add `verify_jwt = false` config and deploy with `supabase functions deploy diagnose-error --no-verify-jwt` after verification.
- [ ] Commit as `error-monitoring: add Anthropic diagnosis function`.

### Task 3: Add gated, cached orchestration and review verdicts

**Files:**
- Modify: `app/systems/actions.ts`
- Modify: `lib/rate-limit.ts`
- Test: `scripts/test-system-diagnosis.ts`

- [ ] Add `diagnoseErrorGroup(fingerprint, force, accessToken)` with server-side admin verification, one-per-group `diagnosed_at` cache, recent-event loading, journal routing, service-role Edge invocation, and rate limiting.
- [ ] Add `setErrorGroupReviewVerdict` with admin verification and only `matched`, `partial`, or `wrong`; write `reviewed_at` and `reviewed_by`.
- [ ] Test idempotent skip behavior and rejection of non-admin diagnosis/verdict requests through pure decision helpers.
- [ ] Commit as `error-monitoring: orchestrate cached diagnosis and review`.

### Task 4: Surface diagnosis in observation mode

**Files:**
- Modify: `app/systems/page.tsx`

- [ ] Load diagnosis columns with each group, add Diagnose/Re-diagnose controls, and show analysis, proposed fix, risk/confidence, and diagnosed time in both UTC and Manila.
- [ ] Add review verdict buttons for admins and show reviewed time/user; keep Action/Execute visibly disabled with observation-mode text.
- [ ] Run diagnosis, monitoring, existing regressions, `git diff --check`, and `npm run build`; commit as `error-monitoring: surface observation-mode AI triage` and push.
