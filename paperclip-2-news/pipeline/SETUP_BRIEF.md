# Codex Setup Brief — Paperclip-2 Animation Pipeline

You are setting up the local production pipeline for **AI After Dark**, a
satirical AI news YouTube channel. This is the prerequisites phase — install
tools, scaffold the project, verify everything works end-to-end with a
smoke test. Do NOT yet build agent runners or production code; that's the
next phase.

## Context You Need

- Host machine: macOS (Darwin), Apple Silicon
- Target output: stylized 2.5D parallax video (Octopath Traveler / Replaced
  cinematic 2.5D world + Persona 5 anime character art on top)
- Pipeline must be **fully programmatic / headless** — agents will drive it
- Operator is solo founder; setup must be reproducible from `make setup`
- Working directory: `/Users/avin/Documents/AVINTELLIGENCE/avint/paperclip-2-news/pipeline/`
- This sits beside the main Next.js avint app but is its own self-contained
  Node + Python project. Do NOT entangle with avint's Next.js dependencies.

## Architecture — What You're Building Toward

```
Backgrounds:  Midjourney (manual) → parallax-maker → glTF 2.5D scene
Characters:   Midjourney (manual) → Inkscape trace → SVG layered rig
Lip-sync:     Voice WAV → Rhubarb Lip-Sync → mouth-shape JSON timeline
Render:       Three.js + React Three Fiber + Remotion → MP4 frames
UI overlays:  Remotion (Persona-5-style kinetic typography)
Composite:    FFmpeg → final MP4
```

Your job in this brief: install + verify each layer. Do NOT produce a finished
video. The smoke test is end-to-end with placeholder assets.

---

## Step 1 — Project scaffold

Create the following directory structure:

```
paperclip-2-news/pipeline/
├── package.json                  # Node deps (Remotion, Three.js, R3F, GSAP)
├── tsconfig.json                 # TypeScript config
├── pyproject.toml                # Python deps (parallax-maker helpers)
├── .python-version               # Pin Python 3.11
├── .gitignore
├── README.md                     # Setup + run instructions
├── Makefile                      # `make setup`, `make verify`, `make render`
├── src/
│   ├── characters/               # SVG character rig parts (empty for now)
│   ├── scenes/                   # Post-parallax-maker glTF scenes (empty)
│   ├── components/               # React Three Fiber + Remotion components
│   │   ├── Character.tsx         # Stub: renders a character SVG with mouth swap
│   │   ├── ParallaxScene.tsx     # Stub: loads a glTF scene
│   │   └── KineticOverlay.tsx    # Stub: Persona-5-style lower thirds
│   └── compositions/             # Per-shot Remotion compositions
│       └── SmokeTest.tsx         # Renders a 3-second test composition
├── tools/                        # External tool installs (gitignored)
│   ├── parallax-maker/           # Cloned repo
│   └── rhubarb/                  # Binary
├── assets/                       # Source + intermediate (mostly gitignored)
│   ├── source-images/            # Midjourney PNG downloads
│   ├── audio/                    # Voice WAVs
│   ├── music/                    # Music beds
│   ├── renders/                  # Output MP4s
│   └── smoke-test/               # Test fixtures (kept in git, small files)
│       ├── test-scene.png        # A 1024x1024 scene for parallax-maker
│       └── test-voice.wav        # A 3-second voice line for Rhubarb
└── scripts/
    ├── setup.sh                  # One-command setup (idempotent)
    ├── verify.sh                 # End-to-end smoke test
    └── render-shot.ts            # Per-shot render orchestrator (stub)
```

`.gitignore` should exclude: `tools/`, `assets/source-images/`,
`assets/audio/`, `assets/music/`, `assets/renders/`, `node_modules/`,
`.venv/`, `__pycache__/`. Keep `assets/smoke-test/`.

---

## Step 2 — System dependencies (macOS, Apple Silicon)

Verify or install via Homebrew. Print versions for the report.

```bash
brew install python@3.11 ffmpeg inkscape
brew install --cask --no-quarantine inkscape || true
```

Verify:
- `python3.11 --version` → 3.11.x
- `ffmpeg -version` → 6.x or 7.x
- `inkscape --version` → 1.3+
- `node --version` → 20.x or 22.x (assume already installed; if not, `brew install node@20`)

If any version mismatch, halt and report.

---

## Step 3 — Rhubarb Lip-Sync install

Download the macOS release of Rhubarb Lip-Sync v1.13.0 (or latest):
- URL: https://github.com/DanielSWolf/rhubarb-lip-sync/releases
- Place binary in `tools/rhubarb/rhubarb`
- Make executable: `chmod +x tools/rhubarb/rhubarb`
- Verify: `tools/rhubarb/rhubarb --version`

License: MIT. Safe for commercial use.

---

## Step 4 — Parallax-Maker install

Clone the repo into `tools/parallax-maker/` and install in a Python 3.11 venv:

