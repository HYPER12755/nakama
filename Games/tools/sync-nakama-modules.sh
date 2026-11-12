#!/usr/bin/env bash
# Copy the canonical Lua modules into the local Nakama runtime path.
set -euo pipefail

GAMES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHESS_DIR="$GAMES_DIR/Chess/server"
SHARED_DIR="$GAMES_DIR/shared/server"
DESTINATION="${MOONGAMES_NAKAMA_MODULES:-$GAMES_DIR/runtime/modules}"

mkdir -p "$DESTINATION"

for module in \
  moongames_social.lua; do
  if [[ -f "$SHARED_DIR/$module" ]]; then
    cp "$SHARED_DIR/$module" "$DESTINATION/$module"
  fi
done

for module in \
  chess_rules.lua \
  chess_protocol.lua \
  chess_match.lua \
  chess_rpc.lua \
  chess_profile.lua; do
  if [[ -f "$CHESS_DIR/$module" ]]; then
    cp "$CHESS_DIR/$module" "$DESTINATION/$module"
  fi
done

printf 'Synced shared and Chess Lua modules to %s\n' "$DESTINATION"
