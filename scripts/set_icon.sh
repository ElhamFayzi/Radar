#!/bin/bash
# Re-applies Radar's custom Finder icon and hides Radar.command's file
# extension. macOS extended attributes (custom icons, the "hide extension"
# flag) aren't tracked by git, so a fresh clone — or any `git checkout` that
# rewrites Radar.command — needs this re-run once. The .icns itself lives at
# app/static/icon/Radar.icns and *is* version-controlled.
set -e
cd "$(dirname "$0")/.."

if ! command -v fileicon >/dev/null 2>&1; then
  echo "Installing fileicon (via Homebrew)..."
  brew install fileicon
fi

fileicon set Radar.command app/static/icon/Radar.icns

SETFILE="$(xcrun -find SetFile 2>/dev/null || echo /Library/Developer/CommandLineTools/usr/bin/SetFile)"
"$SETFILE" -a E Radar.command

echo "Done — Radar.command now shows its custom icon with the extension hidden."