```bash
git clone https://github.com/provos/parallax-maker.git tools/parallax-maker
cd tools/parallax-maker
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Notes:
- License is **AGPL-3.0**. We use it as a local tool to produce video output;
  output is not derivative work. We do NOT modify the source. If we ever
  modify, that fork must be open-source. Document this in `pipeline/README.md`.
- Depth models (Midas / ZoeDepth / DINOv2) auto-download on first use.
  Trigger a single sample run to pre-download.
- Apple Silicon: confirm MPS (Metal Performance Shaders) acceleration works.
  If torch falls back to CPU, depth inference is slow but functional.

Verify with sample image: process `assets/smoke-test/test-scene.png` and
confirm a glTF or layered-PNG output appears in a `tools/parallax-maker/output/`
or equivalent path.

---

## Step 5 — Node project + Remotion + Three.js + R3F

In `pipeline/`:

```bash
npm init -y
npm install --save react@18 react-dom@18 typescript @types/react @types/react-dom
npm install --save remotion @remotion/cli @remotion/three
npm install --save three @react-three/fiber @react-three/drei
npm install --save gsap
```

Create a minimal `tsconfig.json` (Remotion-friendly).

Create `src/compositions/SmokeTest.tsx`:
- 3-second composition at 1920x1080, 30fps
- Renders a basic Three.js scene with a colored cube and a text overlay
- Demonstrates Remotion + R3F integration works

Add to `package.json` scripts:
```
"render:smoke": "remotion render src/compositions/SmokeTest.tsx out=assets/renders/smoke-test.mp4"
```

Verify: `npm run render:smoke` produces a valid MP4.

---

## Step 6 — Smoke test the end-to-end pipeline

Write `scripts/verify.sh` that:

1. Checks all binaries (`ffmpeg`, `inkscape`, `node`, `python3.11`,
   `tools/rhubarb/rhubarb`)
2. Activates the parallax-maker venv and runs depth on `assets/smoke-test/test-scene.png`
3. Runs Rhubarb on `assets/smoke-test/test-voice.wav`, prints the JSON timeline
4. Runs `npm run render:smoke` and confirms `assets/renders/smoke-test.mp4` exists
5. Uses FFmpeg to overlay the voice WAV onto the smoke-test MP4
6. Prints "✅ Pipeline ready" or lists what failed

Make `verify.sh` executable and idempotent.

---

## Step 7 — Smoke test fixtures

Provide `assets/smoke-test/test-scene.png` and `assets/smoke-test/test-voice.wav`.

If you can't generate them, leave placeholders and note in the report:
- `test-scene.png`: any 1024x1024 PNG with foreground/background depth
  (e.g., a person in front of a wall). If you have nothing, use any
  Creative Commons sample.
- `test-voice.wav`: any 2–4 second mono WAV at 16 or 24kHz with clear
  speech. If nothing available, use macOS `say "testing the pipeline"`
  piped to AIFF then converted to WAV via FFmpeg.

---

## Step 8 — Documentation

Write `pipeline/README.md` covering:

1. What this pipeline does (one paragraph)
2. System requirements (macOS, Apple Silicon, Python 3.11+, Node 20+)
3. Setup: `make setup` (calls `scripts/setup.sh`)
4. Verify: `make verify` (calls `scripts/verify.sh`)
5. Tool license inventory:
   - parallax-maker: AGPL-3.0 (local-use, video-output → no obligation;
     do not modify-and-distribute)
   - Rhubarb: MIT
   - Remotion: AGPL-3.0 in v4 (commercial license available; check usage tier)
   - Three.js, R3F, GSAP, FFmpeg, Inkscape: permissive
6. Known issues / troubleshooting (depth model first-run download time,
   MPS quirks on Apple Silicon, etc.)

---

## Step 9 — Makefile

Provide a `Makefile` with these targets:

```
setup:    Install all dependencies (calls scripts/setup.sh)
verify:   End-to-end smoke test (calls scripts/verify.sh)
clean:    Remove tools/, node_modules/, .venv/, renders/
help:     List targets
```

---

## Final report

When done, output:

1. Versions of every installed tool
2. Result of `make verify`
3. Any blockers (e.g., parallax-maker dependency conflict, MPS issue)
4. Any decisions you made (e.g., chose Rhubarb v1.13.0 because v2 is in beta)
5. Estimated time to first real video (educated guess given what works)

Do NOT:
- Write production agent code
- Generate actual character art or scenes
- Configure Anthropic / ElevenLabs / Midjourney API keys (the founder
  will handle those separately)
- Modify any files outside `paperclip-2-news/pipeline/`
- Commit anything (the founder reviews + commits)

Constraints:
- Be idempotent: running `make setup` twice should not break anything
- Be verbose: log what you're doing
- Fail loudly: exit non-zero on any error
- No hidden state: every dependency goes in `package.json` / `pyproject.toml`
  / a documented binary path

If anything is ambiguous, halt and ask the founder rather than guessing.
