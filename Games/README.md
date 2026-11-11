# MoonGames

Portable games that share one Nakama backend. The first game is **Chess**.

## Ownership model

This is a central-server model, like a hosted multiplayer game: **you own and
operate the Nakama server**, and players receive the game clients. The server
owns accounts, match state, moves, clocks, ratings, and results. A client cannot
declare a win or change an authoritative state; it can only request an action
that the server validates.

## Architecture

Each game is a self-contained, portable web bundle:

```text
Chess/
├── manifest.json          # package metadata and capabilities
├── core/                  # pure rules engine (no UI, no network)
├── web/                   # portable UI bundle (React + Vite)
├── server/                # authoritative Nakama runtime logic (Lua)
└── tests/                 # shared rules/parity vectors

shared/sdk/                # bridge, manifest, protocol, catalog, and bundle contracts
catalog/                   # public games.json metadata for menus and native apps
launcher/                  # browser game menu (React + Vite)
hosts/core/                # shared TypeScript bundle verification
hosts/flutter/             # generic Flutter WebView host
hosts/react-native/        # generic React Native WebView host
tools/                     # packaging, signing, manifest, catalog, serving, verification
```

The Flutter and React Native hosts load any game bundle through one generic
WebView wrapper. They pass the Nakama session, theme, locale, and lifecycle
events through the bridge defined in `shared/sdk/`. The host wrappers do not
contain game rules.

The important separation is deliberate:

- **Rules** live in `Chess/core/` for local play and in `Chess/server/` for
  authoritative online play.
- **UI components** live in `Chess/web/src/components/`, one component per file.
- **Backend logic** lives in separate Lua modules, never inside UI code.
- **Shared contracts** live in `shared/sdk/`.

## Backend language

The authoritative backend is **Lua**, running inside Nakama's built-in runtime.

This was chosen after verifying that Go `-buildmode=plugin` is not supported on
`android/arm64`, which is the local development environment. Go runtime modules
would work on a normal Linux VPS, but Lua works both locally and on the VPS with
no platform-specific build step. Rust would require a separate service outside
Nakama, so it was not chosen.

The TypeScript client core and the Lua server rules must stay behaviourally
compatible. `Chess/tests/vectors.json` is the shared test-vector file for that.

## Delivery

Game bundles are built as deterministic ZIPs, signed with Ed25519, and indexed
by a `release-manifest.json`. Each descriptor binds the game id, version, SDK
version, minimum host protocol, entry point, SHA-256, and byte size. The bundle
URL is intentionally outside the signature so a CDN can change without
re-signing.

The Chess web build is emitted as one self-contained `index.html` with inline
JavaScript and CSS. This avoids `file://` ES-module/CORS and relative-asset
failures in native WebViews. The signed ZIP contains that entry.

The ZIP/descriptor format already supports multi-file builds, but the current
hosts load the entry through `file://`. Games that add external audio/art,
dynamic-import chunks, Workers, WASM, or a normal multi-file Vite build need a
secure local origin (or platform asset loader). That loader is deferred until
those assets are added; until then, new games must stay within the file-backed,
single-entry subset or wait for the host update. New bundles will use a higher
`minHostProtocol` so older hosts keep selecting the previous compatible build.

## Browser and native parity

The browser is a first-class host, not a preview-only shell. The same built
web bundle runs in a normal browser origin and in the native virtual origin.
Native wrappers add bundle installation, WebView lifecycle, session passing, and
optional OS integrations; they contain no game rules. Every game mode, online
feature, and host enhancement must have a browser path or a graceful web
fallback. Nothing that is required to play may be gated behind a native app.

For multi-file bundles, the host loader is an adapter over the same extracted
files:

- browser: normal HTTP origin (Vite preview, static server, or CDN)
- native: platform asset loader or secure local origin

The game uses relative asset paths and the shared bridge, so it does not branch
on "native versus web". Opening a browser URL with `?hostPreview=1` enables the
browser host-preview shell: it emulates host `init`/`theme`/`session`/lifecycle
messages, uses browser device auth unless a session token is injected, and logs
outgoing bridge events with tokens redacted for parity testing. The panel can
toggle theme, send pause/resume, re-send init, and accept a Nakama session JWT.
Session tokens stay in memory and never appear in the event log.

Hosts:

