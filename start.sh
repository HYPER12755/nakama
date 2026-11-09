#!/data/data/com.termux/files/usr/bin/bash
set -e
cd "$(dirname "$0")"

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  pg_ctl -D "$PREFIX/var/lib/postgresql" \
    -l "$PREFIX/var/lib/postgresql/server.log" \
    -o "-p 5432 -h 127.0.0.1 -k $PREFIX/var/run/postgresql" start
fi

if [ -f nakama.pid ] && kill -0 "$(cat nakama.pid)" 2>/dev/null; then
  echo "Nakama already running (PID $(cat nakama.pid))."
  exit 0
fi

mkdir -p logs
nohup ./nakama --config ./nakama.yml > logs/nakama.log 2>&1 &
echo $! > nakama.pid

for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:7350/healthcheck 2>/dev/null; then
    echo "Nakama started (PID $(cat nakama.pid)) - console: http://127.0.0.1:7351"
    exit 0
  fi
  sleep 0.5
done

echo "Nakama did not become healthy. Check logs/nakama.log" >&2
exit 1
