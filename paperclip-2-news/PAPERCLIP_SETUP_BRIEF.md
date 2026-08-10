# Paperclip.ing Setup Brief — AI After Dark Org

**Purpose:** Configure paperclip.ing to run the AI After Dark production
team. Replaces the obsolete `TEAM_BUILD_BRIEF.md` (which assumed a
custom TypeScript runtime — paperclip.ing IS the runtime).

**Audience:** Founder. Execute by clicking through the paperclip.ing UI
at `http://127.0.0.1:3100/AVI/`. ~60 minutes total.

## Concept primer — Prompt Template vs Agent Instructions

| | Agent Instructions File (AGENTS.md) | Prompt Template |
|---|---|---|
| **What** | Stable identity + role + how-to | Per-invocation framing |
| **Length** | Long (~150 lines) | Short (~10–30 lines) |
| **Changes** | Only when role evolves | Per invocation via template variables |
| **Loaded** | Injected as system prompt context at runtime | Sent every heartbeat / invocation |
| **Variables** | None — static markdown | `{{agent.name}}`, `{{agent.role}}`, `{{context.*}}`, `{{run.*}}` |
| **Use for** | "WHO you are, what your job is" | "WHAT to do this invocation" |

**Key behavior:** Prompt Template fires on **every** invocation —
whether triggered by heartbeat OR by issue assignment. It cannot assume
a specific issue is in context. Templates should be **generic
queue-checkers**: "you've been woken up, check your work queue, do the
top item."

The agent uses its handbook (AGENTS.md) + paperclip's native issue/task
tools to query what's assigned and act.

## Prerequisites

- Paperclip.ing running locally on port 3100
- AVI org exists (or create one)
- Pipeline tools installed per `pipeline/SETUP_BRIEF.md` (verified)
- Anthropic API key in `~/Documents/AVINTELLIGENCE/avint/.env.local`
- All `paperclip-2-news/shared/*.md` and `paperclip-2-news/agents/*.md`
  files present and locked

## Step 1 — Create 8 Skills

In paperclip → Skills → "Add" for each row below. Use **local path**
source. Paste the full absolute path.

