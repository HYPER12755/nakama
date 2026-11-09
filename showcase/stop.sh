#!/data/data/com.termux/files/usr/bin/bash
# Stop the showcase gateway. Use --all to also stop Nakama and PostgreSQL.
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$PWD"
NAKAMA_DIR="${NAKAMA_DIR:-$ROOT/../nakama}"
PID_FILE="$ROOT/run/showcase.pid"

PID=""
if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
fi

if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
  kill "$PID"
  for _ in $(seq 1 20); do
    if ! kill -0 "$PID" 2>/dev/null; then break; fi
    sleep 0.25
  done
  if kill -0 "$PID" 2>/dev/null; then
    kill -9 "$PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  echo "Stopped showcase (PID $PID)."
else
  rm -f "$PID_FILE"
  # Fallback for a manually launched copy of this binary. Android's pgrep
  # does not support -x reliably here, so use pidof.
  PIDS="$(pidof showcase 2>/dev/null || true)"
  if [ -n "$PIDS" ]; then
    for P in $PIDS; do kill "$P" 2>/dev/null || true; done
    echo "Stopped showcase process(es): $PIDS"
  else
    echo "Showcase is not running."
  fi
fi

if [ "${1:-}" = "--all" ]; then
  if [ -x "$NAKAMA_DIR/stop.sh" ]; then
    (cd "$NAKAMA_DIR" && ./stop.sh --all)
  fi
fi
