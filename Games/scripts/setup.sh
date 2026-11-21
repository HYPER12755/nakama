#!/usr/bin/env bash
set -Eeuo pipefail

GAMES_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$GAMES_ROOT/.." && pwd)"
RUNTIME="$GAMES_ROOT/runtime"
PG_DATA="$RUNTIME/postgres/data"
PG_SOCKET="$RUNTIME/postgres/socket"
NAKAMA_DIR="$RUNTIME/nakama"
NAKAMA_BIN="$NAKAMA_DIR/nakama"
NAKAMA_CONFIG="$RUNTIME/nakama.yml"
ENV_FILE="$RUNTIME/env.sh"
PG_PORT=55432
PNPM_VERSION="12.19.0"

FORCE=0
RESET=0
YES=0
NO_ENGINE=0
NO_TESTS=0
NO_WEB=0

if [[ -t 1 ]]; then
  C_RST=$'\033[0m'
  C_RED=$'\033[31m'
  C_GRN=$'\033[32m'
  C_YEL=$'\033[33m'
  C_BLU=$'\033[34m'
else
  C_RST=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''
fi

info() { printf '%s==>%s %s\n' "$C_BLU" "$C_RST" "$*"; }
ok() { printf '%s OK %s %s\n' "$C_GRN" "$C_RST" "$*"; }
warn() { printf '%sWARN%s %s\n' "$C_YEL" "$C_RST" "$*" >&2; }
fail() { printf '%sFAIL%s %s\n' "$C_RED" "$C_RST" "$*" >&2; exit 1; }

trap 'printf "%sFAIL%s line %s: %s\n" "$C_RED" "$C_RST" "$LINENO" "$BASH_COMMAND" >&2' ERR

usage() {
  printf 'Usage: %s [options]\n\n' "$0"
  printf '  --force        rebuild the Nakama binary and regenerate the local config\n'
  printf '  --reset        stop the stack, wipe generated state, then set up fresh\n'
  printf '  --yes          skip the confirmation prompt for --reset\n'
  printf '  --no-engine    skip the Stockfish engine service\n'
  printf '  --no-web       skip the launcher/web build\n'
  printf '  --no-tests     skip unit tests after startup\n'
  printf '  --help, -h     show this help\n'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --force|-f) FORCE=1 ;;
    --reset|-r) RESET=1; FORCE=1 ;;
    --yes|-y) YES=1 ;;
    --no-engine) NO_ENGINE=1 ;;
    --no-web) NO_WEB=1 ;;
    --no-tests) NO_TESTS=1 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1 (try --help)" ;;
  esac
  shift
done

reset_state() {
  if [[ -f "$ENV_FILE" ]]; then
    info "Stopping the managed stack"
    (cd "$GAMES_ROOT" && bash scripts/stack.sh stop --all) || warn "The stack did not stop cleanly; continuing with the reset"
  fi
  info "Wiping generated state"
  rm -rf \
    "$RUNTIME" \
    "$GAMES_ROOT/.keys" \
    "$GAMES_ROOT/releases" \
    "$GAMES_ROOT/launcher/public/games.json" \
    "$GAMES_ROOT/Chess/dist" \
    "$GAMES_ROOT/Carrom/dist" \
    "$GAMES_ROOT/Ludo/dist" \
    "$GAMES_ROOT/launcher/dist" \
    "$GAMES_ROOT/tools/engine-service/engine-service"
  ok "Generated state wiped"
}

SUDO=()
if [[ $(id -u) -ne 0 ]] && command -v sudo >/dev/null 2>&1; then
  SUDO=(sudo)
fi

detect_platform() {
  if [[ -n "${PREFIX:-}" && "$PREFIX" == *com.termux* ]] || [[ "$(uname -o 2>/dev/null || true)" == "Android" ]]; then
    PLATFORM=termux
  elif command -v apt-get >/dev/null 2>&1; then
    PLATFORM=apt
  elif command -v dnf >/dev/null 2>&1; then
    PLATFORM=dnf
  elif command -v pacman >/dev/null 2>&1; then
    PLATFORM=pacman
  else
    fail "No supported package manager (pkg/apt/dnf/pacman). Install prerequisites manually."
  fi
  info "Platform: $PLATFORM"
}

refresh_packages() {
  case "$PLATFORM" in
    termux) pkg update -y || pkg update -y ;;
    apt) "${SUDO[@]}" apt-get update ;;
    dnf) "${SUDO[@]}" dnf -y makecache ;;
    pacman) "${SUDO[@]}" pacman -Sy --noconfirm ;;
  esac
}

