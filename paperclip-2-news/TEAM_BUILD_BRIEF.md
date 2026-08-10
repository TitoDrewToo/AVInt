# Codex Team-Build Brief — Paperclip-2 Agent Runtime

**Prerequisites:** `pipeline/SETUP_BRIEF.md` must be complete. `make verify`
in `pipeline/` must pass. If not, halt and report.

You are now building the **agent runtime** that orchestrates the
satirical AI news show production. This is separate from the rendering
pipeline (already in `pipeline/`). Your job here is the brains, not the
visuals.

## Goal

Build a working multi-agent system that:

1. Runs both the **Pre-launch Backlog Sprint** (one-time, produces 4–8
   episode scripts from 9–12 months of past events) AND the **Weekly
   Cycle** (ongoing, one fresh episode per week)
2. Cascades work through 11 specialized agents (specs in `agents/*.md`)
3. Surfaces founder review gates via CLI commands + file-based status
4. Persists everything as JSON/MD files in `backlog/` (git is the audit trail)
5. Re-uses the existing Anthropic API key from main avint app

## Architecture decisions (locked)

- **No Supabase.** All persistence is files in `backlog/`. Git tracks history.
- **No admin web UI.** All founder interaction is CLI + editing files in
  their editor. Status fields in JSON are the review-gate mechanism.
- **No separate API keys.** Runtime loads `../.env.local` (the main avint
  `.env.local`) via dotenv. The `ANTHROPIC_API_KEY` is already there.
- **Single-operator design.** No multi-user concurrency, no auth, no RLS.
- **Will become a separate repo.** Build inside `paperclip-2-news/`; after
  the build, founder runs `git init` and pushes to a new GitHub repo. Do
  NOT initialize git from inside this brief — founder owns that.

## What You Read First (in order)

1. `paperclip-2-news/README.md`
2. `paperclip-2-news/shared/cast.md`
3. `paperclip-2-news/shared/character-visual-specs.md`
4. `paperclip-2-news/shared/show-bible.md`
5. `paperclip-2-news/shared/voice-and-comedy-guide.md`
6. `paperclip-2-news/shared/ad-insertion-guide.md`
7. `paperclip-2-news/shared/legal-and-parody-guardrails.md`
8. `paperclip-2-news/agents/*.md` — All 11 agent specs
9. `paperclip-2-news/pipeline/README.md` — Confirm pipeline is operational

## What You Do NOT Do

- Do NOT modify `paperclip-2-news/pipeline/tools/`, `pipeline/Makefile`,
  `pipeline/scripts/setup.sh`, `pipeline/scripts/verify.sh`, or
  `pipeline/package.json` structure (these were established by the
  pipeline setup brief and are stable infrastructure)
- **EXCEPTION:** Step 5b explicitly authorizes adding the Character
  component framework under `pipeline/src/components/` and
  `pipeline/src/characters/`. That's expected — the Animation Engineer
  agent depends on it. Do create / modify under those two directories.
- Do NOT build a web UI, admin pages, or any HTTP server
- Do NOT use Supabase, PostgreSQL, or any database
- Do NOT auto-publish to YouTube
- Do NOT touch the main avint app code (`/app`, `/lib`, `/supabase/`)
- Do NOT initialize git or commit
- Do NOT integrate Instantly / Smartlead / LinkedIn (paperclip-1 concerns)
- Do NOT build voice cloning, animation rigging, or Midjourney
  integration code (founder produces art assets manually)

## Architecture

