# Normalization Token Telemetry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-document AI token usage and estimated provider cost across ingestion, normalization, fallback, and reprocess attempts, then expose the economics only inside the systems operations area.

**Architecture:** Add an append-only `ai_usage_events` ledger separate from the existing per-file entitlement meter. Edge functions write one sanitized event for every actual provider call, including failed calls and fallback/retry context; retries remain measured but default to `billable_to_user = false`. A systems-admin-only server route aggregates the ledger for `/systems/economics` without exposing provider credentials, prompts, or responses.

**Tech Stack:** Supabase migration/RLS, Deno Edge Functions, Next.js server route, React systems surface, existing OperationsShell and systems-admin gate.

---

### Task 1: Add the durable telemetry contract

**Files:**
- Create: `supabase/migrations/20260826_ai_usage_events.sql`
- Create: `supabase/functions/_shared/ai-usage.ts`

- [ ] Create an append-only table keyed to `user_id`, `file_id`, optional `document_field_id`, operation, provider/model, attempt, token counts, estimated cost, retry/fallback flags, and sanitized error category.
- [ ] Enable RLS with no client policies; grant writes only through service-role function execution and reads only to the systems server through the service-role client.
- [ ] Add versioned provider price constants and a helper that extracts OpenAI, Anthropic, and Gemini usage shapes without retaining payloads.

### Task 2: Instrument ingestion and normalization calls

**Files:**
- Modify: `supabase/functions/prescan-document/index.ts`
- Modify: `supabase/functions/process-document/index.ts`
- Modify: `supabase/functions/normalize-document/index.ts`
- Modify: `supabase/functions/reprocess-documents/index.ts`

- [ ] Record successful and failed provider calls with the source file and document row identifiers.
- [ ] Mark provider fallback calls separately from true normalization retries.
- [ ] Mark reprocess attempts as retry events and keep them non-billable by default.
- [ ] Ensure telemetry failures never fail or change the ingestion result.

### Task 3: Add systems economics aggregation and surface

**Files:**
- Modify: `components/systems/systems-navigation.tsx`
- Modify: `components/systems/operations-shell.tsx`
- Create: `app/api/systems/economics/route.ts`
- Create: `app/systems/economics/page.tsx`
- Create: `components/systems/economics-overview.tsx`

- [ ] Add the internal-only Economics destination.
- [ ] Aggregate total calls, input/output tokens, estimated provider cost, retry cost, fallback count, failure count, and top documents by cost.
- [ ] Make the retry treatment explicit: internal cost is shown, customer-billable cost excludes retry events.

### Task 4: Verify

- [ ] Run `pnpm build`.
- [ ] Run `pnpm lint` and `pnpm exec tsc --noEmit` if available.
- [ ] Confirm no prompt, response, API key, or client-readable RLS policy is introduced.
- [ ] Document that historical costs are unavailable until events begin recording.