pkg_add() {
  case "$PLATFORM" in
    termux) pkg install -y "$@" ;;
    apt) "${SUDO[@]}" apt-get install -y "$@" ;;
    dnf) "${SUDO[@]}" dnf install -y "$@" ;;
    pacman) "${SUDO[@]}" pacman -S --noconfirm --needed "$@" ;;
  esac
}

install_prereqs() {
  refresh_packages
  case "$PLATFORM" in
    termux)
      pkg_add git curl ca-certificates nodejs-lts postgresql golang || pkg_add git curl ca-certificates nodejs postgresql golang
      pkg_add lua || warn "Lua could not be installed; pnpm test:lua will be skipped"
      if (( NO_ENGINE == 0 )); then
        pkg_add stockfish || warn "Stockfish could not be installed; the engine service will be skipped"
      fi
      ;;
    apt)
      pkg_add git curl ca-certificates postgresql postgresql-client golang-go
      pkg_add lua5.4 || warn "Lua could not be installed; pnpm test:lua will be skipped"
      if (( NO_ENGINE == 0 )); then
        pkg_add stockfish || warn "Stockfish could not be installed; the engine service will be skipped"
      fi
      ;;
    dnf)
      pkg_add git curl ca-certificates postgresql postgresql-server golang
      pkg_add lua || warn "Lua could not be installed; pnpm test:lua will be skipped"
      if (( NO_ENGINE == 0 )); then
        pkg_add stockfish || warn "Stockfish could not be installed; the engine service will be skipped"
      fi
      ;;
    pacman)
      pkg_add git curl ca-certificates postgresql go
      pkg_add lua || warn "Lua could not be installed; pnpm test:lua will be skipped"
      if (( NO_ENGINE == 0 )); then
        pkg_add stockfish || warn "Stockfish could not be installed; the engine service will be skipped"
      fi
      ;;
  esac
}

install_node_official() {
  local arch file tmp
  case "$(uname -m)" in
    x86_64) arch=x64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) fail "Unsupported CPU architecture for the Node installer" ;;
  esac
  local base="https://nodejs.org/dist/latest-v22.x"
  file="$(curl -fsSL "$base/SHASUMS256.txt" | awk -v a="$arch" '$2 ~ ("linux-" a ".tar.xz$") {print $2; exit}')"
  [[ -n "$file" ]] || fail "Could not resolve a Node 22 tarball"
  tmp="$(mktemp -d)"
  curl -fsSL "$base/$file" -o "$tmp/node.tar.xz"
  mkdir -p "$HOME/.local/nodejs"
  tar -xJf "$tmp/node.tar.xz" -C "$HOME/.local/nodejs" --strip-components=1
  rm -rf "$tmp"
  export PATH="$HOME/.local/nodejs/bin:$PATH"
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    warn "Node.js not found; installing Node 22 into ~/.local/nodejs"
    install_node_official
  fi
  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < 20 )); then
    warn "Node $(node --version) is too old; installing Node 22 into ~/.local/nodejs"
    install_node_official
  fi
  command -v npm >/dev/null 2>&1 || fail "npm is missing"
  ok "Node $(node --version), npm $(npm --version)"
}

ensure_pnpm() {
  if ! command -v pnpm >/dev/null 2>&1; then
    info "Installing pnpm $PNPM_VERSION into ~/.local"
    export NPM_CONFIG_PREFIX="$HOME/.local"
    npm install -g "pnpm@$PNPM_VERSION"
    export PATH="$HOME/.local/bin:$PATH"
  fi
  command -v pnpm >/dev/null 2>&1 || fail "pnpm is still missing"
  ok "pnpm $(pnpm --version) (package.json pins $PNPM_VERSION)"
}

ensure_go() {
  if ! command -v go >/dev/null 2>&1; then
    fail "Go toolchain is missing after package installation"
  fi
  export GOTOOLCHAIN=auto
  info "Checking the Go toolchain required by go.mod"
  local version
  version="$(cd "$REPO_ROOT" && go version 2>&1)" || fail "Go toolchain could not be prepared: $version"
  ok "$version"
}