- fetch the release manifest
- select the newest compatible bundle for the game and host protocol
- require the descriptor key id and public key to match app-pinned keys
- verify the descriptor signature **before** downloading the ZIP
- verify the ZIP size, SHA-256, and signature before extraction
- extract with path-traversal protection and install atomically
- cache the verified bundle and reject remote downgrades
- fall back to the app-bundled ZIP and descriptor when needed

The private signing key is never shipped. Embedded descriptor public keys are
for local development only. Production hosts must pin trusted key ids/public
keys. Because app stores restrict downloading executable code, the bundled
fallback remains required and is never bypassed by an invalid remote artifact.

App integration guides:

- [Shared host setup](hosts/HOST_SETUP.md): release hosting, signing, fallback
  assets, Nakama identity, QA, and troubleshooting
- [Flutter integration](hosts/flutter/INTEGRATION.md)
- [React Native integration](hosts/react-native/INTEGRATION.md)

## Games catalog and menus

`releases/games.json` is the discovery API for game lists. It contains names,
taglines, descriptions, players, capabilities, tags, artwork hints, accent
colors, versions, and release summaries for every game. Native apps can fetch
this file and render their own game panel with their own design, then pass the
selected catalog `id` to the verified host.

The same catalog drives the ready-made browser menu in `launcher/`. If an app
does not want a custom game list, it can embed or link to this web menu instead.
The menu exposes a small native launch bridge: when embedded, selecting a game
reports its `id` to the app, which then opens the normal verified host screen.

```text
https://games.example.com/moongames/games.json
```

The catalog is presentation metadata and is not signed. It never bypasses bundle
verification: hosts still select the ZIP from the signed release manifest, check
the pinned key, verify the descriptor signature, and verify the ZIP before
loading it. See [catalog/README.md](catalog/README.md) for the schema and native
examples, and [launcher/README.md](launcher/README.md) for deployment.

## Commands

```bash
cd Games
pnpm install

# Local chess UI
pnpm dev:chess

# Local multi-game web menu.
# Run dev:chess in another terminal, then open http://localhost:5174/.
pnpm dev:web

# Production web bundle
pnpm build:chess

# Host-mode browser preview of the production bundle.
# Open http://localhost:4173/?hostPreview=1 after starting this.
pnpm preview:chess

# Build the menu plus every available web game, then preview it.
# Open http://localhost:4174/ after the build.
pnpm build:web
pnpm preview:web

# Regenerate releases/games.json and launcher/public/games.json
pnpm catalog:generate

# Serve manifests, catalogs, and ZIPs to native hosts on port 8099
pnpm serve:releases

# Unit tests and type checks
pnpm test
pnpm typecheck

# Authoritative Lua rules tests
pnpm test:lua

# Everything
pnpm test:all

# Signed release packaging and verification
pnpm package:chess
pnpm release:manifest
pnpm verify:bundle \
  releases/chess/0.3.0/chess-0.3.0.bundle.json \
  releases/chess/0.3.0/chess-0.3.0.zip \
  --key "dev-1=<base64-public-key>"

# End-to-end online smoke test (requires local Nakama)
pnpm smoke:online
```

`pnpm package:chess` builds Chess, creates a deterministic ZIP, signs its
descriptor, and writes `releases/chess/<version>/`. `pnpm release:manifest`
indexes descriptors under `releases/`. Pass `--base-url` to either tool for a
CDN deployment, and pass `--key keyId=base64` to `release:manifest` and
`verify:bundle` to pin production keys. The dev key is generated under `.keys/`
and is ignored by git.

Online development uses automatic device authentication. The browser defaults
to Nakama at `http://<current-page-host>:7350`; the server address is editable in
the Online panel. Production builds can set `VITE_NAKAMA_HOST`,
`VITE_NAKAMA_PORT`, `VITE_NAKAMA_SSL`, and `VITE_NAKAMA_SERVER_KEY` at build
time. The server key is not a secret in the same way as a database password; it
is the public Nakama game-server key.

## Current status

Phases 1–7.5 are code-complete except optional chat/quick messages, the
remaining browser platform-service fallbacks, and real-device build/QA
validation:

- The TypeScript chess core is implemented and covered by 22 passing tests.
- The portable web client has 19 passing tests for invite links, native launch
  contexts, Lua empty-array normalization, history replay, tagged PGN export,
  bundle/manifest contracts, browser host-preview messaging/session redaction,
  and clipboard fallback.
- The local web UI is playable at `http://localhost:5173/` while the Vite dev
  server is running.
- The local UI includes an on-device AI opponent with Easy/Medium/Hard levels and
  a choice of side. The AI uses alpha-beta search over the shared `chess.js`
  engine, so no AI moves require the server or network.