```
paperclip-2-news/
├── README.md / shared/ / agents/ / pipeline/      # Already exists
├── backlog/                                       # NEW — All artifacts as files
│   ├── README.md                                  # Explains the file layout
│   ├── research-runs/
│   │   └── <YYYY-MM-DD>-<mode>.json               # Researcher outputs
│   └── episodes/
│       └── <NNN>/                                 # Zero-padded episode number
│           ├── plan.json                          # Producer output
│           ├── script-cold-open.md                # Script Writer per segment
│           ├── script-top-story.md
│           ├── script-...
│           ├── storyboard.json                    # Storyboard Artist
│           ├── ad-slot.md                         # Ad Writer
│           └── status.json                        # { status, gate1, gate2, notes }
└── runtime/                                       # NEW — Build here
    ├── package.json
    ├── tsconfig.json
    ├── README.md
    ├── Makefile
    ├── .env.example
    ├── src/
    │   ├── agents/                                # One file per agent
    │   │   ├── researcher.ts                      # News Scout (real impl)
    │   │   ├── producer.ts                        # Showrunner (real impl)
    │   │   ├── script-writer.ts                   # (real impl)
    │   │   ├── joke-doctor.ts                     # (real impl)
    │   │   ├── storyboard-artist.ts               # (real impl)
    │   │   ├── ad-writer.ts                       # (real impl)
    │   │   ├── voice-director.ts                  # Stub
    │   │   ├── animation-engineer.ts              # Stub
    │   │   ├── editor-assembler.ts                # Stub
    │   │   ├── thumbnail-titler.ts                # Stub
    │   │   └── publisher.ts                       # Stub
    │   ├── orchestrator/
    │   │   ├── sprint-workflow.ts                 # Pre-launch cascade
    │   │   ├── weekly-workflow.ts                 # Ongoing cascade
    │   │   └── review-gates.ts                    # File-based pause/resume
    │   ├── lib/
    │   │   ├── anthropic.ts                       # Claude SDK + caching
    │   │   ├── files.ts                           # Read/write backlog/ JSON+MD
    │   │   ├── prompts.ts                         # Loads shared/ + agents/ specs
    │   │   ├── notify.ts                          # macOS osascript notifications
    │   │   └── logging.ts
    │   └── cli/
    │       ├── verify.ts                          # `make verify`
    │       ├── start-sprint.ts                    # `make sprint`
    │       ├── trigger-weekly.ts                  # `make weekly`
    │       ├── review-list.ts                     # `make review:list`
    │       ├── review-lock.ts                     # `make review:lock <id>`
    │       ├── review-kill.ts                     # `make review:kill <id>`
    │       ├── review-edit.ts                     # `make review:edit <id>` — opens episode folder in $EDITOR
    │       └── agent-test.ts                      # `npm run agent:test <agent>`
    └── (no supabase/, no admin UI, no http server)
```

## Step 1 — Project scaffold

In `runtime/`:

```bash
npm init -y
npm install --save @anthropic-ai/sdk dotenv zod tsx
npm install --save-dev typescript @types/node
```

Create `tsconfig.json` (Node 20+, ESM, strict).

Create `runtime/.env.example`:

```bash
# Anthropic — REUSED from /Users/avin/Documents/AVINTELLIGENCE/avint/.env.local
# This runtime loads ../.env.local via dotenv. No need to duplicate.
# If you need a paperclip-2-specific override, set it in runtime/.env (gitignored).

# Optional overrides
LOG_LEVEL=info
NODE_ENV=development

# Founder identity (used for notifications + cron timing)
FOUNDER_NAME=Andrew
FOUNDER_TIMEZONE=Asia/Manila

# News research sources (free / public)
HACKER_NEWS_API_BASE=https://hn.algolia.com/api/v1
TECHCRUNCH_AI_RSS=https://techcrunch.com/category/artificial-intelligence/feed/
```

In `src/lib/anthropic.ts`, load env from main avint `.env.local`:

```typescript
import dotenv from 'dotenv';
import path from 'path';
// Load runtime-local first (overrides), then main avint app's .env.local
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env.local') });
```

If `ANTHROPIC_API_KEY` is missing, error with a clear message pointing at
`/Users/avin/Documents/AVINTELLIGENCE/avint/.env.local`.

## Step 2 — File-based persistence (`src/lib/files.ts`)

Single module that handles all reads/writes to `backlog/`. Functions:

