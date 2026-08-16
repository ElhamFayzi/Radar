#!/bin/bash
# Double-click this file in Finder to start Radar and open it in your browser.
# Closing this Terminal window stops the server.

cd "$(dirname "$0")" || exit 1

# Port 5055 rather than Flask's default 5000, which macOS's AirPlay Receiver
# often already holds.
PORT=5055
URL="http://127.0.0.1:$PORT"

if curl -sf "$URL" >/dev/null 2>&1; then
  echo "Radar is already running — opening your browser."
  open "$URL"
  exit 0
fi

if [ ! -x ".venv/bin/flask" ]; then
  echo "No virtual environment found yet. Set one up first:"
  echo "  python3 -m venv .venv"
  echo "  .venv/bin/pip install -r requirements.txt"
  echo
  read -rp "Press Enter to close..."
  exit 1
fi

export FLASK_APP=run.py

echo "Applying any pending database migrations..."
.venv/bin/flask db upgrade

echo "Starting Radar on $URL ..."

# Open the browser as soon as the server responds, without blocking startup.
(
  for _ in $(seq 1 40); do
    curl -sf "$URL" >/dev/null 2>&1 && open "$URL" && break
    sleep 0.25
  done
) &

exec .venv/bin/flask run --port "$PORT"