- The production bundle builds to `Chess/dist/` as a single self-contained
  `index.html` for file-backed WebView hosts.
- The pure Lua rules engine is implemented in `Chess/server/chess_rules.lua` and
  covered by 21 passing tests, including shared vectors, perft, SAN, castling,
  en passant, promotion, draws, undo, and JSON-safe state serialization.
- The authoritative Nakama match handler, protocol, RPCs, matchmaker hook, and
  progression module are covered by 36 additional Lua tests (8 protocol,
  20 match, 8 progression), for 57 Lua tests in total.
- Online Chess is wired into the web UI with quick match, private match IDs,
  device sign-in, host-supplied sessions, connection status, authoritative
  clocks, reconnect, resign, draw offers, and server results.
- Quick match first uses Nakama's atomic matchmaker for players searching at
  the same time. If no partner appears within five seconds, it opens a
  persistent quick table so a player arriving later can join. The search UI
  shows elapsed time and can be cancelled without leaving a queued ticket.
- Spectators can join a live or finished match in read-only mode. They receive
  state snapshots, clocks, and results without occupying a seat, and the match
  UI shows the current spectator gallery.
- Private matches expose copyable player and spectator invite links. Opening a
  link selects Online mode, connects, and joins the target match with the right
  role. Native hosts can forward the same query from an app deep link through
  `launchQuery`; registering the platform URL scheme remains app-side.
- Completed games are persisted in Nakama storage. Quick matches update Elo
  ratings (default 1200, K=32); private matches are casual and do not change
  ratings. Ratings, wins/losses/draws, recent results (with SANs and PGN), and
  the `chess_rating` leaderboard are rendered in the web sidebar.
- Recent games can be replayed ply-by-ply from profile history, with board
  flipping, PGN copy, and PGN download.
- The browser supports a host-mode preview at `?hostPreview=1`: it sends the
  same init/theme/session/lifecycle messages as a native host, supports optional
  host session token injection, logs outgoing bridge events with tokens
  redacted, and keeps online play on the browser device-auth fallback. PGN and
  invite copying use a Clipboard API + selection fallback for WebViews.
- Bundle tooling produces deterministic signed ZIPs, Ed25519 descriptors, and a
  release manifest. Tool tests cover ZIP determinism, traversal rejection,
  signing-payload stability, signature/tamper detection, semver ordering,
  catalog generation/sorting, and release selection.
- The shared catalog contract validates `games.json`, resolves browser links,
  fetches over HTTP, and gives Flutter/React Native typed models for custom game
  panels. It is covered by 3 host-core tests.
- A responsive browser launcher reads the same catalog and renders search,
  filters, a featured game, themed cards, and coming-soon titles. Its 8 tests
  cover catalog helpers and the native launch bridge, and it builds together
  with Chess as a deployable static web app.
- `@moongames/host-core` verifies sizes, SHA-256 digests, and Ed25519 signatures
  with the same payload contract on web/native JavaScript runtimes; its 8 tests
  include a cross-check against Node-generated signatures, catalog behavior, and
  native launch-query parsing.
- The React Native host package implements remote/cache/bundled resolution,
  pinned keys, downgrade rejection, the full WebView bridge, and native launch
  queries. It typechecks against local native-module shims.
- The Flutter host package implements the same resolution, bridge, and launch
  query contract.
  Dart 3.13 formatting and a pure-Dart harness validated the descriptor,
  signature, archive, remote, cache, offline, and bundled paths against a real
  signed Chess release. The WebView widget was also typechecked against local
  platform API stubs. The Flutter SDK is not installed here, so
  `flutter analyze/test` and an app build remain outstanding.
- `pnpm smoke:online` runs real WebSocket clients against Nakama and verifies
  private seating, spectator join/read-only behavior/result delivery, moves,
  clock broadcasts, reconnect, state snapshots, resignation, matchmaker pairing,
  delayed quick-table fallback, draw agreement, casual/rated persistence, Elo
  changes, history, and leaderboard records.

Current local automation: 22 core + 19 web + 8 host-core + 8 launcher
TypeScript tests, 8 tool tests, and 57 Lua tests (122 passing tests total,
excluding the Flutter tests that require the Flutter SDK). Manual browser QA of
the catalog menu, AI, spectator, invite, replay, and online/profile flows, plus
Android Chrome/Flutter/React Native device testing, is still required.

Optional chat/quick messages are tracked in `TODO.md`.
