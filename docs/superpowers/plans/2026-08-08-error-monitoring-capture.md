# Error Monitoring Phase 1 Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist sanitized server and browser errors in Supabase with stable fingerprint grouping, without blocking product requests or exposing monitoring data to clients.

**Architecture:** A service-role-only writer inserts `error_events` and atomically upserts `error_groups`. The existing server logging helpers call that writer fire-and-forget with a recursion-safe failure boundary. A public browser endpoint validates and sanitizes client payloads, attaches the authenticated UUID when available, and uses the same writer; a root error boundary and global browser handlers call a client helper.

**Tech Stack:** Next.js App Router, Supabase PostgreSQL/RLS, TypeScript, React error boundary, Supabase service-role client.

---

### Task 1: Add the monitoring schema and RLS boundary

**Files:**
- Create: `supabase/migrations/20260808_error_monitoring.sql`
- Test: `scripts/test-error-monitoring.ts`

- [ ] Add `error_events`, `error_groups`, and `system_admins`; use `occurred_at` as canonical UTC and a generated `occurred_at_manila` conversion.
- [ ] Add `is_system_admin()` as a `security definer` function and RLS policies that allow monitoring reads only to allowlisted admins; grant no client inserts.
- [ ] Add indexes for fingerprint, descending occurrence time, and user UUID; leave an explicit Andrew allowlist insert TODO in the migration.
- [ ] Add executable SQL-independent tests for fingerprint/group helper behavior and the UTC-to-Manila conversion contract.
- [ ] Commit as `error-monitoring: add capture tables and admin RLS` and note that the migration must be applied to Supabase.

### Task 2: Add safe fingerprinting and service-role capture

**Files:**
- Create: `lib/error-fingerprint.ts`
- Create: `lib/error-capture.ts`
- Modify: `lib/api-error.ts`
- Modify: `supabase/functions/_shared/log.ts`
- Modify: `scripts/test-error-monitoring.ts`

- [ ] Normalize tool/function/action/message by replacing UUIDs, numeric runs, and long identifiers before hashing with SHA-256.
- [ ] Implement one service-role writer that inserts an event and performs an atomic `error_groups` upsert using the first message as title, incrementing count and updating last seen.
- [ ] Ensure capture catches every failure internally and never calls `logError`, `serverError`, or another capture function.
- [ ] Call capture after existing console logging without awaiting it from `serverError`, `logApiError`, or `logError`.
- [ ] Test stable fingerprints, normalized IDs/numbers, group count increments, and UTC/Manila conversion.
- [ ] Commit as `error-monitoring: persist server errors and groups`.

### Task 3: Add browser capture and root error handlers

**Files:**
- Create: `app/api/errors/route.ts`
- Create: `lib/client-error-capture.ts`
- Create: `components/error-boundary.tsx`
- Modify: `app/layout.tsx`
- Test: `scripts/test-error-monitoring.ts`

- [ ] Validate endpoint payload size and field lengths; sanitize messages, stacks, routes, action names, and context; remove email-like strings and document-content keys before service-role insertion.
- [ ] Authenticate with the bearer token when present, attach only `user.id`, and permit anonymous capture for public pages.
- [ ] Make browser POST fire-and-forget and swallow network failures.
- [ ] Register root React error boundary plus `window.error` and `unhandledrejection` listeners once, preserving the existing layout children.
- [ ] Test payload normalization and endpoint-safe capture behavior without asserting UI monitoring.
- [ ] Commit as `error-monitoring: capture browser failures safely`.

### Task 4: Verify, review, and push

- [ ] Run `npx tsx scripts/test-error-monitoring.ts`, the existing tax/CSV regressions, `git diff --check`, and `npm run build`.
- [ ] Confirm no monitoring page or client read path was added; all writes remain service-role-only.
- [ ] Push the three commits to `origin/main`.