find_pg_bin() {
  local dir
  if command -v pg_ctl >/dev/null 2>&1; then
    dirname "$(command -v pg_ctl)"
    return
  fi
  if command -v pg_config >/dev/null 2>&1; then
    printf '%s\n' "$(pg_config --bindir)"
    return
  fi
  for dir in /usr/lib/postgresql/*/bin /usr/local/pgsql/bin "${PREFIX:-}/bin"; do
    if [[ -x "$dir/pg_ctl" ]]; then
      printf '%s\n' "$dir"
      return
    fi
  done
  fail "pg_ctl not found; set PGBIN or install PostgreSQL server tools"
}

ensure_postgres() {
  mkdir -p "$PG_DATA" "$PG_SOCKET" "$RUNTIME/stack/logs"
  if [[ ! -f "$PG_DATA/PG_VERSION" ]]; then
    info "Initializing PostgreSQL cluster at $PG_DATA"
    "$PGBIN/initdb" -D "$PG_DATA" -U postgres -A trust --encoding=UTF8 --locale=C >/dev/null
  else
    ok "PostgreSQL cluster already initialized"
  fi

  local started=0
  if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p "$PG_PORT" >/dev/null 2>&1; then
    "$PGBIN/pg_ctl" -D "$PG_DATA" -l "$RUNTIME/stack/logs/postgres-setup.log" \
      -o "-p $PG_PORT -h 127.0.0.1 -k $PG_SOCKET" -w start >/dev/null
    started=1
  fi

  if ! "$PGBIN/psql" -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='nakama'" | grep -q 1; then
    info "Creating the nakama database"
    "$PGBIN/psql" -h "$PG_SOCKET" -p "$PG_PORT" -U postgres -d postgres \
      -c 'CREATE DATABASE nakama OWNER postgres;' >/dev/null
  else
    ok "Database nakama already exists"
  fi

  info "Applying Nakama database migrations"
  "$NAKAMA_BIN" migrate up --config "$NAKAMA_CONFIG" >/dev/null
  ok "Nakama schema is up to date"

  if (( started )); then
    "$PGBIN/pg_ctl" -D "$PG_DATA" -m fast -w stop >/dev/null
    ok "PostgreSQL left stopped for the stack manager to start"
  fi
}

generate_config() {
  if [[ -f "$NAKAMA_CONFIG" && $FORCE -eq 0 ]]; then
    ok "Local Nakama config already exists"
    return
  fi
  local password
  password="$(openssl rand -hex 12 2>/dev/null || true)"
  if [[ -z "$password" ]]; then
    password="$(tr -d '-' </proc/sys/kernel/random/uuid 2>/dev/null || true)"
  fi
  [[ -n "$password" ]] || fail "Could not generate a console password"
  mkdir -p "$NAKAMA_DIR"
  cat > "$NAKAMA_CONFIG" <<EOF
name: moongames-local
data_dir: $NAKAMA_DIR/data

console:
  username: admin
  password: $password

database:
  address:
    - postgres@127.0.0.1:$PG_PORT/nakama

session:
  token_expiry_sec: 7200
EOF
  chmod 600 "$NAKAMA_CONFIG"
  ok "Wrote $NAKAMA_CONFIG (console password generated locally)"
}

write_env() {
  local engine_path=""
  if command -v stockfish >/dev/null 2>&1; then
    engine_path="$(command -v stockfish)"
  fi
  {
    printf 'export PATH=%q\n' "$HOME/.local/nodejs/bin:$HOME/.local/bin:$PGBIN:$NAKAMA_DIR:$PATH"
    printf 'export GOTOOLCHAIN=auto\n'
    printf 'export MOONGAMES_NAKAMA_BIN=%q\n' "$NAKAMA_BIN"
    printf 'export MOONGAMES_NAKAMA_CONFIG=%q\n' "$NAKAMA_CONFIG"
    printf 'export MOONGAMES_PG_DATA=%q\n' "$PG_DATA"
    printf 'export MOONGAMES_PG_SOCKET=%q\n' "$PG_SOCKET"
    printf 'export MOONGAMES_PG_PORT=%s\n' "$PG_PORT"
    printf 'export MOONGAMES_PG_HOST=127.0.0.1\n'
    printf 'export MOONGAMES_PG_CTL=%q\n' "$PGBIN/pg_ctl"
    printf 'export MOONGAMES_PG_ISREADY=%q\n' "$PGBIN/pg_isready"
    printf 'export MOONGAMES_PSQL=%q\n' "$PGBIN/psql"
    if [[ -n "$engine_path" ]]; then
      printf 'export MOONGAMES_ENGINE_PATH=%q\n' "$engine_path"
    fi
  } > "$ENV_FILE"
  source "$ENV_FILE"
  ok "Wrote $ENV_FILE"
}

build_nakama() {
  if [[ -x "$NAKAMA_BIN" && $FORCE -eq 0 ]]; then
    ok "Nakama binary already built"
    return
  fi
  mkdir -p "$NAKAMA_DIR"
  info "Building Nakama from the vendored source (first build takes about 30s)"
  (cd "$REPO_ROOT" && GOTOOLCHAIN=auto go build -mod=vendor -trimpath -o "$NAKAMA_BIN" .)
  ok "Nakama binary: $NAKAMA_BIN"
}

build_engine_service() {
  if (( NO_ENGINE != 0 )) || ! command -v stockfish >/dev/null 2>&1; then
    return
  fi
  local source="$GAMES_ROOT/tools/engine-service"
  local binary="$source/engine-service"
  if [[ -x "$binary" && $FORCE -eq 0 ]]; then
    ok "Engine service already built"
    return
  fi
  info "Building the engine service"
  (cd "$source" && GOTOOLCHAIN=auto go build -o "$binary" .)
  ok "Engine service binary: $binary"
}

package_releases() {
  info "Building and signing release bundles"
  (cd "$GAMES_ROOT" && pnpm package:chess && pnpm package:carrom && pnpm package:ludo)
  info "Generating the release manifest and catalog"
  (cd "$GAMES_ROOT" && pnpm release:manifest && pnpm catalog:generate)
}

prepare_web() {
  info "Installing workspace dependencies"
  (cd "$GAMES_ROOT" && pnpm install)
  if (( NO_WEB == 0 )); then
    info "Building the launcher and all web games"
    (cd "$GAMES_ROOT" && pnpm build:web)
  else
    warn "Skipping the web build (--no-web)"
  fi
  info "Syncing authoritative Lua modules"
  (cd "$GAMES_ROOT" && pnpm sync:server)
}

start_stack() {
  if (( NO_ENGINE == 0 )) && command -v stockfish >/dev/null 2>&1; then
    info "Starting PostgreSQL, Nakama, launcher, releases and engine"
    (cd "$GAMES_ROOT" && pnpm stack start)
  else
    warn "Starting without the engine service (install Stockfish to enable it)"
    (cd "$GAMES_ROOT" && pnpm stack start postgres nakama web releases)
  fi
}

run_tests() {
  if (( NO_TESTS != 0 )); then
    return
  fi
  info "Running unit tests"
  local status=0
  set +e
  trap - ERR
  (cd "$GAMES_ROOT" && pnpm test && pnpm test:tools)
  status=$?
  if command -v lua >/dev/null 2>&1; then
    (cd "$GAMES_ROOT" && pnpm test:lua) || status=1
  else
    warn "Lua CLI missing; skipping pnpm test:lua"
  fi
  trap 'printf "%sFAIL%s line %s: %s\n" "$C_RED" "$C_RST" "$LINENO" "$BASH_COMMAND" >&2' ERR
  set -e
  if (( status == 0 )); then
    ok "All unit tests passed"
  else
    warn "Some tests failed; the stack is still running. See the output above."
  fi
}

info "MoonGames native setup (no Docker)"
[[ -d "$REPO_ROOT/server" && -f "$REPO_ROOT/go.mod" ]] || fail "Repository root does not look like the Nakama source tree"

if (( RESET )); then
  if [[ -t 0 && $YES -eq 0 ]]; then
    printf 'This deletes local databases, signing keys, releases and builds. Continue? [y/N] '
    read -r answer
    [[ "$answer" == [yY]* ]] || fail "Aborted"
  fi
  reset_state
fi

mkdir -p "$RUNTIME"

detect_platform
install_prereqs
ensure_node
ensure_pnpm
ensure_go

PGBIN="$(find_pg_bin)"
ok "PostgreSQL binaries: $PGBIN"

generate_config
write_env
build_nakama
build_engine_service
ensure_postgres
package_releases
prepare_web
start_stack
run_tests

(cd "$GAMES_ROOT" && pnpm stack status)
(cd "$GAMES_ROOT" && pnpm stack urls)
info "Done. Use ./scripts/stack.sh <command> from now on (e.g. ./scripts/stack.sh logs nakama --follow)."
info "Console credentials: ./scripts/stack.sh credentials"
