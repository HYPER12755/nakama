#!/usr/bin/env bash
set -euo pipefail

GAMES_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$GAMES_ROOT/runtime/env.sh"

source "$GAMES_ROOT/scripts/dotenv.sh"
load_dotenv

if [[ -f "$ENV_FILE" ]]; then
  source "$ENV_FILE"
fi

cd "$GAMES_ROOT"
exec pnpm stack "$@"
