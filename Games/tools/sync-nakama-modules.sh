#!/usr/bin/env bash
# Copy the canonical Lua modules into the local Nakama runtime path.
set -euo pipefail

GAMES_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CHESS_DIR="$GAMES_DIR/Chess/server"
CARROM_DIR="$GAMES_DIR/Carrom/server"
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
  chess_profile.lua \
  chess_opening.lua \
  chess_puzzle.lua \
  chess_tournament.lua; do
  if [[ -f "$CHESS_DIR/$module" ]]; then
    cp "$CHESS_DIR/$module" "$DESTINATION/$module"
  fi
done

for module in \
  carrom_physics.lua \
  carrom_rules.lua \
  carrom_protocol.lua \
  carrom_match.lua \
  carrom_rpc.lua \
  carrom_glicko.lua \
  carrom_profile.lua; do
  if [[ -f "$CARROM_DIR/$module" ]]; then
    cp "$CARROM_DIR/$module" "$DESTINATION/$module"
  fi
done

printf 'Synced shared, Chess, and Carrom Lua modules to %s\n' "$DESTINATION"