| # | Skill name | Shortname | Description | Local path |
|---|---|---|---|---|
| 1 | `aad-cast` | `cast` | AI After Dark cast bible — 16 character personalities, voices, recurring bits, catchphrases, intro schedule | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/cast.md` |
| 2 | `aad-character-visuals` | `visuals` | Visual design specs for all 16 characters — hair, skin, eyes, outfits, lighting, color palettes, silhouette tests | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/character-visual-specs.md` |
| 3 | `aad-show-bible` | `bible` | Show format, segments, recurring bits catalog, cast intro schedule, episode arc patterns, pilot structure | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/show-bible.md` |
| 4 | `aad-voice-comedy` | `comedy` | Comedy DNA, joke construction rules, per-character voice samples, what to cut, what to always include | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/voice-and-comedy-guide.md` |
| 5 | `aad-ad-insertion` | `ads` | In-show AVInt commercial system — 3 modes (Straight/Reluctant/Failed), meta-bit framework, pitch library | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/ad-insertion-guide.md` |
| 6 | `aad-legal-parody` | `legal` | Parody rules, fair-use guardrails, parody name table (Anthropic→Anthropomorphic etc.), pre-publish checklist | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/legal-and-parody-guardrails.md` |
| 7 | `aad-persona5-ui` | `ui` | Persona 5 UI overlay design language — typography, lower-thirds, ticker, callouts, segment transitions, stings | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/shared/persona5-ui-design-language.md` |
| 8 | `avi-product-positioning` | `product` | AVIntelligence product positioning — what the product is/isn't, pricing tiers, approved/disapproved claims | `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip/shared/product-positioning.md` |

**Time:** ~10 min for 8 skills.

## Step 2 — Create 11 Agents

For each agent below, in paperclip → New Agent, paste the values from the
table. Adapter = **Claude Code (local)** for all. Adapter command = `claude`.

### Common settings for all agents

| Field | Value |
|---|---|
| Adapter | Claude Code (local) |
| Command | `claude` |
| Thinking effort | Auto |
| Enable Chrome | No |
| Skip permissions | Yes (low-risk file ops) |
| Max turns per run | 100 |
| Heartbeat | Disabled (manual / on-issue-assignment trigger) |

### Per-agent configuration

#### 1. Showrunner (top of org)

- **Name:** `Showrunner`
- **Role:** Producer & Show Lead
- **Reports to:** N/A (top of org)
- **Model:** **Opus 4.7** (judgment + cross-episode coherence matter; cost controlled by manual trigger)
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/showrunner.md`
- **Skills attached:** `aad-cast`, `aad-show-bible`, `aad-voice-comedy`, `aad-ad-insertion`, `aad-legal-parody`, `avi-product-positioning`
- **Prompt template:**
  ```
  You are {{agent.name}}, the {{agent.role}}.

  Workflow check on every invocation:

  1. Read your handbook (Agent Instructions file is loaded as system context).

  2. Query your paperclip issue queue. Find pending items in priority order:
     a. Founder responses on review-gate issues (highest — unblocks workflow)
     b. Child issues that just closed (you must advance their parent)
     c. Newly assigned parent issues (start the cascade)

  3. For the top pending item, determine workflow state and take the next step:

     CASE A — New parent issue, no children yet:
       Decide work needed. If research first → create child issue
       assigned to Researcher with explicit task body. If a planning
       task you handle yourself → do it, write output to prescribed
       path. Mark parent in-progress.

     CASE B — A child issue just closed:
       Read its output (file paths in closing comment). REVIEW the
       work against your handbook quality bar. Then:
         APPROVED → create next child issue per cascade order
                    (Research → Plan → Script → JokeDoctor + Storyboard
                    + AdWriter parallel → Founder Gate → Voice → Anim
                    → Editor → Thumbnail → Publisher).
         REJECTED → reopen the child with explicit notes, reassign to
                    same IC. Don't advance.
         FOUNDER REVIEW NEEDED → create a child issue assigned to
                    Founder with summary + decision options.

     CASE C — All work for parent complete:
       Close parent with final summary.

     CASE D — Stuck (waiting / blocked):
       Comment with blocker. Do not act.

  4. ALWAYS: write routing decisions as comments on issues (audit trail).
     Honor cast rotation rules and recurring-bit cooldowns from skills.
     Never bypass review gates. Never auto-publish.

  5. If no pending work, idle and exit.
  ```

#### 2. Researcher

- **Name:** `Researcher`
- **Role:** News Scout
- **Reports to:** Showrunner
- **Model:** **Haiku 4.5** (high-volume scanning; bulk relevance scoring)
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/news-scout.md`
- **Skills attached:** `aad-cast`, `aad-show-bible`, `aad-legal-parody`
- **Prompt template:** (use the unified IC template below)

#### 3. Script Writer

- **Name:** `Script Writer`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/script-writer.md`
- **Skills attached:** `aad-cast`, `aad-show-bible`, `aad-voice-comedy`, `aad-legal-parody`, `avi-product-positioning`
- **Prompt template:** (use the unified IC template below)

#### 4. Joke Doctor

- **Name:** `Joke Doctor`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/joke-doctor.md`
- **Skills attached:** `aad-cast`, `aad-show-bible`, `aad-voice-comedy`, `aad-legal-parody`
- **Prompt template:** (use the unified IC template below)

#### 5. Storyboard Artist

- **Name:** `Storyboard Artist`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/storyboard-artist.md`
- **Skills attached:** `aad-cast`, `aad-character-visuals`, `aad-show-bible`, `aad-persona5-ui`, `aad-legal-parody`
- **Prompt template:** (use the unified IC template below)

#### 6. Ad Writer

- **Name:** `Ad Writer`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/ad-writer.md`
- **Skills attached:** `aad-cast`, `aad-voice-comedy`, `aad-ad-insertion`, `avi-product-positioning`, `aad-legal-parody`
- **Prompt template:** (use the unified IC template below)

#### 7. Voice Director (stub initially — full impl when ElevenLabs key set)

- **Name:** `Voice Director`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/voice-director.md`
- **Skills attached:** `aad-cast`
- **Prompt template:** (use the unified IC template below)

#### 8. Animation Engineer (stub initially — full impl when character rigs ready)

