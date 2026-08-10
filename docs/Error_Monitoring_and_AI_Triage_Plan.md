# AVIntelligence — Error Monitoring + AI Triage (Plan)

*Goal: catch issues before they're reported; when they are reported, already have the who/what/where + a likely cause and fix. An AI layer reviews each new error against the code and a living "system journal" — essentially Claude-on-call, inside the tool, via API. Build for avint first, then a lighter version for Chroma Fairy (studio).*

---

## 1. What already exists (build on it)
- **Structured JSON logs** everywhere: `supabase/functions/_shared/log.ts` (`logEvent`/`logError`) + `lib/api-error.ts` (`serverError`) emit single-line JSON with `fn / stage / event / message / stack / fields`. ~91 call sites.
- Domain event tables: `processed_webhook_events`, `smart_security_events`.
- User-facing errors surface via a global toaster.

**The gap:** logs are ephemeral (console → Supabase log explorer). No durable store, no grouping/dedup, no rich context (which user, which tool/button), no alerting, no AI triage, no monitoring page.

## 2. Build vs buy
- **Capture/aggregation:** you *could* bolt on Sentry (mature grouping/alerting UI, free tier). But the vision — "AI reviews **my** logs + **my** code + **my** journal" — is most cohesive if the errors live in **your own Supabase table** the AI can query directly. **Recommendation: own it** with an `error_events` table wired into your existing `logError`/`serverError`/client toaster. Add Sentry later only if you want its UI/alerting polish.
- **The differentiated part — the AI triage layer — you build.** That's the value; nobody sells exactly this.

## 3. Architecture (components + flow)
```
client error boundary + captureError()  ─┐
edge fn logError / api serverError       ─┼─►  error_events (Supabase)
                                          │      user_id · tool · function · route · button
                                          │      message · stack · fingerprint · context(JSON) · severity
                                          ▼
                              fingerprint grouping (error_groups)
                                          │  (new group?)
                                          ▼
                        AI triage function (Claude API, server-side)
                          input:  error + code context + relevant System-Journal section
                          output: likely cause · suggested fix · severity   → cached on the group
                                          ▼
                        Monitoring page (admin / studio):
                          groups (new/triaged/resolved) · counts · affected users ·
                          context · AI diagnosis + fix · mark-resolved · alerts
```
- **`error_events`** — one row per occurrence, rich context. **`error_groups`** — deduped by a `fingerprint` (hash of normalized `fn`+`stage`+`message`); holds count, first/last seen, status, and the cached AI diagnosis.
- **Capture context:** extend the client with an error boundary + a `captureError(tool, fn, action, err, ctx)` helper so every button/flow tags *what the user was doing* (tool = Smart Storage/Reports, function, button). Server side, `logError`/`serverError` also INSERT to `error_events`.

## 4. The AI triage layer (the "Claude on-call" piece)
- A background function (edge/API) fires when a **new error group** appears. It calls the **Claude API** with: the error (message/stack/sanitized context) + the **relevant code** (the function/file named in `fn`) + the **relevant System-Journal section**. Returns: root-cause hypothesis, affected area, suggested fix, severity → cached on the group.
- **Analyze once per group, not per occurrence** — this bounds API cost to the number of *distinct new* errors (small). Re-analyze only on demand or if the error mutates.

## 5. The living System Journal (AI context)
- A maintained doc — `docs/System_Journal.md` — describing current build/state, **sectioned by subsystem** (Smart Storage, Reports/tax-bundle, Billing/entitlement, Prescan, Dashboard, Auth) + a dated **changelog** of material changes/migrations/deploys.
- The triage pulls only the **section matching the error's tool/fn** (relevant slice, not full history), keeping prompts small and cheap.
- **Claude (me) authors and maintains it** — updated on material changes, same discipline as CLAUDE.md. This is the "constantly-updating document authored by you" you described.

## 6. Cost & rate management
- One analysis per new error group (cached) → tiny volume. Use a cheaper/faster model for triage; escalate to a stronger model only for unresolved/high-severity. Queue + rate-limit the triage function. **Chroma Fairy's volume is trivial**, so API limits are a non-issue there.

