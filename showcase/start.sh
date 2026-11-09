#!/data/data/com.termux/files/usr/bin/bash
# Start the Nakama Feature Showcase on port 4001.
# The same Go process serves the browser client and proxies Nakama HTTP/WS.
set -euo pipefail
cd "$(dirname "$0")"

ROOT="$PWD"
NAKAMA_DIR="${NAKAMA_DIR:-$ROOT/../nakama}"
PORT="${SHOWCASE_PORT:-4001}"
BIN="$ROOT/showcase"
PID_FILE="$ROOT/run/showcase.pid"
LOG="$ROOT/logs/showcase.log"
mkdir -p run logs

if [ -f "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    echo "Showcase is already running (PID $PID)."
    echo "Open http://127.0.0.1:$PORT/"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

# Do not silently attach to a process we did not launch. This catches a stale
# manual run that would otherwise make the health check look successful while
# the new binary dies with "address already in use".
EXISTING="$(pidof showcase 2>/dev/null || true)"
if [ -n "$EXISTING" ]; then
  echo "A showcase process is already running (PID $EXISTING) without a managed PID file." >&2
  echo "Run ./stop.sh first, then rerun this script." >&2
  exit 1
fi

# Bring up Nakama and PostgreSQL if they are not already healthy.
if ! curl -fsS -o /dev/null http://127.0.0.1:7350/healthcheck 2>/dev/null; then
  if [ -x "$NAKAMA_DIR/start.sh" ]; then
    echo "Nakama is not healthy; starting it first..."
    (cd "$NAKAMA_DIR" && ./start.sh)
  else
    echo "Nakama is not running and $NAKAMA_DIR/start.sh was not found." >&2
    echo "Start Nakama first, then rerun this script." >&2
    exit 1
  fi
fi

if [ "${SHOWCASE_SKIP_BUILD:-0}" != "1" ]; then
  if ! command -v go >/dev/null 2>&1; then
    echo "Go is required to build the server (or set SHOWCASE_SKIP_BUILD=1)." >&2
    exit 1
  fi
  echo "Building the Go gateway and game server..."
  go build -o "$BIN" .
fi

{
  echo
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') starting showcase on :$PORT ==="
} >> "$LOG"

nohup "$BIN" >> "$LOG" 2>&1 &
PID=$!
echo "$PID" > "$PID_FILE"

for _ in $(seq 1 40); do
  if ! kill -0 "$PID" 2>/dev/null; then
    echo "Showcase exited during startup. Last log lines:" >&2
    tail -20 "$LOG" >&2 || true
    rm -f "$PID_FILE"
    exit 1
  fi
  if curl -fsS "http://127.0.0.1:$PORT/go/health" >/dev/null 2>&1; then
    echo "Showcase started (PID $PID)."
    echo "Open http://127.0.0.1:$PORT/"
    echo "Logs: $LOG"
    exit 0
  fi
  sleep 0.25
done

echo "Showcase did not become healthy on :$PORT. Check $LOG" >&2
exit 1
