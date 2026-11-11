#!/usr/bin/env bash
# Copy the canonical Chess Lua modules into the local Nakama runtime path.
set -euo pipefail

GAMES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$GAMES_DIR/Chess/server"
DESTINATION="${MOONGAMES_NAKAMA_MODULES:-$GAMES_DIR/runtime/modules}"

mkdir -p "$DESTINATION"

for module in \
  chess_rules.lua \
  chess_protocol.lua \
  chess_match.lua \
  chess_rpc.lua \
  chess_profile.lua; do
  if [[ -f "$SOURCE_DIR/$module" ]]; then
    cp "$SOURCE_DIR/$module" "$DESTINATION/$module"
  fi
done

printf 'Synced Chess Lua modules to %s\n' "$DESTINATION"
