#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() {
  printf "\n==> %s\n" "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf "ERROR: missing required command: %s\n" "$1" >&2
    exit 1
  fi
}

log "Ensuring macOS system dependencies"
require_cmd brew
brew install python@3.11 ffmpeg
brew install --cask inkscape || true

log "Creating directory structure"
mkdir -p \
  src/characters \
  src/scenes \
  src/components \
  src/compositions \
  tools/rhubarb \
  assets/source-images \
  assets/audio \
  assets/music \
  assets/renders \
  assets/smoke-test

log "Checking system tool versions"
python3.11 --version
ffmpeg -version | head -n 1
inkscape --version
node --version

log "Installing Node dependencies"
npm install

log "Creating smoke-test fixtures"
if [ ! -f assets/smoke-test/test-scene.png ]; then
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "nullsrc=s=1024x1024:d=1" \
    -vf "geq=r='28+90*X/W':g='16+90*Y/H':b='64+110*(1-Y/H)',drawbox=x=90:y=110:w=300:h=760:color=0x0b1020@0.85:t=fill,drawbox=x=560:y=150:w=310:h=520:color=0xe91f44@0.75:t=fill,drawbox=x=330:y=500:w=380:h=320:color=0x49a7ff@0.65:t=fill,drawbox=x=0:y=860:w=1024:h=164:color=0x08080c@0.9:t=fill" \
    -frames:v 1 assets/smoke-test/test-scene.png
fi

if [ ! -f assets/smoke-test/test-voice.wav ]; then
  TMP_AIFF="$(mktemp -t ai-after-dark-voice.XXXXXX).aiff"
  say -o "$TMP_AIFF" "testing the animation pipeline"
  ffmpeg -hide_banner -loglevel error -y -i "$TMP_AIFF" -ac 1 -ar 24000 assets/smoke-test/test-voice.wav
  rm -f "$TMP_AIFF"
fi

log "Installing Rhubarb Lip Sync"
if [ ! -x tools/rhubarb/rhubarb ] || [ ! -d tools/rhubarb/res ]; then
  rm -rf tools/rhubarb
  mkdir -p tools/rhubarb
  TMP_DIR="$(mktemp -d)"
  RELEASE_JSON="$TMP_DIR/rhubarb-release.json"
  curl -fsSL "https://api.github.com/repos/DanielSWolf/rhubarb-lip-sync/releases/latest" -o "$RELEASE_JSON"
  ASSET_URL="$(python3.11 - "$RELEASE_JSON" <<'PY'
import json
import sys

data = json.load(open(sys.argv[1], "r", encoding="utf-8"))
assets = data.get("assets", [])
for asset in assets:
    name = asset.get("name", "").lower()
    url = asset.get("browser_download_url", "")
    if url and name.endswith(".zip") and any(token in name for token in ("mac", "osx", "darwin")):
        print(url)
        break
else:
    raise SystemExit("No macOS Rhubarb zip asset found in latest release")
PY
)"
  curl -fL "$ASSET_URL" -o "$TMP_DIR/rhubarb.zip"
  unzip -q "$TMP_DIR/rhubarb.zip" -d "$TMP_DIR/extract"
  RHUBARB_BIN="$(find "$TMP_DIR/extract" -type f -name rhubarb | head -n 1)"
  if [ -z "$RHUBARB_BIN" ]; then
    printf "ERROR: Rhubarb binary not found in release archive\n" >&2
    exit 1
  fi
  cp "$RHUBARB_BIN" tools/rhubarb/rhubarb
  chmod +x tools/rhubarb/rhubarb
  RHUBARB_ROOT="$(dirname "$RHUBARB_BIN")"
  if [ -d "$RHUBARB_ROOT/res" ]; then
    cp -R "$RHUBARB_ROOT/res" tools/rhubarb/res
  else
    RES_DIR="$(find "$TMP_DIR/extract" -type d -name res | head -n 1)"
    if [ -z "$RES_DIR" ]; then
      printf "ERROR: Rhubarb resources not found in release archive\n" >&2
      exit 1
    fi
    cp -R "$RES_DIR" tools/rhubarb/res
  fi
  rm -rf "$TMP_DIR"
fi
tools/rhubarb/rhubarb --version

log "Installing parallax-maker"
if [ ! -d tools/parallax-maker/.git ]; then
  rm -rf tools/parallax-maker
  git clone https://github.com/provos/parallax-maker.git tools/parallax-maker
fi

cd tools/parallax-maker
if [ ! -d .venv ]; then
  python3.11 -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
pip install -e .
pip install "transformers<5"
python - <<'PY'
try:
    import torch
    print(f"torch: {torch.__version__}")
    print(f"mps_available: {torch.backends.mps.is_available()}")
except Exception as exc:
    print(f"torch_check_failed: {exc}")
PY

log "Setup complete"
