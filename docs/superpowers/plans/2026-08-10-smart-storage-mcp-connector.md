# Smart Storage MCP Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute this plan task-by-task with verification checkpoints.

**Goal:** Add a feature-flagged, API-key-authenticated MCP connector for Smart Storage ingestion, reports, and exports while centralizing shared server logic.

**Architecture:** Extract report computation and ingestion into server-only helpers accepting `userId` and computed entitlement. Existing JWT routes keep their HTTP authorization and response behavior but call those helpers. The MCP route uses `mcp-handler` with the official SDK, resolves a hashed API key per request, and calls the same helpers and service-role metering RPCs.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase service role, Supabase migrations/RLS, `mcp-handler`, official `@modelcontextprotocol/sdk`, Zod.

---

### Task 1: Shared server services

- [x] Extract report reads/exports into `lib/report-engine.ts` and update `app/api/reports/[report]/route.ts` to delegate without changing response shapes.
- [x] Add `lib/smart-storage-ingest.ts` for service-role upload, file/job creation, prescan invocation, bounded polling, and structured normalized records.
- [x] Add shared entitlement/upgrade messaging helpers for MCP responses.

### Task 2: API-key persistence and auth

- [x] Add the `api_keys` migration with SHA-256 hash storage, ownership RLS, indexes, and safe function/search-path conventions.
- [x] Add `lib/mcp-auth.ts` for flag checks, Bearer parsing, SHA-256 lookup, last-used updates, and JWT-backed key-management authorization.
- [x] Add key-management API actions for list/create/revoke; plaintext is returned only by create.

### Task 3: MCP transport and tools

- [x] Add `mcp-handler` and the official MCP SDK dependencies.
- [x] Add feature-flagged `app/api/mcp/[[...transport]]/route.ts` exposing `smart_storage.ingest`, `smart_storage.report`, and `smart_storage.export` with per-call API-key authentication, validation, metering, and friendly cap results.

### Task 4: Feature-flagged settings UI

- [x] Add `/tools/smart-storage/connect` behind `ENABLE_MCP_CONNECTOR`, with JWT-authenticated list/create/revoke actions and one-time secret display.
- [x] Link it from the account panel only when the public rollout flag is enabled.

### Task 5: Verification

- [x] Run TypeScript/build, lint or targeted scripts available in the repo, and `git diff --check`.
- [x] Confirm the default-off flag makes both the MCP route and UI unavailable.
