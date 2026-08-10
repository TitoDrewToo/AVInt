# AI After Dark Animation Pipeline

This pipeline is the local, headless production setup for AI After Dark smoke tests: placeholder image/audio assets flow through parallax tooling, Rhubarb lip sync, Remotion, Three.js, React Three Fiber, and FFmpeg to prove the animation stack can render and composite a short MP4.

## System Requirements

- macOS on Apple Silicon
- Homebrew
- Python 3.11
- Node 20+; latest local Node is acceptable
- FFmpeg 6+; latest local FFmpeg is acceptable
- Inkscape 1.3+

## Setup

```bash
make setup
```

`make setup` installs Node dependencies, creates smoke-test fixtures, installs Rhubarb under `tools/rhubarb/`, and clones/installs parallax-maker under `tools/parallax-maker/`.

## Verify

```bash
make verify
```

The verification script checks tool versions, runs a parallax-maker DINOv2 depth smoke test, runs Rhubarb on the test WAV, renders a Remotion/R3F MP4, composites the WAV onto that MP4 with FFmpeg, and prints `Pipeline ready` only when the required outputs exist.

## Render

```bash
make render
```

This renders the 3-second Remotion smoke composition to `assets/renders/smoke-test.mp4`.

## Tool License Inventory

- parallax-maker: AGPL-3.0. Used as an unmodified local tool to produce video assets; video output is not treated as a derivative work. If we modify and distribute the tool, that fork must be open-source.
- Rhubarb Lip Sync: MIT.
- Remotion: AGPL-3.0 in v4; commercial license is available. Check usage tier before production monetization.
- Three.js, React Three Fiber, GSAP, FFmpeg, and Inkscape: permissive or standard open-source/tool licenses. Confirm final distribution needs before commercial release.

## Known Issues

- parallax-maker depth models may download on first run and can take several minutes.
- parallax-maker is installed editable, then constrained to `transformers<5` because `diffusers 0.34.x` fails to import with `transformers 5.x`.
- Apple Silicon MPS acceleration should be preferred, but CPU fallback is functional and slower.
- Inkscape may exist as a cask app without a shell binary; `make verify` expects `inkscape` on `PATH`.
- Rhubarb release packaging can change; setup installs the latest macOS asset it can identify from GitHub releases.
