# Codex Character-Build Brief — Phase A (Episode 1 Cast, Local Game-Dev Pipeline)

**Prerequisites:**
- `pipeline/SETUP_BRIEF.md` complete; `make verify` passes ✅
- `pipeline/src/components/Character.tsx` framework exists
- Apple Silicon Mac (M1/M2/M3/M4) with at least 16GB RAM, 30GB free disk

If any prerequisite missing, halt and report.

## Goal

Build the **4 Episode 1 main characters** as DragonBones-rigged characters,
loaded by the runtime via twopoint5d on Three.js / R3F. Fully local, zero
API cost.

**Phase A scope:** Chloe Antropova, Cody Apnea, Gem Bardelli, Grock Maskovich.

**Out of scope:** Tier 2/3 cast (separate Phase B brief), scenes (separate
Phase C brief).

## Architecture (locked)

```
ComfyUI (local, on Apple Silicon MPS)
  └─ SDXL base + Persona 5 LoRA + character description prompt
  └─ Outputs: PNG character master + variations
       │
       ↓
DragonBones desktop (local, founder GUI work)
  └─ Import PNG, rig with bones + mesh, define states
  └─ Exports: <name>.json + <name>_tex.png + <name>_tex.json
       │
       ↓
twopoint5d on Three.js + R3F
  └─ Loads DragonBones JSON via DragonBonesJS runtime
  └─ Renders character as 2.5D sprite in scene
  └─ Driven by Rhubarb mouth-cue timeline for lip sync
       │
       ↓
Remotion compositing → FFmpeg → MP4
```

## What You Read First

1. `paperclip-2-news/shared/character-visual-specs.md` — visual design source of truth
2. `paperclip-2-news/shared/cast.md` — character context
3. `paperclip-2-news/shared/legal-and-parody-guardrails.md` — parody rules
4. `paperclip-2-news/pipeline/src/components/Character.tsx` — current framework
5. https://github.com/comfyanonymous/ComfyUI/blob/master/README.md — install reference
6. https://github.com/DragonBones/DragonBonesJS — runtime reference
7. https://github.com/spearwolf/twopoint5d — sprite renderer

## Step 1 — Install ComfyUI locally (Apple Silicon)

Install ComfyUI in `pipeline/tools/comfyui/`:

```bash
cd paperclip-2-news/pipeline/tools
git clone https://github.com/comfyanonymous/ComfyUI.git comfyui
cd comfyui
python3.11 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install torch torchvision torchaudio  # MPS-supported on Apple Silicon
pip install -r requirements.txt
```

Verify:
```bash
python main.py --listen 127.0.0.1 --port 8188
# Should serve at http://127.0.0.1:8188
# Confirm "MPS" appears in startup log (Apple Silicon GPU acceleration)
# Ctrl-C to stop
```

If MPS not detected, fall back to CPU and warn (slower but functional).

## Step 2 — Download SDXL base + Persona 5 LoRA

ComfyUI model directories:
- `comfyui/models/checkpoints/` — base SDXL model
- `comfyui/models/loras/` — LoRA adapters

Download the base SDXL model:
```bash
cd comfyui/models/checkpoints
# Pony Diffusion XL v6 (best for anime/cartoon character generation)
wget https://huggingface.co/AstraliteHeart/pony-diffusion-v6-xl/resolve/main/v6.safetensors -O ponyDiffusionV6XL.safetensors

# Alternative: Animagine XL 3.1 (cleaner anime aesthetic)
# wget https://huggingface.co/cagliostrolab/animagine-xl-3.1/resolve/main/animagine-xl-3.1.safetensors -O animagineXL31.safetensors
```

Download Persona 5 style LoRA from Civitai:
```bash
cd comfyui/models/loras
# Search Civitai for "Persona 5" LoRAs filtered by SDXL/Pony base
# As of latest survey, look for community LoRAs tagged "Persona 5", "Atlus", or "Phantom Thieves style"
# Civitai requires login for some downloads; if blocked, document and proceed with vanilla anime
# Example URL pattern (verify current):
# wget https://civitai.com/api/download/models/<model-id> -O persona5-style-xl.safetensors
```