## 7. Accounts / ownership
- The **Claude API key is a backend secret on *your* (Andrew's) Anthropic account** — server-side only, never client. **Not Sam's.** One key can serve both apps (or one per app). Cost sits on your dev account, like Supabase — Sam never touches it. The monitoring page for Chroma Fairy lives in *her* studio, but the infra/key is yours.

## 8. Privacy & security (governance-sensitive)
- **Never send raw user documents to the AI.** Triage input = error/stack + code + journal + **sanitized** context (tool/fn/route, anonymized user id) only. Scrub emails/PII from `error_events.context`.
- `error_events`/monitoring page are **admin-only** (RLS + role-gated). Treat this like the security work: server-side truth, no PII leakage.

## 9. Phased rollout
- **Phase 1 — Capture:** `error_events` table + client error boundary + `captureError()` + wire `logError`/`serverError` to insert. (Now you have durable, contextual errors.)
- **Phase 2 — Grouping + monitoring page (read-only):** fingerprint groups; admin page to view groups + context; simple alerting (scheduled check → email on new/high-severity).
- **Phase 3 — AI triage:** the analyze function + cached diagnosis surfaced on the page.
- **Phase 4 — System Journal:** formalize `docs/System_Journal.md` (sectioned + changelog) and wire it as triage context.
- **Phase 5 — Chroma Fairy:** same pattern, lighter, in the studio.

**Highest value first:** Phases 1–2 are useful on their own (you *see* every issue with full context and get alerted) even before any AI. Add Phase 3 once events are flowing.

## 10. Open decisions
- Own-it table vs. Sentry-for-capture (recommend own-it).
- Which model for triage (recommend a fast/cheap model, escalate on severity).
- Alerting channel (email now; later Slack/Discord/webhook).
- Journal granularity (start: one sectioned doc; later: embeddings for retrieval if it grows).

---

## 11. The monitoring row + "Execute fix" (safe, PR-gated)
Row columns: **Issue · Where (tool + button/action) · Details · AI analysis vs. code · Proposed fix · Risk / confidence · Action.**

**"Execute" never edits production directly** — it opens a branch, applies the AI's diff, and runs the test suite (tier-policy, tax regression, CSV regression) + build. Tests are the safety net, not the AI. Tiered by the Risk column:
- **Low-risk + high-confidence + covered by tests** (null-check, missing guard, copy, config value, flag flip) → one-click Execute = PR, **auto-merge only on green**.
- **High-risk** (billing, auth, schema, tax/report math) → **propose only, human-gated** — the AI writes + explains the fix, you review before merge. (Matches CLAUDE.md's "material changes need review.")
- **Non-code ops** (apply a missing migration, flip a flag, re-run a job) → safer *defined* actions, can be one-click.

Always: diff preview · one confirm · reversible (git revert) · every executed fix logged · owner/dev-gated. **Sequence:** execution is the LAST phase — add it only after diagnoses prove reliable on real errors.

## 12. Access control & placement (per app)
Principle: the view is **hidden AND enforced** — the nav entry renders only for authorized users, and the page + APIs enforce server-side (RLS + role/allowlist). A hidden button is never the security boundary.
- **avint:** gated to an **allowlist of user ids — just Andrew for now.** A `system_admins` allowlist (table or a profile flag). Nav entry sits **below the sign-out button**, invisible unless you're on the allowlist. Future: a "nominate user" action to grant access (adds to the allowlist). Same role philosophy as Chroma Fairy will come later; for now it's a one-person allowlist.
- **Chroma Fairy:** gated to **owner / developer / admin** (staff excluded) — reuse the existing `is_user_manager()` capability (already = owner/dev/admin) or a parallel `can_view_systems()`. Nav entry in the studio sidebar, hidden from staff. Server-side + RLS enforced.

## 13. Chroma Fairy variant (lighter)
Same architecture (`error_events` + groups + AI triage + monitoring page), but scaled down:
- **Low volume** (art catalogue + studio, not a document pipeline) → triage cost trivial, no rate concerns.
- **Error surface:** public (home / shop / product / inquiry / booking) + studio (catalogue CRUD, sales RPC, scheduling, users/invite, RLS denials, image upload, WebGL/render).
- **Lives in the studio**, gated owner/dev/admin.
- **Diagnosis-first:** the monitoring page + AI explanation is the main value; **"Execute" is dev-only (Andrew) or deferred** — Sam gets *visibility* (see issues + plain-English cause), not execution.
- Reuse the same schema + triage pattern; Chroma Fairy has its own Supabase + its own (or a shared) Claude key.

**Build sequence:** avint Phases 1–3 first (higher need + volume), then port the lighter variant to Chroma Fairy.

## 14. Rollout of Execute: observation mode → earned autonomy (+ rollback)
- **Global Execute toggle, default OFF = "observation mode."** While off, the button is inert: the AI still *proposes* a fix and an action plan, but nothing can be applied. A deliberate trust-building phase.
- **Measure agreement — don't graduate on a hunch.** Every proposed fix gets a review verdict — you (and/or Codex) mark it **matched / partial / wrong** vs. what you'd actually do. Track the agreement rate across real issues. **Only enable Execute once agreement is consistently near-100% on low-risk fixes** — a data-driven flip, not a vibe.
- **When enabled, stay tiered:** low-risk auto-executes (still PR + tests); high-risk (billing/auth/schema/tax) stays propose-only *forever*.
- **Rollback-to-previous-deployment button — always present, on or off.** One click re-promotes the last known-good production deployment (via the Vercel API). Your universal escape hatch for *any* bad deploy, AI-driven or not.
  - **Caveat:** a deploy rollback reverts **code, not the database.** Schema migrations / data writes are NOT undone by re-promoting a deploy — so rollback fully covers code regressions, but anything that ran a migration needs its own reversal plan. (One more reason schema/billing fixes stay human-gated.)
