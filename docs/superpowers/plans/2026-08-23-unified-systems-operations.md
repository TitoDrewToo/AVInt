# Unified Systems Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline execution with task-by-task verification.

**Goal:** Make `/systems` one routed operations surface with a shared shell, protected internal sections, public status/changelog pages, and a scannable internal hub.

**Architecture:** `OperationsShell` owns the common navbar, header, footer, and split public/internal navigation. `SystemsInternalGate` owns the existing `/api/systems/access` browser gate for internal routes. The existing error console is extracted without changing its data/actions, while the new hub aggregates current status, changelog, error groups, and inquiry counts through a protected server route.

**Tech Stack:** Next.js App Router, React, Supabase, existing systems access API, existing glass/cw/retro design utilities.

---

### Task 1: Establish shared shell and access primitives

**Files:**
- Modify: `components/systems/operations-shell.tsx`
- Create: `components/systems/systems-navigation.tsx`
- Create: `components/systems/systems-access.tsx`

- [x] Expand the active section union to `overview`, `errors`, `inquiries`, `studio`, `status`, and `changelog`.
- [x] Render public destinations for everyone and internal destinations only after the existing access endpoint authorizes the session.
- [x] Reuse `glass-surface`, `cw-button-flow`, retro tokens, and the documented hover palette.

### Task 2: Route the consoles without changing their operations

**Files:**
- Create: `app/systems/errors/page.tsx`
- Create: `app/systems/inquiries/page.tsx`
- Create: `components/systems/error-triage-console.tsx`
- Modify: `app/systems/inquiries-console.tsx`

- [x] Move the existing triage console into its own component and remove only the obsolete tabs/chrome.
- [x] Keep its Supabase queries, diagnosis action, verdict recording, action recording, and lifecycle controls unchanged.
- [x] Render both consoles inside the shared shell and internal access gate.

### Task 3: Make Studio a shared-shell section

**Files:**
- Modify: `app/systems/studio/layout.tsx`
- Delete: `components/studio-workspace-gate.tsx`
- Delete: `components/studio-workspace-shell.tsx`

- [x] Wrap Studio routes with `SystemsInternalGate` and `OperationsShell`.
- [x] Retire the former Studio shell after confirming no imports remain.

### Task 4: Build the internal hub

**Files:**
- Modify: `app/systems/page.tsx`
- Create: `components/systems/systems-overview.tsx`
- Create: `app/api/systems/overview/route.ts`

- [x] Replace tab state with a protected `/systems` overview.
- [x] Aggregate status/deploy, latest conventional changelog entry, open error groups by severity, and unread inquiries.
- [x] Make each overview card a route link.

### Task 5: Verify routes and behavior

- [x] Run targeted ESLint, `git diff --check`, and `pnpm build`.
- [ ] Confirm signed-out public status/changelog render, while `/systems`, `/systems/errors`, `/systems/inquiries`, and `/systems/studio` redirect.
- [ ] Confirm the triage actions continue to diagnose, record verdicts, and update status in the protected console.