- **Name:** `Animation Engineer`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/animation-engineer.md`
- **Skills attached:** `aad-character-visuals`, `aad-persona5-ui`, `aad-show-bible`
- **Prompt template:** (use the unified IC template below)

#### 9. Editor / Assembler (stub initially)

- **Name:** `Editor`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/editor-assembler.md`
- **Skills attached:** `aad-show-bible`, `aad-persona5-ui`
- **Prompt template:** (use the unified IC template below)

#### 10. Thumbnail / Titler (stub initially)

- **Name:** `Thumbnail Titler`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/thumbnail-titler.md`
- **Skills attached:** `aad-show-bible`, `aad-persona5-ui`, `aad-legal-parody`
- **Prompt template:** (use the unified IC template below)

#### 11. Publisher (stub initially — full impl when YouTube OAuth set)

- **Name:** `Publisher`
- **Reports to:** Showrunner
- **Model:** Sonnet 4.6
- **Agent instructions file:** `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/agents/publisher.md`
- **Skills attached:** `aad-legal-parody`
- **Prompt template:** (use the unified IC template below)

### Unified IC Prompt Template (use for all 10 ICs)

Copy verbatim into the Prompt Template field for: Researcher, Script
Writer, Joke Doctor, Storyboard Artist, Ad Writer, Voice Director,
Animation Engineer, Editor, Thumbnail Titler, Publisher.

```
You are {{agent.name}}, the {{agent.role}}.

Workflow check on every invocation:

1. Read your handbook (Agent Instructions file is loaded as system
   context).

2. Query your paperclip issue queue for pending issues assigned to you.

