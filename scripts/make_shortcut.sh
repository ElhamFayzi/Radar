#!/bin/bash
# Creates a Finder alias to Radar.command in another folder (default: Desktop)
# for quick launching, with the custom icon applied directly to the alias.
#
# Aliases resolve back to the real Radar.command when opened, so the shortcut
# still finds the project and runs it correctly no matter where you put it.
# But Finder does NOT copy a target's custom-icon flag onto a new alias, so
# without this script the alias shows a generic icon even though the real
# Radar.command has the Radar one. Stamping the icon onto the alias itself
# (same fileicon + SetFile trick as set_icon.sh) fixes that.
set -e
cd "$(dirname "$0")/.."

DEST="${1:-$HOME/Desktop}"

if ! command -v fileicon >/dev/null 2>&1; then
  echo "Installing fileicon (via Homebrew)..."
  brew install fileicon
fi

if [ -e "$DEST/Radar.command" ] || [ -e "$DEST/Radar" ]; then
  echo "A Radar shortcut already exists in $DEST — remove it first if you want a fresh one."
  exit 1
fi

# Radar.command's extension is hidden, so Finder names the new alias after its
# visible name ("Radar", no ".command"), not the real filename. Ask Finder for
# the alias's actual path instead of assuming one.
ALIAS_PATH="$(osascript <<APPLESCRIPT
tell application "Finder"
  set targetFile to POSIX file "$(pwd)/Radar.command" as alias
  set newAlias to make new alias file at (POSIX file "$DEST" as alias) to targetFile
  return POSIX path of (newAlias as alias)
end tell
APPLESCRIPT
)"

# Finder names the new alias "Radar alias" — drop that suffix to match the
# clean "Radar" label the original shows.
CLEAN_NAME="$(basename "$ALIAS_PATH")"
CLEAN_NAME="${CLEAN_NAME% alias}"
CLEAN_PATH="$DEST/$CLEAN_NAME"
if [ "$ALIAS_PATH" != "$CLEAN_PATH" ]; then
  mv "$ALIAS_PATH" "$CLEAN_PATH"
  ALIAS_PATH="$CLEAN_PATH"
fi

fileicon set "$ALIAS_PATH" app/static/icon/Radar.icns

SETFILE="$(xcrun -find SetFile 2>/dev/null || echo /Library/Developer/CommandLineTools/usr/bin/SetFile)"
"$SETFILE" -a E "$ALIAS_PATH"

echo "Shortcut created at $ALIAS_PATH"
