# Codex brief — fold Explore & build into Advanced Analytics

Andrew's direction, 7 Sep 2026. Approved. This supersedes an earlier draft that
specified a "propose mode"; that solved a problem the existing TTL already
solves and must not be built.

## The shape

Advanced Analytics stays as it is. The panel gains **new visual recommendations**
and **an input where the user can request or instruct**. One panel, not two
modes.

A recommendation is already a non-committal proposal, because it expires unless
the user keeps it. So a user request does not need a separate path — it seeds
the same generator, and its output joins the same recommendation pool.

## The lifecycle already exists — do not rebuild it

```
app/tools/smart-dashboard/page.tsx:1860   plot   -> { is_plotted: true,  expires_at: null }
app/tools/smart-dashboard/page.tsx:2136   unplot -> { is_plotted: false, expires_at: <ttl> }
app/tools/smart-dashboard/page.tsx:1849   star   -> extends life
lib/dashboard-widget-store.ts:10          list   -> expires_at is null OR expires_at > now
supabase/functions/generate-advanced-analytics/index.ts:524  insert -> 7-day TTL
```

Generate with a TTL, show as a recommendation, plot to keep it forever, unplot
to let it lapse. Preview, approval and permanence are all present in that
mechanic. **No propose mode. No new save path. No new lifecycle.**

## The work

**1. One optional parameter on the edge function.**
`supabase/functions/generate-advanced-analytics/index.ts` accepts an optional
`prompt`. With one, generate a single recommendation answering it; without one,
current autonomous behaviour is unchanged. Same storage, same TTL, same picker,
same plot-to-keep.

**2. Model — Sonnet, env-overridable.** Currently hardcoded
`claude-haiku-4-5-20251001` at line 62. Follow the pattern already used in
`generate-rd-analytics`:

```ts
const ANALYTICS_MODEL = Deno.env.get("ADVANCED_ANALYTICS_MODEL") ?? "claude-sonnet-4-6"
```

Keep `gpt-4o-mini` as the existing fallback. Do not hardcode — five call sites
already hardcode Haiku and that drift is a known risk.

*Recorded honestly: there is no evidence Haiku was underperforming here. It was
never invoked, because the failure was a missing key. This is a judgment about
expected quality on a harder task — mapping free text onto a constrained schema
over the user's real fields — not a fix for an observed defect. Env-overridable
so dialling back is a settings change, not a deploy.*

**3. Retire `app/api/dashboard-chat/route.ts` entirely**, and delete
`fallbackDashboardAssistantResult` from `lib/dashboard-assistant.ts` with it.
Q&A (`mode: "answer"`) goes with the route and is not rebuilt in this pass.

**4. Rename — no "Copilot" in any user-facing string.** It is Microsoft's brand,
and after the fold this is a function of Advanced Analytics, not a persona.
Remove first-person voice from generated copy: describe the output, do not speak
as a character.

**5. Provider unavailable must be stated in the UI.** Never substitute a canned
proposal.

## Why this fixes a live production failure

`OPENAI_API_KEY` is not set on Vercel, so `/api/dashboard-chat` returns
`fallbackDashboardAssistantResult` — a hardcoded "Records by document type" bar
chart regardless of the request, narrated in the first person as though the
assistant understood. Verified 7 Sep: asked for "total expenses by vendor as a
bar chart", received count by document type. The response carries
`provider: "local-fallback"` and the UI never surfaces it.

The edge function holds working Anthropic credentials in Supabase secrets. This
removes the broken path rather than patching it, and drops the
`OPENAI_API_KEY`-on-Vercel dependency for this feature entirely.

## Closure criteria

- Ask "total expenses by vendor as a bar chart" and get a recommendation with
  dimension `counterparty` and a sum metric — not `document_type` with a count.
- A requested recommendation behaves exactly like an autonomous one: 7-day TTL,
  appears in the picker, permanent once plotted.
- No user-facing string contains "Copilot".
- Provider unavailable is stated, never substituted with a canned proposal.
- `OPENAI_API_KEY` no longer required on Vercel for this feature.
- Model env-overridable, defaulting to `claude-sonnet-4-6`.
- Edge function deployed `--no-verify-jwt`; `config.toml` carries
  `verify_jwt = false` (CLAUDE.md deploy policy).

## Not in scope

`app/api/report-definitions/author/route.ts` has the identical defect — OpenAI
on Vercel, key missing, silent `local-fallback` that always emits
`title: prompt` with `period: {kind:"all"}`. That fallback produced the
mislabeled report found on 7 Sep. Andrew has not yet decided whether it folds.
**Do not touch it.**

## Standing note

Fifth instance in one session of the same defect shape: a missing input silently
taking a fallback and presenting as a real answer. Absent `direction` became
"expense"; no 2026 FX rate became a June-2025 rate; no API key becomes a canned
chart. Each individually plausible, none announcing itself.

**A missing input fails closed and says so. It never takes a default that is
indistinguishable from a real result.**

Verify against the database, not the UI.
