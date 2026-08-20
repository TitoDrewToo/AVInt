# Google Drive Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a secure Google Drive import path to Smart Storage so selected Drive files enter the existing Smart Security, extraction, normalization, and reporting workflow.

**Architecture:** Keep the existing Google sign-in and Claude/MCP OAuth paths unchanged. Add a separate Google Drive OAuth connection using a narrow Drive scope, store refresh tokens server-side, and expose authenticated server routes for listing selected Drive files and importing them through the existing ingestion landing zone. Add a client modal to the Smart Storage upload control; Drive metadata is recorded on the file row for auditability.

**Tech Stack:** Next.js App Router, React client components, Supabase/Postgres/RLS, Google OAuth 2.0 and Drive REST APIs, existing Smart Storage prescan pipeline.

---

### Task 1: Database and configuration boundary

**Files:**
- Create: `supabase/migrations/20260820_google_drive_connections.sql`
- Create: `lib/google-drive-config.ts`
- Create: `.env.example` additions for Google Drive OAuth values

- [ ] Add a `google_drive_connections` table keyed by `user_id`, containing encrypted-at-rest provider tokens, expiry, Google account subject/email, created/updated timestamps, and RLS policies allowing only the owning user to read or delete their row. Service role may manage tokens.
- [ ] Add a migration to add nullable Drive provenance fields to `files`: `source_provider`, `source_file_id`, `source_url`, `source_modified_at`, with a uniqueness constraint preventing the same Drive file from being imported twice by the same user.
- [ ] Define server-only configuration for `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, and `GOOGLE_DRIVE_REDIRECT_URI`; fail closed when missing.

### Task 2: Drive OAuth and authenticated server routes

**Files:**
- Create: `app/api/integrations/google-drive/connect/route.ts`
- Create: `app/api/integrations/google-drive/callback/route.ts`
- Create: `app/api/integrations/google-drive/status/route.ts`
- Create: `app/api/integrations/google-drive/disconnect/route.ts`
- Create: `app/api/integrations/google-drive/files/route.ts`
- Create: `app/api/integrations/google-drive/import/route.ts`
- Create: `lib/google-drive.ts`

- [ ] Require a signed-in Supabase user on every route; never accept a user ID from the browser.
- [ ] Use the narrowest feasible Drive scope and state it in the consent screen.
- [ ] Protect OAuth state with a signed, short-lived, httpOnly cookie bound to the current user and reject mismatched or expired state.
- [ ] Exchange authorization codes server-side and store refresh tokens only in the server-side connection row; never return tokens to the client or log them.
- [ ] List only files explicitly selected through the Drive picker or a user-provided Drive file ID, validate ownership/access through Drive API, and restrict MIME types and size before download.
- [ ] Download selected files server-side, then call the existing Smart Storage upload/prescan landing-zone logic with Drive provenance fields. Do not duplicate extraction or prescan logic.
- [ ] Return sanitized status messages and file-level import results.

### Task 3: Smart Storage Drive modal

**Files:**
- Create: `components/smart-storage/google-drive-import-modal.tsx`
- Modify: `app/tools/smart-storage/page.tsx`

- [ ] Add `Import from Google Drive` beside the existing upload controls.
- [ ] Modal states: disconnected, connecting, connected/file selection, importing, completed, and error.
- [ ] Show selected filename, MIME type, size, duplicate state, and rejection reason before import.
- [ ] Keep the existing upload path unchanged; on successful import, prepend returned records and refresh processing state using existing helpers.
- [ ] Add accessible labels, keyboard dismissal, focus management, and clear recovery actions.

### Task 4: Audit and Marketplace preparation

**Files:**
- Create: `docs/google-drive-marketplace-readiness.md`
- Modify: `app/privacy/page.tsx` and `app/terms/page.tsx` only if the final scopes/data flow require updated disclosures

- [ ] Document the Drive data flow, retention, revocation, narrow scopes, test account, screenshots, support URL, privacy URL, and Marketplace submission checklist.
- [ ] Confirm that source Drive identifiers and links are visible in the record/report evidence surface without exposing them across users.
- [ ] Verify RLS and server authorization with two test users.

### Task 5: Verification

- [ ] Run `npx tsc --noEmit`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Test connect, callback rejection, disconnect, file listing, duplicate import, oversized/unsupported file rejection, prescan entry, and cross-user access denial locally.
- [ ] Apply the migration in the intended Supabase project and deploy only after the private flow passes.

**External dependency:** Public Google Workspace Marketplace publication cannot be completed solely in the repository. Google Cloud project configuration, OAuth verification, test credentials, and Google review remain external steps after the private integration works.
