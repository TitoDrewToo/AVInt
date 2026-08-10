#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAILURES=()

log() {
  printf "\n==> %s\n" "$1"
}

fail() {
  FAILURES+=("$1")
  printf "ERROR: %s\n" "$1" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "missing command: $1"
    return 1
  fi
  return 0
}

log "Checking binaries"
require_cmd python3.11 || true
require_cmd ffmpeg || true
require_cmd inkscape || true
require_cmd node || true
if [ ! -x tools/rhubarb/rhubarb ]; then
  fail "missing Rhubarb binary at tools/rhubarb/rhubarb"
fi

if [ "${#FAILURES[@]}" -eq 0 ]; then
  python3.11 --version
  ffmpeg -version | head -n 1
  inkscape --version
  node --version
  tools/rhubarb/rhubarb --version
fi

log "Running parallax-maker smoke test"
if [ -d tools/parallax-maker ] && [ -f assets/smoke-test/test-scene.png ]; then
  cd "$ROOT/tools/parallax-maker"
  source .venv/bin/activate
  PARALLAX_STATE="appstate-smoke"
  PARALLAX_OUT="$ROOT/tools/parallax-maker/output"
  rm -rf "$PARALLAX_STATE" "$PARALLAX_OUT/smoke"
  mkdir -p "$PARALLAX_OUT"
  set +e
  python - <<'PY'
from pathlib import Path
import numpy as np
from PIL import Image

from parallax_maker.controller import AppState
from parallax_maker.slice import ImageSlice

root = Path.cwd()
state_dir = root / "appstate-smoke"
source_image = root.parent.parent / "assets" / "smoke-test" / "test-scene.png"

state_dir.mkdir(exist_ok=True)
image = Image.open(source_image).convert("RGBA")

state = AppState()
state.filename = state_dir.name
state.imgData = image.convert("RGB")
state.num_slices = 1
state.imgThresholds = [0, 255]
state.depth_model_name = "dinov2"

slice_image = np.array(image)
state.image_slices = [
    ImageSlice(
        image=slice_image,
        depth=127,
        filename=str(state_dir / "image_slice_0.png"),
        positive_prompt="smoke test image layer",
        negative_prompt="",
    )
]
state.to_file(state_dir)
PY
  PARALLAX_STATUS=$?
  if [ "$PARALLAX_STATUS" -eq 0 ]; then
    parallax-gltf-cli -i "$PARALLAX_STATE" -o "$PARALLAX_OUT/smoke" -d
    PARALLAX_STATUS=$?
  fi
  set -e
  cd "$ROOT"
  if [ "$PARALLAX_STATUS" -ne 0 ]; then
    fail "parallax-maker smoke run failed"
  elif ! find "$PARALLAX_OUT" -type f \( -name "*.gltf" -o -name "*.glb" -o -name "*.png" \) | grep -q .; then
    fail "parallax-maker produced no glTF/GLB/layered PNG output"
  else
    find "$PARALLAX_OUT" -type f | sed 's#^#parallax output: #'
  fi
else
  fail "parallax-maker directory or test-scene.png missing"
fi

log "Running Rhubarb smoke test"
if [ -x tools/rhubarb/rhubarb ] && [ -f assets/smoke-test/test-voice.wav ]; then
  mkdir -p assets/renders
  if tools/rhubarb/rhubarb -f json -o assets/renders/test-voice-mouth.json assets/smoke-test/test-voice.wav; then
    cat assets/renders/test-voice-mouth.json
  else
    fail "Rhubarb smoke run failed"
  fi
else
  fail "Rhubarb or test-voice.wav missing"
fi

log "Rendering Remotion smoke test"
if npm run render:smoke; then
  if [ ! -f assets/renders/smoke-test.mp4 ]; then
    fail "Remotion render completed but smoke-test.mp4 is missing"
  fi
else
  fail "Remotion smoke render failed"
fi

log "Compositing voice WAV with FFmpeg"
if [ -f assets/renders/smoke-test.mp4 ] && [ -f assets/smoke-test/test-voice.wav ]; then
  ffmpeg -hide_banner -loglevel error -y \
    -i assets/renders/smoke-test.mp4 \
    -i assets/smoke-test/test-voice.wav \
    -c:v copy -c:a aac -shortest \
    assets/renders/smoke-test-with-audio.mp4
  test -f assets/renders/smoke-test-with-audio.mp4 || fail "FFmpeg composite output missing"
else
  fail "missing MP4 or WAV for FFmpeg composite"
fi

if [ "${#FAILURES[@]}" -gt 0 ]; then
  printf "\nPipeline verification failed:\n" >&2
  for item in "${FAILURES[@]}"; do
    printf "  - %s\n" "$item" >&2
  done
  exit 1
fi

printf "\n✅ Pipeline ready\n"
