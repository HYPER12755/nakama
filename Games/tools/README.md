# Tools

Build, sign, serve, and verify portable MoonGames bundles.

## Manage the local full stack

`tools/stack.mjs` is the single entry point for the local PostgreSQL, Nakama,
launcher, and signed-release services.

```bash
cd Games

pnpm stack doctor
pnpm stack start
pnpm stack status
pnpm stack urls
pnpm stack credentials
pnpm stack logs nakama --lines 100
pnpm stack logs web --follow
pnpm stack sync
pnpm stack restart
pnpm stack stop
pnpm stack stop --keep-db
```

Use `pnpm stack <command> [services...]` to operate on only part of the stack:

```bash
pnpm stack start nakama
pnpm stack restart web
pnpm stack stop releases
```

Services are `postgres` (`db`), `nakama` (`api`), `web` (`launcher`), and
`releases`. Starting `nakama` automatically starts PostgreSQL first. Starting
the launcher builds the web bundle automatically when it is missing; pass
`--build` to force a rebuild or `--no-build` to fail instead.

State, PID records, and logs are written to `runtime/stack/`, which is ignored
by git. The manager stores one `state.json` and one log per service. `stop`
stops PostgreSQL only when the stack started it; an already-running external
server is left alone unless you pass `--all`. Use `--keep-db` to keep a managed
server running.

The manager discovers the Nakama config from `MOONGAMES_NAKAMA_CONFIG`,
`~/nakama/nakama.yml`, `~/nakama/local.yml`, the repository root
`nakama.yml`/`local.yml`, or `Games/runtime/nakama.yml`. It discovers the binary
from `MOONGAMES_NAKAMA_BIN`, the repository root, `~/nakama/nakama`, or `PATH`.
If the configured database role cannot connect, it tries the local `postgres`
and current-user roles before starting Nakama. Run `pnpm stack help` for all
path, port, host, and credential environment variables.

`pnpm stack status --json` emits machine-readable health and process data.
`pnpm stack logs` shows all service logs; add a service name and `--follow` to
stream one log.

## Package a game

```bash
cd Games

# Build Chess and write a signed release artifact.
pnpm package:chess

# Package the existing dist without rebuilding.
node tools/package-game.mjs --game chess --skip-build

# Use a production key and a CDN base URL.
node tools/package-game.mjs --game chess \
  --key /secure/moongames-signing-key.pem \
  --key-id release-1 \
  --base-url https://cdn.example.com/moongames/

# Generate a development key explicitly.
pnpm key:generate
```

Outputs:

```text
releases/
├── chess/
│   └── 0.5.0/
│       ├── chess-0.5.0.zip
│       └── chess-0.5.0.bundle.json
└── release-manifest.json
```

`package-game.mjs` creates a deterministic ZIP, computes SHA-256, signs the
descriptor with Ed25519, and prints the public key to pin in host builds. The
private key is never written to the release directory. If `--key` is omitted,
a development key is generated at `.keys/dev-signing-key.pem` (ignored by git).

The current Chess build uses `vite-plugin-singlefile`, so `Chess/dist/` and the
signed ZIP contain one self-contained `index.html` with inline JavaScript and
CSS. That entry loads directly in file-backed WebViews without ES-module/CORS or
relative-asset dependencies. The packaging format accepts additional files; the
descriptor's `entry` always identifies the file to load. However, the current
Flutter and React Native hosts load the entry through `file://`, so a multi-file
build with ES-module chunks, Workers, WASM, or heavy media needs the planned
secure-origin/asset-loader host update first. Keep asset-heavy bundles behind a
higher `minHostProtocol`. Copy the ZIP and descriptor into the Flutter/React
Native app assets for the bundled fallback.

## Release manifest

```bash
pnpm release:manifest
pnpm release:manifest --base-url https://cdn.example.com/moongames/
pnpm release:manifest --key "release-1=<base64 public key>"
pnpm release:manifest --latest-only
```

The manifest is written to `releases/release-manifest.json` by default. It
contains a signer key map and all discovered descriptors, newest first. Pass
repeatable `--key keyId=base64` options to verify descriptors against pinned
public keys. Without `--key`, the tool falls back to each descriptor's embedded
key and prints a warning; that mode is only for local development.

## Games catalog

```bash
pnpm catalog:generate
node tools/generate-catalog.mjs --public launcher/public
```

The catalog reads real game manifests, planned titles from
`catalog/planned-games.json`, and `releases/release-manifest.json` (when
present). It writes `releases/games.json` and, with `--public`, a copy under the
web launcher's public directory. Publish `games.json` beside
`release-manifest.json`.

The catalog is presentation data. It does not replace signed bundle selection or
verification. See [catalog/README.md](../catalog/README.md).

## Assemble the web menu

```bash
pnpm build:web
```

This builds Chess, regenerates the catalog, builds the launcher, and copies every
available game's `dist/` into `launcher/dist/` at its `webPath`. The resulting
`launcher/dist/` directory is ready for static hosting. See
[launcher/README.md](../launcher/README.md).

## Serve releases locally

```bash
pnpm serve:releases
pnpm serve:releases --port 8099 --root releases
```

The local server binds to `0.0.0.0:8099`, serves the release manifest, catalog,
and signed ZIPs with CORS and no-store caching, and rejects path traversal. Use
the computer's LAN IP from a physical device, `10.0.2.2` from the Android
emulator, or `127.0.0.1` from the iOS simulator.

## Verify an artifact

```bash
pnpm verify:bundle \
  releases/chess/0.5.0/chess-0.5.0.bundle.json \
  releases/chess/0.5.0/chess-0.5.0.zip \
  --key "release-1=<base64 raw Ed25519 public key>"
```

Without `--key`, verification falls back to the descriptor's embedded public
key. That mode is only for local development. Production host and release
checks must pin the public key.

## Tests

```bash
pnpm test:tools
```

The tool tests cover deterministic ZIP output, traversal rejection, signing
payload stability, signature/tamper detection, semver ordering, release
manifest selection, catalog generation/sorting, and stack config/service
parsing. `unzip -t` is used when available to validate archives.