```typescript
// Episodes
listEpisodes(): EpisodeMeta[]
readEpisodeStatus(id: string): EpisodeStatus
writeEpisodeStatus(id: string, status: EpisodeStatus): void
readEpisodePlan(id: string): EpisodePlan
writeEpisodePlan(id: string, plan: EpisodePlan): void
readScript(id: string, slot: string): Script
writeScript(id: string, slot: string, script: Script): void
readStoryboard(id: string): Storyboard
writeStoryboard(id: string, sb: Storyboard): void
readAdSlot(id: string): AdSlot
writeAdSlot(id: string, ad: AdSlot): void

// Research runs
listResearchRuns(): ResearchRunMeta[]
readResearchRun(id: string): ResearchRun
writeResearchRun(run: ResearchRun): string  // returns id
```

`EpisodeStatus` schema (in `status.json`):

```json
{
  "id": "001",
  "episode_number": 1,
  "status": "draft" | "pending_gate1" | "gate1_locked" | "scripts_ready" |
            "pending_gate2" | "gate2_locked" | "ready_for_production" | "killed",
  "gate1": { "decision": "lock" | "edit" | "kill" | null, "notes": "...", "decided_at": "..." } | null,
  "gate2": { "decision": "lock" | "edit" | "kill" | null, "notes": "...", "decided_at": "..." } | null,
  "ad_slot_offer": "Extension Rescue $199",
  "spine": "...",
  "created_at": "...",
  "updated_at": "..."
}
```

JSON for structured data (plans, statuses, storyboards, research runs).
Markdown for human-readable scripts and ad slots (founder reviews these
in their editor).

## Step 3 — Anthropic SDK wrapper (`src/lib/anthropic.ts`)

Build a thin wrapper that:

- Reads `ANTHROPIC_API_KEY` from env (with the dotenv chain above)
- Provides `callAgent({model, system, user, schema, options})` returning
  validated JSON via Zod
- Handles retries on 429 / 529 / network errors with exponential backoff
- Logs token usage per call to stdout (with `LOG_LEVEL=debug` for verbose)
- Supports prompt caching (`cache_control: { type: 'ephemeral' }`) on the
  static portions (shared specs)
- Model strings: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-7`

## Step 4 — Prompt loader (`src/lib/prompts.ts`)

For each agent:
- Reads its spec from `agents/<agent>.md`
- Extracts the system prompt from the "System Prompt (skeleton)" code block
- Concatenates required shared specs (per the agent's "Inputs" section)
- Returns a structured `{system: string, cacheableSystem: string}` for use
  in callAgent (cacheable = the parts that don't change per call)

## Step 5 — Per-agent implementation

For each agent listed as "real impl" in the architecture, implement:

```typescript
// src/agents/researcher.ts
import { callAgent } from '../lib/anthropic';
import { loadPrompt } from '../lib/prompts';
import { writeResearchRun } from '../lib/files';
import { z } from 'zod';

const ResearcherInputSchema = z.object({
  mode: z.enum(['backlog', 'daily']),  // matches agents/news-scout.md spec
  scopeStart: z.string(),  // ISO date
  scopeEnd: z.string(),
  brief: z.string(),       // Producer's research brief
  outputTarget: z.number().int().min(50).max(1000),
});

const ResearcherOutputSchema = z.object({
  candidates: z.array(z.object({
    source_url: z.string().url(),
    headline: z.string(),
    // ... per agent spec
  })),
});

export async function runResearcher(input: z.infer<typeof ResearcherInputSchema>) {
  ResearcherInputSchema.parse(input);
  const prompts = await loadPrompt('researcher');
  const result = await callAgent({
    model: input.mode === 'backlog' ? 'claude-sonnet-4-6' : 'claude-haiku-4-5',
    system: prompts.system,
    user: JSON.stringify(input),
    schema: ResearcherOutputSchema,
  });
  const id = writeResearchRun({
    mode: input.mode,
    scope_start: input.scopeStart,
    scope_end: input.scopeEnd,
    brief: input.brief,
    candidates: result.candidates,
    created_at: new Date().toISOString(),
  });
  return { runId: id, count: result.candidates.length };
}
```

Same pattern for: producer, script-writer, joke-doctor, storyboard-artist,
ad-writer.

**Stubs only** for: voice-director, animation-engineer, editor-assembler,
thumbnail-titler, publisher. Each returns mock data and logs a TODO.

## Step 5b — Character Component Framework

The Animation Engineer agent does NOT generate per-character code. It uses a
**generic Character framework** that supports any character via configuration.
Build this in `pipeline/src/components/` (the SETUP_BRIEF.md scaffolded the
stubs — this step turns them into production components).

### Files

```
pipeline/src/components/
├── Character.tsx              # Generic — renders any character via config
├── CharacterRig.tsx           # SVG layer composition + state machine
└── LipSyncDriver.tsx          # Reads Rhubarb timeline → mouth state stream

