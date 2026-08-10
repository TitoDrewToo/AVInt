# Codex Scene-Build Brief — Phase C (Pilot Scenes/Sets, Local Game-Dev Pipeline)

**Prerequisites:**
- `pipeline/SETUP_BRIEF.md` complete; `make verify` passes ✅
- `CHARACTER_BUILD_BRIEF.md` Phase A complete OR concurrently in progress
  (scene + character work is independent)
- ComfyUI installed locally per `CHARACTER_BUILD_BRIEF.md` Step 1–2
- parallax-maker working (verified by SETUP_BRIEF)

If any prerequisite missing, halt and report.

## Goal

Build the **scenes/sets the pilot episode requires**, as 2.5D parallax
glTF scenes loadable by the runtime via React Three Fiber. Fully local,
zero API cost.

**Phase C scope (this brief — pilot scenes only):**
- Main anchor desk (wide / medium / close framing)
- Two-shot anchor desk (Chloe + Cody)
- Gem field-report backdrop A (generic city skyline)
- Gem field-report backdrop B (different city skyline — for the swap gag)
- Grock chaotic backdrop (rockets, posts, X-shape graphics on loop)
- Production booth window silhouette (Cole's brief reveal — optional)

**Out of scope (later briefs):**
- Sets for characters not in pilot (Mistral's café, Sakura's lab, Perp's weather map, Lana's lifestyle backdrop, Deep's underlit office)
- Recurring exteriors (Tokyo skyline, Toronto skyline, Capitol building, etc.)
- One-off "real venue" cartoon backgrounds (cartoon White House, cartoon SF)

## Architecture

```
ComfyUI (local Apple Silicon MPS)
  └─ SDXL base + Octopath/Replaced/HD-2D style LoRAs + scene prompt
  └─ Outputs: 1024x1024 (or wider) PNG of the scene
       │
       ↓
parallax-maker (already installed)
  └─ Depth estimation → layered cards → inpaint behind each card
  └─ Exports: glTF 2.5D scene
       │
       ↓
Three.js + R3F runtime
  └─ Loads glTF as scene background
  └─ Camera positioned via GSAP / Theatre.js for cinematic moves
  └─ DragonBones characters layered on top via twopoint5d
```

## What You Read First

1. `paperclip-2-news/shared/character-visual-specs.md` — character lighting/color cues that scenes must respect
2. `paperclip-2-news/shared/show-bible.md` — house style for sets
3. `paperclip-2-news/backlog/pilot-episode-outline.md` — exactly which scenes the pilot needs
4. `paperclip-2-news/pipeline/tools/parallax-maker/README.md` — depth pipeline reference

## Style Anchor — All Scenes

Every scene in the show must feel like the same world. Visual recipe:

- **Octopath HD-2D base:** soft pixel detail, depth-of-field on background
  layers, atmospheric particles, cel-shaded surfaces
- **Replaced cinematic energy:** dramatic lighting, atmospheric fog,
  wide framing
- **Persona 5 punctuation:** angular geometric accents in the studio sets
  (newsroom architecture has slight comic-book exaggeration)
- **Color discipline:** each scene locks 2–3 dominant colors that work
  with the character(s) who appear there

## Per-Scene Workflow

For each scene, execute:

### Step 1 — Construct ComfyUI prompt

Use the same Pony Diffusion XL workflow as `CHARACTER_BUILD_BRIEF.md`,
adapted for environment generation:

```
score_9, score_8_up, score_7_up, masterpiece, best quality, source_anime,
no humans, [scene description: location, time of day, atmosphere],
[architectural / object details], [lighting + color palette],
octopath traveler hd-2d style, replaced cinematic style, persona 5
art direction, cel-shaded, depth of field, atmospheric, dramatic
lighting, [aspect ratio hint]

Negative prompt: low quality, deformed, busy, cluttered, photorealistic,
blurry, watermark, people, characters, text, logos
```

### Step 2 — Generate scene master

Run the workflow. Generate 4 variants. Save to:
```
pipeline/assets/source-images/scenes/<scene-name>/master-attempt-1-{1..4}.png
```

### Step 3 — Founder review gate (scene master)

Write `pipeline/assets/source-images/scenes/<scene-name>/READY_FOR_REVIEW.md`:

```markdown
# Scene Master Review — <scene-name>

**Variants:** master-attempt-1-{1..4}.png
**Spec:** Used in pilot for <segment>

To approve:
  cp master-attempt-1-N.png master.png
  touch SCENE_LOCKED.md

To regen with tweaks:
  Create REGEN.md with new prompt instructions

To escalate to manual:
  Create ESCALATE.md
```

Codex polls every 60s.

### Step 4 — Run parallax-maker on locked master

Once `SCENE_LOCKED.md` exists:

```bash
cd pipeline/tools/parallax-maker
source .venv/bin/activate
python main.py \
  --input ../../assets/source-images/scenes/<scene-name>/master.png \
  --output-dir ../../src/scenes/<scene-name>/ \
  --depth-model midas \
  --num-layers 4 \
  --inpaint-model auto
```

Output:
```
pipeline/src/scenes/<scene-name>/
  ├── model.gltf              # 2.5D layered scene
  ├── layer-0.png ... layer-3.png  # depth-sliced layers
  ├── depth-map.png           # depth visualization
  └── source.png              # original master copy
```

### Step 5 — Generate scene config.json

Each scene needs metadata so the Animation Engineer agent knows how to
load + frame it:

```json
{
  "name": "anchor-desk-main",
  "displayName": "Main Anchor Desk",
  "type": "studio_set",
  "gltf": "model.gltf",
  "layers": ["layer-0.png", "layer-1.png", "layer-2.png", "layer-3.png"],
  "default_camera": {
    "position": [0, 0, 5],
    "lookAt": [0, 0, 0],
    "fov": 45
  },
  "framings": {
    "wide": { "position": [0, 0, 8], "fov": 60 },
    "medium": { "position": [0, 0, 5], "fov": 45 },
    "close": { "position": [0, 0, 3], "fov": 30 }
  },
  "characters_supported": ["chloe", "cody"],
  "ambient_color": "#FAFAF5",
  "ambient_intensity": 0.7,
  "fog": { "color": "#0A0A0A", "near": 8, "far": 20 },
  "particles": null,
  "notes": "Used in top story, closing banter, two-shot segments"
}
```

Save to `pipeline/src/scenes/<scene-name>/config.json`.

### Step 6 — Smoke test (scene loads in R3F)

After all pilot scenes built, write `pipeline/src/compositions/SceneSmoke.tsx`:
- Loads each scene one at a time
- Camera does a 3-second pan
- Outputs `pipeline/assets/renders/scenes-smoke.mp4`

If it renders cleanly → Phase C complete.

## Pilot Scene Specifications

### 1. Anchor Desk Main

**Prompt cue:**
```
modern news studio anchor desk interior, sleek black and chrome desk in
center, large window backdrop showing abstract city skyline at dusk,
soft warm key lighting, geometric architectural lines on walls (slight
persona 5 angular accents), clean composition, tasteful color blocking
with cream and warm orange accents, octopath hd-2d cel-shaded style,
depth of field on background, no humans, full studio interior wide angle
```

**Used in:** Cold open (Cody), Top Story (Chloe), Closing Banter,
two-shot transitions.

**Framings needed:** wide, medium, close.

### 2. Anchor Desk Two-Shot

**Prompt cue:**
```
modern news studio anchor desk interior, two seats side by side at desk,
spacing for two anchors, large window backdrop with abstract city
skyline, neutral lighting on both seats, geometric architectural accents,
cream and warm orange + ChatGPT-coded green secondary palette, octopath
hd-2d style, depth of field, no humans, medium-wide framing
```

**Used in:** Chloe + Cody two-shots, top story handoff, closing banter.

### 3. Gem Field Backdrop A

**Prompt cue:**
```
generic american city street corner, mid-rise buildings in background,
afternoon sunlight, slight depth-of-field bokeh on far buildings,
unremarkable urban backdrop suitable for live news reporting, no
recognizable landmarks or logos, soft pastel color treatment, octopath
hd-2d cel-shaded, persona 5 architectural accents on building lines,
medium wide framing
```

**Used in:** Gem's first field-report frame.

### 4. Gem Field Backdrop B

**Prompt cue:**
```
DIFFERENT generic city street corner, distinguishable from previous
backdrop, slightly warmer color palette (sunset tone), different
building style, no recognizable landmarks, octopath hd-2d cel-shaded,
medium wide framing
```

**Used in:** Gem's continuity-error gag (backdrop swaps mid-segment
without explanation).

### 5. Grock Chaotic Backdrop

**Prompt cue:**
```
chaotic studio backdrop, large screens showing rockets launching, social
media post graphics, abstract X shapes, red and black dominant palette,
dramatic rim lighting, slightly menacing atmosphere, persona 5 angular
geometric accents, octopath hd-2d cel-shaded with persona 5 punctuation,
no humans, medium framing for character to stand in front of
```

**Used in:** Grock's tech & business beat, Grock's reluctant ad read.

### 6. Production Booth Window (optional)

**Prompt cue:**
```
glass-windowed production booth viewed from below, suspended above a
news studio floor, soft Microsoft-blue ambient lighting from inside the
booth, multiple computer screens visible through the glass, low-angle
shot, octopath hd-2d cel-shaded, no humans visible
```

**Used in:** Cole's voice-of-god moments — optional reveal frame.

## Cost: $0

All scene generation is local. No API costs.

## Time Estimate

- Per scene: ~30–60 min of founder iteration on prompts + parallax-maker run
- 6 pilot scenes: ~3–6 hours total founder time
- Codex orchestrates the parallax-maker runs, founder picks the best
  master per scene

## Build Order

1. Anchor Desk Main (visual baseline — sets the studio look)
2. Anchor Desk Two-Shot
3. Grock Chaotic Backdrop (most distinctive, validates style range)
4. Gem Field Backdrop A
5. Gem Field Backdrop B
6. Production Booth Window (optional)

After scenes 1–2 establish the studio aesthetic, the rest should match
naturally.

## What You Do NOT Do

- Do NOT generate sets for non-pilot characters (Mistral's café, etc.)
- Do NOT generate recurring exteriors yet (separate brief)
- Do NOT use real-place imagery that could trigger trademark/landmark issues
- Do NOT include any real company logos in scenes
- Do NOT modify show specs in `shared/`
- Do NOT auto-publish anywhere
- Do NOT commit to git (founder reviews + commits)

## When You're Done

Output:
1. Per-scene status (LOCKED, ESCALATED, FAILED)
2. List of scene assets generated
3. Smoke render path
4. Any decisions made
5. Any blockers
6. Recommendation for Phase D (additional scenes for characters
   introduced in episodes 2–6)
