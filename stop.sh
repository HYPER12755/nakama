#!/data/data/com.termux/files/usr/bin/bash
cd "$(dirname "$0")"

PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"

if [ -f nakama.pid ] && kill -0 "$(cat nakama.pid)" 2>/dev/null; then
  kill "$(cat nakama.pid)"
  rm -f nakama.pid
  echo "Stopped Nakama."
else
  echo "Nakama is not running."
fi

if [ "${1:-}" = "--all" ]; then
  pg_ctl -D "$PREFIX/var/lib/postgresql" stop
fi