pipeline/src/characters/
└── <name>/
    ├── config.json
    ├── head.svg
    ├── body.svg
    ├── mouth-A.svg, mouth-B.svg, mouth-C.svg, mouth-D.svg, mouth-E.svg, mouth-F.svg, mouth-X.svg
    ├── eye-open.svg, eye-half.svg, eye-closed.svg, eye-aside.svg
    └── pose-neutral.svg, pose-gesturing.svg, pose-leaning.svg
```

### config.json schema (per character)

```json
{
  "name": "chloe",
  "displayName": "Chloe Antropova",
  "lowerThird": "CHLOE ANTROPOVA — ANTHROPOMORPHIC NEWS",
  "primaryColor": "#FF8C42",
  "accentColor": "#FFF8DC",
  "lighting": { "key": "warm-even", "rim": "soft-warm" },
  "head": "head.svg",
  "body": "body.svg",
  "mouths": {
    "A": "mouth-A.svg",
    "B": "mouth-B.svg",
    "C": "mouth-C.svg",
    "D": "mouth-D.svg",
    "E": "mouth-E.svg",
    "F": "mouth-F.svg",
    "X": "mouth-X.svg"
  },
  "eyes": {
    "open": "eye-open.svg",
    "half": "eye-half.svg",
    "closed": "eye-closed.svg",
    "aside": "eye-aside.svg"
  },
  "poses": {
    "neutral": "pose-neutral.svg",
    "gesturing": "pose-gesturing.svg",
    "leaning": "pose-leaning.svg"
  },
  "particles": null
}
```

### Component API

```tsx
// Static character (single frame)
<Character
  name="chloe"
  mouthState="A"
  eyeState="open"
  pose="neutral"
  position={[0, 0, 0]}
  scale={1}
/>

// Lip-synced character (audio-driven)
<LipSyncDriver
  audioPath="path/to/voice.wav"
  timelinePath="path/to/rhubarb.json"
  fps={30}
>
  {({ mouthState, eyeState }) => (
    <Character
      name="chloe"
      mouthState={mouthState}
      eyeState={eyeState}
      pose="neutral"
    />
  )}
