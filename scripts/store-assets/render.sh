#!/usr/bin/env bash
# Renders Play Store graphics into store-assets/ with headless Chrome.
# Needs the dev server running (npm run dev) for the screenshots.
#   bash scripts/store-assets/render.sh [dev-server-url]
set -euo pipefail
cd "$(dirname "$0")/../.."
CHROME="${CHROME:-/c/Program Files/Google/Chrome/Application/chrome.exe}"
DEV="${1:-http://localhost:5173}"
OUT=store-assets
PROFILE="$(mktemp -d)"
mkdir -p "$OUT"
here="$(cd scripts/store-assets && pwd -W 2>/dev/null || pwd)"

shot() { # out width height scale url
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --user-data-dir="$PROFILE" \
    --force-device-scale-factor="$4" --window-size="$2,$3" --virtual-time-budget=6000 \
    --screenshot="$(pwd -W 2>/dev/null || pwd)/$OUT/$1" "$5" >/dev/null 2>&1
}

shot icon-512.png 512 512 1 "file:///$here/icon.html"
shot feature-graphic-1024x500.png 1024 500 1 "file:///$here/feature.html"
for scene in play rush bomb big; do
  shot "screenshot-$scene.png" 540 960 2 "$DEV/scripts/store-assets/stage.html?s=$scene"
done
rm -rf "$PROFILE"
ls -la "$OUT"
