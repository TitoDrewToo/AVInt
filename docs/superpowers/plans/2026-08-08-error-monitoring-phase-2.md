# Error Monitoring Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a read-only, allowlist-gated `/systems` page for grouped errors and a server-authorized status triage action.

**Architecture:** Browser reads use the authenticated Supabase client, so the Phase 1 RLS policies remain the read boundary. A small server-only authorization helper validates the bearer token through an anon client with the user's authorization header and checks `system_admins` through RLS; server routes/actions use that check before any response or service-role status update. The account panel performs the same RLS-backed allowlist check before rendering the Systems link.

**Tech Stack:** Next.js App Router, Supabase RLS/service-role client, React client page, server route/action, Tailwind UI primitives.

---

### Task 1: Add server-side system-admin authorization and triage action

**Files:**
- Create: `lib/system-admin.ts`
- Create: `app/api/systems/access/route.ts`
- Create: `app/systems/actions.ts`
- Test: `scripts/test-system-admin.ts`

- [ ] Validate bearer tokens and check `system_admins` through a user-scoped Supabase client so `is_system_admin()` and RLS enforce access.
- [ ] Return only `{ allowed: boolean }` from the access route; reject absent or non-admin tokens without exposing allowlist data.
- [ ] Validate fingerprint and status (`new`, `triaged`, `resolved`, `ignored`) in `updateErrorGroupStatus`, re-check admin access, then update the group with the service-role client.
- [ ] Add pure tests for status validation and rejection of missing/non-admin authorization without creating a monitoring read path.
- [ ] Commit as `error-monitoring: add admin access and triage action`.

### Task 2: Build the grouped monitoring page

**Files:**
- Create: `app/systems/page.tsx`
- Modify: `app/systems/actions.ts`

- [ ] Gate the client shell through the server access route before any error rows are requested; redirect unauthorized visitors away from `/systems`.
- [ ] Read `error_groups` and recent `error_events` with the authenticated Supabase browser client, derive tool/action/route/level metadata from occurrences, and keep groups sorted by `last_seen` descending.
- [ ] Add status/tool/level filters and message search, with group drill-in showing recent events and both UTC plus Asia/Manila times.
- [ ] Leave explicit visual space for Phase 3 AI analysis, proposed fix, risk, and action columns without implementing them.
- [ ] Commit as `error-monitoring: add grouped monitoring page`.

### Task 3: Add allowlist-gated account navigation and verification

**Files:**
- Modify: `components/account-panel.tsx`
- Test: `scripts/test-system-admin.ts`

- [ ] Query the authenticated user's allowlist membership through RLS and render `Systems` only below Sign out for admins.
- [ ] Keep the page, read queries, and status action independently gated so hidden navigation is not a security boundary.
- [ ] Record Phase 2.5 alerting as deferred until Resend is configured; do not add email or AI behavior.
- [ ] Run the system-admin tests, existing regression tests, `git diff --check`, and `npm run build`; commit as `error-monitoring: gate systems navigation to admins` and push.