If Civitai download requires login, halt and ask founder to download
manually + drop in `comfyui/models/loras/persona5-style-xl.safetensors`.

Smoke-test: load ComfyUI, verify both checkpoint and LoRA appear in the
model dropdowns.

## Step 3 — Build the ComfyUI generation workflow

Create `pipeline/tools/comfyui/workflows/character-gen.json`. This is a
ComfyUI workflow graph (JSON format) that:

1. Loads the Pony Diffusion XL checkpoint
2. Loads the Persona 5 LoRA (if available)
3. Takes a positive prompt + negative prompt as input
4. Generates 4 variants per run
5. Outputs to `pipeline/assets/source-images/<character>/master-attempt-N-{1..4}.png`

ComfyUI workflow JSON structure (skeleton — Codex builds the full graph):

```json
{
  "1": { "class_type": "CheckpointLoaderSimple", "inputs": { "ckpt_name": "ponyDiffusionV6XL.safetensors" } },
  "2": { "class_type": "LoraLoader", "inputs": { "lora_name": "persona5-style-xl.safetensors", "strength_model": 0.8, "strength_clip": 0.8 } },
  "3": { "class_type": "CLIPTextEncode", "inputs": { "text": "<positive prompt>" } },
  "4": { "class_type": "CLIPTextEncode", "inputs": { "text": "<negative prompt>" } },
  "5": { "class_type": "EmptyLatentImage", "inputs": { "width": 1024, "height": 1536, "batch_size": 4 } },
  "6": { "class_type": "KSampler", "inputs": { "steps": 30, "cfg": 7.0, "sampler_name": "dpmpp_2m", "scheduler": "karras" } },
  "7": { "class_type": "VAEDecode" },
  "8": { "class_type": "SaveImage", "inputs": { "filename_prefix": "<character>/master" } }
}
```

Make the workflow callable via ComfyUI's HTTP API:

```bash
curl -X POST http://127.0.0.1:8188/prompt \
  -H "Content-Type: application/json" \
  -d '{ "prompt": <workflow-json-with-prompts-substituted> }'
```

## Step 4 — Generate per-character master images

For each Episode 1 character, construct an SDXL prompt:

```
Pony Diffusion XL prompt template:
score_9, score_8_up, score_7_up, masterpiece, best quality, source_anime,
rating_safe, 1girl/1boy, [character description from visual specs],
[hair details], [skin details], [eye color + expression],
[outfit primary + accents], [accessories],
plain white background, full body standing, character reference sheet,
persona 5 art style, atlus character design, cel-shaded, dramatic
lighting, sharp lines

Negative prompt: low quality, worst quality, deformed, multiple people,
multiple characters, busy background, real photo, photorealistic, realistic,
3D render, blurry, watermark
```

Use the existing prompts in `paperclip-2-news/backlog/midjourney-prompts-episode-1.md`
as creative reference (translate from Midjourney syntax to SDXL/Pony syntax).

Run the workflow for each character, save outputs to:
```
pipeline/assets/source-images/<character>/master-attempt-1-{1,2,3,4}.png
```

If a generation looks off-vibe, regenerate up to 3 attempts with prompt tweaks.

## Step 5 — Founder review gate 1 (master selection)

After 4 master variants exist for a character, write
`pipeline/assets/source-images/<character>/READY_FOR_MASTER_REVIEW.md`:

