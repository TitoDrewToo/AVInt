# Studio Workspace Catalogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add an authenticated internal Studio Workspace under `/systems` for cataloguing reusable UI/UX, layouts, motion, backgrounds, and environments.

**Architecture:** Keep `/systems` as the existing operations hub and add a prominent workspace entrance. Use a protected nested route with a shared shell and a data-driven section catalogue so empty sections can become real prototypes without redesigning navigation.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, existing Supabase session/access check, existing AVIntelligence design tokens and glass surfaces.

---

### Task 1: Add the protected Studio Workspace shell

**Files:**
- Create: `components/studio-workspace-gate.tsx`
- Create: `components/studio-workspace-shell.tsx`
- Create: `app/systems/studio/layout.tsx`

- [ ] Add the same `/api/systems/access` authorization check used by `/systems`, redirecting denied users to `/`.
- [ ] Add workspace navigation for Overview, UI/UX, Layouts, Motion, Backgrounds, and Environments.
- [ ] Use the existing Navbar and AVIntelligence glass/retro tokens.

### Task 2: Add the catalogue overview and empty section pages

**Files:**
- Create: `app/systems/studio/page.tsx`
- Create: `app/systems/studio/[section]/page.tsx`
- Create: `components/studio-catalog-section.tsx`

- [ ] Add a data-driven section registry with descriptions, status, and empty-state guidance.
- [ ] Add Overview cards that explain the reuse model and link to each section.
- [ ] Add empty catalogue states that are visibly intentional and ready for future prototypes.

### Task 3: Add the Studio Workspace entrance from Systems

**Files:**
- Modify: `app/systems/page.tsx`

- [ ] Add a prominent Studio Workspace card beside the existing Systems hub heading.
- [ ] Link to `/systems/studio` without changing the existing operations tabs or data behavior.

### Task 4: Verify

- [ ] Run `npx eslint components/studio-workspace-gate.tsx components/studio-workspace-shell.tsx components/studio-catalog-section.tsx app/systems/studio/layout.tsx app/systems/studio/page.tsx 'app/systems/studio/[section]/page.tsx' app/systems/page.tsx`.
- [ ] Run `git diff --check`.
- [ ] Verify the new route files and unchanged systems data flow with `git diff --stat` and `git status --short`.