</LipSyncDriver>
```

### Adding a new character

Drop a folder under `pipeline/src/characters/<new-name>/` with the SVG
files + config.json. No code changes. The framework picks it up.

### Placeholder assets for build phase

Codex builds the framework BEFORE the founder produces real Midjourney
art. Use placeholder SVGs (simple colored rectangles labeled with the
state name) so the framework can be smoke-tested. Founder replaces with
real art when ready. Same config.json schema; just different SVG contents.

### Smoke test for the framework

Add to `make verify`: render a single 3-second composition that:
1. Loads the placeholder Chloe character
2. Plays a generated Rhubarb timeline (use `say "testing"` → wav → Rhubarb)
3. Confirms mouth swaps in time with audio
4. Outputs `pipeline/assets/renders/character-smoke.mp4`

If this works, the entire animation rig works for any character that
follows the convention.

## Step 6 — Workflow orchestrators

### `src/orchestrator/sprint-workflow.ts`

```typescript
async function runSprint({
  scopeStart: '2025-04-01',
  scopeEnd: '2026-04-01',
  episodeTarget: 6,
}) {
  // 1. Producer drafts research brief
  const brief = await runProducer({
    mode: 'inventory',
    phase: 'brief_research',
    scope: { start, end },
    target: episodeTarget,
  });

  // 2. Researcher executes brief
  const { runId, count } = await runResearcher({
    mode: 'backlog',
    scopeStart, scopeEnd,
    brief: brief.briefText,
    outputTarget: 500,
  });
  notify(`Researcher dropped ${count} candidates → backlog/research-runs/${runId}.json`);

  // 3. Producer clusters into episode plans
  const plans = await runProducer({
    mode: 'inventory',
    phase: 'plan_episodes',
    researchRunId: runId,
    target: episodeTarget,
  });
  notify(`${plans.length} episode plans drafted. Run: make review:list`);

  // 4. Pause for Gate 1
  await waitForGate(plans.map(p => p.id), 'gate1');

  // 5. For each locked plan: script-writer → joke-doctor → storyboard-artist → ad-writer
  const lockedPlans = plans.filter(p => readEpisodeStatus(p.id).gate1.decision === 'lock');
  for (const plan of lockedPlans) {
    await runScriptWriter({ planId: plan.id });
    await runJokeDoctor({ planId: plan.id });
    await runStoryboardArtist({ planId: plan.id });
    await runAdWriter({ planId: plan.id });
    writeEpisodeStatus(plan.id, { ...current, status: 'scripts_ready' });
  }
  notify(`Scripts ready for ${lockedPlans.length} episodes. Run: make review:list`);

  // 6. Pause for Gate 2
  await waitForGate(lockedPlans.map(p => p.id), 'gate2');

  // 7. Mark final-locked scripts ready_for_production
  const finalLocked = lockedPlans.filter(p => readEpisodeStatus(p.id).gate2.decision === 'lock');
  finalLocked.forEach(p => writeEpisodeStatus(p.id, { status: 'ready_for_production' }));
  notify(`Sprint complete. ${finalLocked.length} episodes ready for production.`);
}
```

### `src/orchestrator/weekly-workflow.ts`

Similar but:
- Single episode
- Researcher in `daily` mode, scope = last 7 days
- Tighter timeout on review gates (4h sprint default, override via env)
- Final step also stops at `ready_for_production` (production pipeline is
  separate)

### `src/orchestrator/review-gates.ts`

`waitForGate(episodeIds, gateName, timeoutMs?)`:
- Polls each episode's `status.json` every 30s
- Logs which episodes still pending
- Notifies via `notify.ts` (macOS osascript) every 30 min if still waiting
- Times out after `timeoutMs` (default 24h sprint, 4h weekly) — does NOT
  auto-proceed; logs error and exits non-zero
- Returns when all episodes have a gate decision (lock | kill — edits
  re-trigger the relevant agent and reset status)

## Step 7 — CLI commands

`runtime/package.json` scripts:

```json
{
  "scripts": {
    "verify":           "tsx src/cli/verify.ts",
    "sprint:start":     "tsx src/cli/start-sprint.ts",
    "weekly:trigger":   "tsx src/cli/trigger-weekly.ts",
    "review:list":      "tsx src/cli/review-list.ts",
    "review:lock":      "tsx src/cli/review-lock.ts",
    "review:kill":      "tsx src/cli/review-kill.ts",
    "review:edit":      "tsx src/cli/review-edit.ts",
    "agent:test":       "tsx src/cli/agent-test.ts"
  }
}
```

`review:edit <id>` opens `paperclip-2-news/backlog/episodes/<id>/` in
`$EDITOR` (or `code` if `$EDITOR` is unset). Founder edits files directly;
status remains `pending_*` until they create the corresponding `*_LOCKED.md`
or `*_KILLED.md` marker file.

### `make review:list` output example

```
PENDING REVIEW

Gate 1 (episode plans):
  001  spine: "Everyone is launching a model this week"     ⏳ 2h ago
  002  spine: "Open vs closed weights flares again"          ⏳ 2h ago
  003  spine: "AI hiring war reaches absurd numbers"         ⏳ 2h ago