3. For the highest-priority pending issue:
   a. Read the issue body for task details (file paths, scope, notes).
   b. Do the work per your handbook + attached skills.
   c. Write outputs to the file paths your handbook prescribes.
   d. Comment on the issue with:
      - what you produced (1-2 sentence summary)
      - file paths of outputs
      - any flags, concerns, cost overruns
      - if applicable: a recommendation for the next step
        (Showrunner decides; you don't act on this)
   e. Mark the issue closed.

4. Do NOT advance the workflow yourself. Showrunner reviews your output
   and decides the next step.

5. If no pending work, idle and exit.
```

**Time:** ~5 min per agent × 11 = ~55 min.

## Step 3 — Reports-to wiring

When creating each agent above, set **Reports to** to:
- Showrunner: N/A (top)
- All other 10: Showrunner

This makes Showrunner the sole top-level coordinator. All work cascades
through it.

## Step 4 — First Sprint Kickoff Issue

Create the first issue to test the cascade. In paperclip → New Issue:

| Field | Value |
|---|---|
| Issue title | `Sprint 1: 12-month backlog → 6 episode scripts` |
| For | (use Description; Showrunner reads it) |
| Assignee | `Showrunner` |
| Project | `Sprint 1` (create the project if needed) |
| Priority | `P0` |
| Description | (paste below) |

**Description body:**

```
Run the pre-launch backlog sprint per agents/showrunner.md (Inventory Mode).

SCOPE:
- Date range: 2025-04-01 to 2026-04-01 (12 months)
- Target: 6 episodes worth of ready scripts
- Episode 1 cast on screen: Chloe, Cody, Gem, Grock + voice-of-Cole
- Episodes 2-6: introduce one new character per episode per show-bible's
  Cast Introduction Strategy

WORKFLOW:
1. Create child issue assigned to Researcher: backlog mode sweep, 12-month
   scope, target 300-800 candidates. Output to backlog/research-runs/.
2. Once Researcher completes, do Producer cluster + plan work yourself
   (Inventory Mode phase 2). Draft 6 episode plans, write to
   backlog/episodes/<NN>/plan.json each.
3. Create review-gate issue assigned to Founder: "Review 6 episode plans".
   Body: list each plan with summary; founder approves/edits/kills via
   editing files in backlog/ + commenting on issue.
4. After founder approval, for each locked plan, create 4 parallel child
   issues:
   - Script Writer: draft segments
   - Ad Writer: draft ad slot
5. After Script Writer + Ad Writer complete per episode, create:
   - Joke Doctor: punch-up pass on the episode's scripts
   - Storyboard Artist: shot-by-shot for the episode
6. Create final review-gate issue: "Review 6 final scripts".
7. Once founder approves, mark this parent issue done. Locked scripts go
   to production queue (animation pipeline picks up later).

OUTPUTS YOU PRODUCE:
- backlog/episodes/001/plan.json through 006/plan.json
- backlog/research-runs/<date>-backlog.json

WHAT TO AVOID:
- Don't trigger Voice Director, Animation Engineer, Editor, Thumbnail, or
  Publisher in this sprint. Production pipeline runs after character art
  + scenes are ready (separate work).
- Don't auto-publish anything. Sprint scope ends at "scripts ready for
  production".
```

## Step 5 — Smoke Test (one-agent test before sprint)

Before kicking off the full sprint, validate that one agent can run
end-to-end. Create a smoke-test issue:

| Field | Value |
|---|---|
| Issue title | `Smoke: Researcher daily mode test` |
| Assignee | `Researcher` |
| Project | `smoke-test` |
| Priority | `P3` |
| Description | (below) |

**Description:**

```
DAILY MODE smoke test. Tiny scope to verify the agent runs end-to-end.

Scope:
- Past 3 days of news only
- Hacker News + TechCrunch AI feed only (skip Reddit, X, official blogs)
- Target: 5-10 candidates max

Output:
- backlog/research-runs/smoke-test-<date>.json

Cost cap: $0.50. If exceeded, halt and report.

When done, mark issue closed. We'll review the output before kicking off
the real sprint.
```

If this works (output JSON appears, format is correct, cost under $0.50),
the agent is verified. Run the full Sprint 1 issue next.

## Step 6 — Codex Runtime Triage (after Codex finishes)

Once Codex completes (or you halt it), check `paperclip-2-news/runtime/`
for these reusable artifacts:

| Path | Disposition |
|---|---|
| `runtime/src/lib/anthropic.ts` | Maybe useful as a reference for prompt-caching patterns. Probably not needed since paperclip handles Claude Code calls. |
| `runtime/src/lib/files.ts` | Useful as documentation for the file-based artifact schema. Each agent's AGENTS.md can reference it. |
| `runtime/src/lib/prompts.ts` | Probably obsolete — paperclip's skills + AGENTS.md handle this. |
| `runtime/src/agents/*.ts` | Obsolete — paperclip agents replace these. |
| `runtime/src/orchestrator/*.ts` | Obsolete — paperclip's issue system replaces these. |
| `runtime/src/cli/*.ts` | Maybe useful as scripts paperclip agents can call. Triage individually. |

Recommendation: archive `runtime/` to `runtime.archived/` for reference,
don't delete. The Codex work isn't lost; just superseded.

## Step 7 — Verify After Sprint Completes

After Sprint 1 issue closes:

- [ ] `backlog/research-runs/` has a backlog dump
- [ ] `backlog/episodes/001/` through `006/` exist
- [ ] Each episode folder has: `plan.json`, `script-*.md` files, `storyboard.json`, `ad-slot.md`
- [ ] Each episode `status.json` shows `gate1: locked`, `gate2: locked`
- [ ] Total Anthropic API spend visible in your billing was under $30 for the sprint

If all check, the team is operational. Repeat for ongoing weekly cycle by
creating a new issue weekly:

```
Title: Weekly cycle: Episode 7 (week of YYYY-MM-DD)
Assignee: Showrunner
Project: Weekly
Body: Run weekly cycle per agents/showrunner.md (Weekly Mode). Past 7
days of news. Single episode targeting Friday 06:00 Manila publish.
```

## Time + Cost Summary

| Phase | Time | Cost |
|---|---|---|
| Skills setup (8 skills) | ~10 min founder | $0 |
| Agent setup (11 agents) | ~55 min founder | $0 |
| Smoke test (Researcher) | ~5 min | <$1 |
| Sprint 1 (full backlog → 6 episodes) | ~1 week (mostly Showrunner + ICs running) | $20–40 in Claude API |
| Founder review time during Sprint 1 | ~1.5 hours total (2 review gates) | — |

**Total to first 6 episode scripts: ~1 week, ~$25–45 in API.**

After sprint: weekly cycle costs ~$5–10 per episode.

## What Happens AFTER This Brief

Once Sprint 1 succeeds:
- Phase A character art (separate brief, founder + Codex with ComfyUI/DragonBones)
- Phase C scene generation (separate brief)
- Production pipeline integration (Voice Director, Animation Engineer, Editor get full implementations once art is ready)
- First Episode 1 render
- Publish

The current brief gets you a working SCRIPT-PRODUCTION team. The visual
production pipeline is a separate track.