```markdown
# Master Review — <character-name>

**4 variants generated:** master-attempt-1-1.png ... master-attempt-1-4.png
**Spec reference:** shared/character-visual-specs.md → <character>

To approve a variant:
  cp master-attempt-1-N.png master.png
  touch MASTER_LOCKED.md
  (Codex will detect MASTER_LOCKED.md within 60s and proceed.)

To request regen with prompt tweaks:
  Create REGEN_MASTER.md with new prompt instructions.
  Codex re-runs Step 4 with the tweaks.

To escalate to manual generation:
  Create ESCALATE_TO_MANUAL.md.
  Codex marks deferred and moves to next character.
```

Codex polls every 60 seconds for `MASTER_LOCKED.md` / `REGEN_MASTER.md` /
`ESCALATE_TO_MANUAL.md` and acts accordingly.

## Step 6 — DragonBones rigging (FOUNDER does this manually)

Once master.png exists for a character:

1. Founder opens **DragonBones Pro** (free download from
   https://dragonbones.com/en/download.html, install on Mac)
2. New project → Import master.png
3. Slice the character into bone-able parts:
   - Head + hair as one piece
   - Torso
   - Upper arms, lower arms, hands
   - (Optional) lower body if visible
4. Add bones (skeleton) for face + body
5. Define mesh deformation for face (mouth + eyes can be replaced via
   slot mechanism)
6. Create slots for swappable parts:
   - `mouth` slot — load mouth-A through mouth-X PNGs
   - `eyes` slot — load eye-open, eye-half, eye-closed, eye-aside PNGs
7. (Optional) Define bone animations for poses (neutral, gesturing, leaning)
8. Export DragonBones project to:
   ```
   pipeline/src/characters/<character>/
     ├── <character>_ske.json          # Skeleton + animation data
     ├── <character>_tex.json          # Texture atlas metadata
     └── <character>_tex.png           # Texture atlas image
   ```

DragonBones tutorial reference: https://docs.dragonbones.com/

**Founder time:** ~1–3 hours per character first time, ~30–60 min after
pattern is established.

## Step 7 — Mouth + eye state PNGs (Codex generates from master + ComfyUI)

While founder works on rigging, Codex generates the per-state PNGs needed
to populate the DragonBones slots:

For each character, run additional ComfyUI generations using image-to-image
mode with the locked master.png as the reference, generating:
- 7 mouth shapes (Rhubarb A, B, C, D, E, F + X for silence)
- 4 eye states (open, half, closed, aside)

Save to:
```
pipeline/assets/source-images/<character>/states/
  ├── mouth-A.png ... mouth-X.png
  └── eye-open.png ... eye-aside.png
```

Founder imports these into DragonBones as slot textures during rigging.

If image-to-image consistency is poor (different character every time),
fall back to: founder draws the mouth/eye states manually in Inkscape
or Procreate as small PNG patches over the master face.

## Step 8 — Generate config.json (after rigging exported)

Once founder exports DragonBones files, Codex generates the matching
`config.json`:

```json
{
  "name": "chloe",
  "displayName": "Chloe Antropova",
  "lowerThird": "CHLOE ANTROPOVA — ANTHROPOMORPHIC NEWS",
  "primaryColor": "#FF8C42",
  "accentColor": "#FFF8DC",
  "lighting": { "key": "warm-even", "rim": "soft-warm" },
  "rig": {
    "type": "dragonbones",
    "skeleton": "chloe_ske.json",
    "atlas": "chloe_tex.json",
    "texture": "chloe_tex.png"
  },
  "armature": "chloe_armature",
  "defaultAnimation": "idle",
  "mouthSlot": "mouth",
  "eyeSlot": "eyes",
  "particles": null
}
```

Pull color and lower-third details from `character-visual-specs.md` and
`cast.md`.

## Step 9 — Update Character.tsx framework (DragonBones runtime integration)

The current `Character.tsx` stub uses static SVG layers. Replace with
DragonBones runtime integration:

```bash
cd pipeline
npm install @react-three/fiber three
npm install dragonbones-js  # OR pixi-dragonbones if going PixiJS route
npm install @spearwolf/twopoint5d @spearwolf/twopoint5d-r3f
```

Rewrite `pipeline/src/components/Character.tsx` to:
1. Load the DragonBones JSON + atlas via DragonBonesJS
2. Render the armature using twopoint5d sprite primitives in R3F
3. Expose props: `mouthState`, `eyeState`, `animation`, `position`, `scale`
4. Update slots based on props (slot.display = atlas[mouthState], etc.)

Build a smoke test composition `pipeline/src/compositions/CharacterSmoke.tsx`:
- Loads chloe character
- Plays test voice WAV (use macOS `say` to generate)
- Drives mouth state via Rhubarb mouth-cue timeline
- Renders 3 seconds at 30fps
- Outputs `pipeline/assets/renders/chloe-smoke.mp4`

If smoke render shows mouth swapping in time with audio → framework works.

## Step 10 — Per-character review gate 2

After Codex generates state PNGs, founder rigs in DragonBones, and Codex
generates config.json, write
`pipeline/src/characters/<character>/READY_FOR_REVIEW.md`:

```markdown
# Character Build Complete — <character-name>

**Files:**
- master.png (Step 5 locked)
- states/mouth-{A,B,C,D,E,F,X}.png + eye-{open,half,closed,aside}.png
- <character>_ske.json + _tex.json + _tex.png (DragonBones export)
- config.json

**Smoke render:** pipeline/assets/renders/<character>-smoke.mp4

To approve: touch CHARACTER_LOCKED.md
To reject: create REJECT.md with notes; Codex restarts from Step 4.
```

## Build order

1. **Chloe Antropova** (sets visual baseline + DragonBones template)
2. **Cody Apnea**
3. **Gem Bardelli**
4. **Grock Maskovich**

After Chloe's rig is exported, subsequent characters can reuse the rig
template (skeleton structure) — only assets and slot textures change.
This is why first character is slow, rest accelerate.

## Final smoke test (after all 4 characters)

After all 4 characters have `CHARACTER_LOCKED.md`:

1. Run `pipeline/src/compositions/CastSmoke.tsx`:
   - All 4 characters on screen sequentially
   - Each speaks one line via Rhubarb-driven lip sync
   - 12-second composition
   - Output: `pipeline/assets/renders/cast-smoke.mp4`
2. If render works → Phase A complete
3. If render fails → debug Character.tsx framework, DragonBones runtime
   integration, or asset issues

## Cost: $0

This pipeline runs entirely locally. No API costs. Only ongoing cost is
electricity + your time.

## What You Do NOT Do

- Do NOT use Replicate, OpenAI, or any other paid image-gen API
- Do NOT generate Tier 2 / Tier 3 characters (Phase A scope)
- Do NOT generate scenes / sets / exteriors (separate brief)
- Do NOT modify show specs in `shared/`
- Do NOT auto-publish anywhere
- Do NOT commit to git (founder reviews + commits)
- Do NOT skip founder review gates
- Do NOT install DragonBones for the founder (it's a manual GUI app
  install — instruct founder, don't try to script it)
- Do NOT modify the `Character.tsx` stub destructively before founder
  has reviewed your DragonBones runtime integration

## When You're Done

Output:
1. ComfyUI install path + verified working
2. SDXL + LoRA download status
3. Per-character status (LOCKED, ESCALATED, FAILED)
4. Cast smoke render path
5. Any decisions you made (e.g., "couldn't get Persona 5 LoRA from
   Civitai — used vanilla anime style instead")
6. Any blockers (e.g., "MPS slow — generation takes 90s/image; founder
   may want to consider quantized model")
7. Recommendation for Phase B (continue same workflow vs. adjust)

## If founder doesn't want to learn DragonBones

If after starting, founder finds DragonBones too steep, fall back path:
- Skip rigging
- Use Codex's state PNGs directly as static layer swap (current SVG-style
  approach but with PNG instead of SVG)
- Lower visual quality but faster to ship

Note this fallback in the final report; founder can decide which path to
commit to for Phase B.