Gate 2 (final scripts):
  (none)

To review:
  Open paperclip-2-news/backlog/episodes/001/ in your editor.
  Run: make review:lock 001    (approves and continues pipeline)
  Run: make review:kill 001    (drops the episode)
  Edit files directly + run:  make review:edit 001  (re-runs script writer with your edits as notes)
```

### Founder review workflow

1. Open `backlog/episodes/001/` in VS Code (or any editor)
2. Read `plan.json` (episode plan), `script-*.md` (per-segment scripts),
   `storyboard.json`, `ad-slot.md`
3. Edit any of them directly if you want changes (your edits become the
   new source of truth — agents re-run will respect them)
4. From terminal:
   - `make review:lock 001` → marks status as locked, pipeline proceeds
   - `make review:kill 001` → marks killed, episode dropped
   - `make review:edit 001` → re-runs the relevant agent (script writer
     re-reads your edits, joke-doctor re-runs)

This is the entire review UX. No web pages.

## Step 8 — Notifications (`src/lib/notify.ts`)

macOS-native notifications via osascript:

```typescript
import { exec } from 'child_process';

export function notify(message: string, title = 'Paperclip-2') {
  console.log(`📣 ${message}`);
  if (process.platform === 'darwin') {
    exec(`osascript -e 'display notification "${message.replace(/"/g, '\\"')}" with title "${title}"'`);
  }
}
```

No email infra. Founder is on the same machine running the orchestrator.

## Step 9 — Smoke test (`src/cli/verify.ts`)

1. Confirms env loads (Anthropic key present)
2. Reads each agent .md, confirms system prompt extracts cleanly
3. Loads each shared/ spec, confirms file exists and is non-empty
4. Calls Researcher in `mode: 'weekly'` with TINY scope (last 3 days,
   HN only) — confirms it produces a real ranked output (~10 stories)
5. Calls Producer with the test research run, confirms it produces 1
   episode plan
6. Calls Script Writer on 1 segment, confirms valid script JSON
7. Calls Joke Doctor on the script, confirms punch-up output
8. Writes a fake `status.json` with `gate1.decision = 'lock'`, calls the
   review-list command, confirms it sees the locked episode
9. Prints "✅ Team ready" or lists what failed

Cost: ~$1–2 in Anthropic API. Confirms end-to-end before any real sprint.

## Step 10 — README + Makefile

`runtime/README.md` covers:

- What this is (one paragraph)
- Re-uses `../.env.local` for ANTHROPIC_API_KEY
- Setup: `make setup` (npm install + verify env)
- Verify: `make verify`
- Pre-launch: `make sprint`
- Weekly: `make weekly`
- Review: `make review:list`, `make review:lock <id>`, `make review:kill <id>`, `make review:edit <id>`
- Where artifacts live: `backlog/research-runs/`, `backlog/episodes/`
- How to test a single agent: `npm run agent:test researcher`
- Troubleshooting (env path issues, prompt cache, agent JSON validation)

`Makefile` mirrors npm scripts.

## Step 11 — Cron for weekly cycle (optional, defer)

Defer cron until weekly cycle is operationally proven. For now, founder
runs `make weekly` manually Monday morning. Adds 30 seconds of effort,
removes the macOS launchd / cron complexity.

When ready to automate: write a launchd plist or a `cron` line. Document
in README.

## When You're Done

Output:
1. Result of `make verify` (full smoke test)
2. List of agent files in `runtime/src/agents/` (real vs stubbed)
3. Estimated cost of running a full backlog sprint based on smoke-test
   token counts
4. Any decisions you made + why
5. Any blockers (env path issues, agent spec ambiguities)

Do NOT:
- Run a real backlog sprint (founder triggers manually)
- Commit anything (founder reviews + commits)
- Modify `paperclip-2-news/pipeline/`
- Modify the main avint app
- Initialize git in `paperclip-2-news/` (founder does that when ready to
  push to a separate repo)

If anything is ambiguous, halt and ask the founder rather than guessing.
