# MoonGames

Portable games that share one Nakama backend. The first games are **Chess** and
**Carrom**.

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

Carrom/
├── manifest.json          # package metadata and capabilities
├── core/                  # deterministic physics + rules engine (no UI, no network)
└── web/                   # portable canvas board UI (React + Vite)

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
  authoritative online play. The Carrom rules and physics live in
  `Carrom/core/`, split into a deterministic physics step and a rules layer so
  the same behaviour can later move into an authoritative Lua server.
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

The launcher is also the account and social home. A guest or email account is
created once, then every **verified official game** receives that same Nakama
identity through a signed handoff. There is no per-game account choice for
official games. The launcher verifies the release descriptor against pinned
Ed25519 keys and checks the catalog version, SHA-256, size, and key id before it
shows the verified badge or enables shared auth. If verification fails, the
game still opens with its own independent account.

Friends are stored with Nakama's built-in friend graph. Personal chats use
persisted direct-chat channels (`type: 2`), so message history is stored by
Nakama and is not duplicated in a custom database. The launcher Alerts center
covers friend requests, accept/decline/cancel events, invites, invite status
changes, and unread personal messages. Invite cards can be shared in launcher
DMs and opened from `/invite/<token>` or `moongames://invite/<token>`. Friends
or recent opponents can be invited to an authoritative game room; game rules
stay in the game backend. In-game invites write the same persisted invite card
into the direct chat and surface an in-game invite banner, so the recipient can
act without opening the launcher first. The launcher pages through Nakama's
oldest-first notification cursor before sorting, refreshes on focus/visibility,
and re-reads Alerts when opened, so a new invite cannot be hidden behind older
notifications. MoonGames-owned chat surfaces include an emoji picker, while
match chat remains temporary and is never written to history.

```text
https://games.example.com/moongames/games.json
```

The catalog is presentation metadata and is not signed. It never bypasses bundle
verification: hosts still select the ZIP from the signed release manifest, check
the pinned key, verify the descriptor signature, and verify the ZIP before
loading it. See [catalog/README.md](catalog/README.md) for the schema and native
examples, and [launcher/README.md](launcher/README.md) for deployment.

## Environment

`Games/.env` is a tracked fallback source for the stack, setup scripts and the
Nakama server. Edit it to change ports, bind hosts, the watchdog port or the
engine allowlist. Setup copies every entry into `runtime.nakama.yml` under
`runtime.env`, where Lua modules read it through `moongames_config.get` (or
`nk.get_context().env`). An explicit shell environment variable wins over
`.env`; detected machine paths are written to `runtime/env.sh` only when nothing
else set them.

## Commands

```bash
cd Games
pnpm install

# One-command local full stack: PostgreSQL, Nakama, launcher, and releases.
pnpm stack doctor          # check local tools, paths, and build state
pnpm stack start           # start everything; build the web bundle if needed
pnpm stack status          # health, PIDs, and URLs
pnpm stack urls            # local and LAN URLs
pnpm stack credentials     # Nakama console login and server keys
pnpm stack logs nakama --follow
pnpm stack sync            # copy Lua modules and restart Nakama
pnpm stack restart         # restart the managed stack
pnpm stack stop            # stop managed services, including PostgreSQL
pnpm stack stop --keep-db  # leave PostgreSQL running
pnpm stack stop --all      # also stop PostgreSQL if it was started elsewhere

# Focused development servers
pnpm dev:chess
pnpm dev:carrom

# Local multi-game web menu.
# Run dev:chess in another terminal, then open http://localhost:5174/.
pnpm dev:web

# Production web bundle
pnpm build:chess
pnpm build:carrom

# Host-mode browser preview of the production bundle.
# Open http://localhost:4173/?hostPreview=1 after starting this.
pnpm preview:chess

# Build the menu plus every available web game, then preview it.
# Open http://localhost:4174/ after the build.
pnpm build:web
pnpm preview:web

# Touch and low-memory devices automatically use the lighter paint path.
# Force either mode for an A/B comparison on the same device:
#   http://localhost:4174/?perf=full
#   http://localhost:4174/?perf=lite
# The managed stack serves the same bundle through tools/serve-web.mjs with
# Brotli/gzip compression and immutable caching for hashed assets.
pnpm stack start

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
pnpm package:carrom
pnpm release:manifest
pnpm verify:bundle \
  releases/chess/0.7.0/chess-0.7.0.bundle.json \
  releases/chess/0.7.0/chess-0.7.0.zip \
  --key "dev-1=<base64-public-key>"

# End-to-end online smoke test (requires local Nakama)
pnpm smoke:online

# Email/password account flow against local Nakama
pnpm smoke:auth

# Launcher account upgrade and restore against local Nakama
pnpm --filter @moongames/launcher smoke:account

# Friends, direct chat, live delivery, and persisted history against local Nakama
pnpm --filter @moongames/launcher smoke:social

# Invites, notifications, offline replay, and invite cards against local Nakama
pnpm --filter @moongames/launcher smoke:invite
```

`pnpm stack start` is the normal local development entry point. It syncs the
Lua modules, starts PostgreSQL and Nakama, serves the assembled launcher at
`http://localhost:4174/`, and serves signed releases at
`http://127.0.0.1:8099/`. The launcher, release server, Nakama API, and Nakama
console also listen on all interfaces for local-network testing; run
`pnpm stack urls` to print their LAN addresses. A browser that opens the
launcher from another device automatically uses Nakama on that same host.
Set the corresponding `MOONGAMES_*_HOST` variable to `127.0.0.1` to restrict a
service to loopback. PostgreSQL remains loopback-only because clients do not
connect to it directly. Managed PIDs, logs, and state live under
`runtime/stack/`, which is ignored by git. The script locates the Nakama config
at `~/nakama/nakama.yml`, `~/nakama/local.yml`, the repository root
`nakama.yml`/`local.yml`, or `Games/runtime/nakama.yml`, and locates the binary
at the repository root, `~/nakama/nakama`, or `PATH`. Override paths and ports
with the `MOONGAMES_*` variables listed by `pnpm stack help`.

`pnpm package:chess` builds Chess, creates a deterministic ZIP, signs its
descriptor, and writes `releases/chess/<version>/`. `pnpm release:manifest`
indexes descriptors under `releases/`. Pass `--base-url` to either tool for a
CDN deployment, and pass `--key keyId=base64` to `release:manifest` and
`verify:bundle` to pin production keys. The dev key is generated under `.keys/`
and is ignored by git.

Online development uses automatic guest authentication by default. The launcher
account drawer can create an email/password account that upgrades the current
guest, keeping its rating and history, or sign in to an existing email account.
The same account is shared by every verified official game; independent games
keep their own auth. Email sessions are stored per Nakama server, refreshed when
the launcher loads, and cleared when they are no longer valid. Signing out
returns to a fresh guest identity so the upgraded device does not re-enter the
email account automatically. A host-supplied Nakama session takes precedence and
is shown as a shared app account. Email credentials are rejected over public
plaintext HTTP; loopback and private-network HTTP remain available for local
development.

Friends and personal chats live in the launcher's account drawer. Friend
requests use Nakama's friend graph, and personal messages use persisted direct
channels. Direct channels are resolved by joining the other player's user id;
both participants receive the same `4.<sorted-user-ids>.` channel. Chat history
is loaded from Nakama, so it survives reloads and devices. Match chat in Chess is
separate, rate-limited, temporary, and cleared at game end.

The browser defaults to Nakama at `http://<current-page-host>:7350`; the server
address is editable in the Online panel. Opening the launcher at
`http://<LAN-IP>:4174/` therefore uses `http://<LAN-IP>:7350` automatically.
Production builds can set
`VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT`, `VITE_NAKAMA_SSL`, and
`VITE_NAKAMA_SERVER_KEY` at build time. The server key is not a secret in the
same way as a database password; it is the public Nakama game-server key. The
launcher build also accepts `VITE_MOONGAMES_TRUSTED_KEYS` (pinned
`keyId=publicKey` pairs) and `VITE_RELEASE_MANIFEST_URL`; see
[launcher/README.md](launcher/README.md). Replace the development signer before
public deployment.

## Current status

Phases 1–7.6 are code-complete except optional host attestation, visual
mobile QA, and real-device build validation:

- There is now a **shared game UI kit** at `Games/shared/gameui/`. The account
  panel, the profile panel with the rating, history, and leaderboard, the table
  chat with its emoji picker, the friend invite dialog, the player card, the
  action toolbar, the mode switch, the replay chrome, the icon set, the auth
  helpers, the invite helpers, and the host preview panel live there. Chess and
  Carrom both render the same components, and a future title gets them for
  free. The profile, history, leaderboard, account, and chat contracts are one
  shape for every title.
- The launcher reads the shared play counts, so the most played title sits in
  the middle of the orbit and the rest of the library circles it.
- Carrom is the second official title. It runs on the launcher's Nakama
  server, with the shared account session, two, three, and four player
  tables, spectators, table chat, ratings, a pocket box, and a fullscreen
  table that shows only the board and its controls.

- The TypeScript chess core is implemented and covered by 22 passing tests.
- The portable web client has 26 passing tests for invite links, native launch
  contexts, Lua empty-array normalization, temporary-chat cleanup, history
  replay, tagged PGN export, bundle/manifest contracts, browser host-preview
  messaging/session redaction, clipboard fallback, and account validation/error
  mapping.
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
- The authoritative Nakama match handler, protocol, RPCs, matchmaker hook,
  progression, and shared social modules are covered by 60 additional Lua tests
  (8 protocol, 23 match, 9 profile, 21 rules, 20 shared social), for 81 Lua
  tests in total.
- Online Chess is wired into the web UI with quick match, private match IDs,
  guest sign-in, email/password accounts, host-supplied sessions, connection
  status, authoritative clocks, reconnect, resign, draw offers, and server
  results. Email accounts upgrade the current guest by default, preserving
  rating and history, and use Nakama's built-in email authentication.
- Quick match uses Nakama's atomic matchmaker for every player searching at the
  same time. A room is created only when the matchmaker pairs an opponent;
  waiting never opens a table. The search UI shows elapsed time and can be
  cancelled without leaving a queued ticket.
- Spectators can join a live or finished match in read-only mode. They receive
  state snapshots, clocks, and results without occupying a seat, and the match
  UI shows the current spectator gallery.
- Private matches expose copyable player and spectator invite links. Opening a
  link selects Online mode, connects, and joins the target match with the right
  role. Native hosts can forward the same query from an app deep link through
  `launchQuery`; registering the platform URL scheme remains app-side.
- Completed games are persisted in Nakama storage. Quick matches update Glicko-2
  ratings (default 1200); private matches are casual and do not change
  ratings. Ratings, wins/losses/draws, recent results (with SANs and PGN), and
  the `chess_rating` leaderboard are rendered in the web sidebar.
- Recent games can be replayed ply-by-ply from profile history, with board
  flipping, PGN copy, and PGN download.
- The board uses a responsive framed layout with inline SVG pieces, restrained
  move/selection/check animations, and a fullscreen toggle. Fullscreen uses the
  browser API when available and falls back to a fixed viewport layer in
  embedded WebViews, so clocks and the board stay visible at any size.
- Online matches include a floating temporary chat panel for players and
  spectators. The authoritative server rate-limits, normalizes, and broadcasts
  messages, includes recent messages in reconnect snapshots, and clears chat
  before the final result is broadcast. Nothing is written to history.
- The browser supports a host-mode preview at `?hostPreview=1`: it sends the
  same init/theme/session/lifecycle messages as a native host, supports optional
  host session token injection, logs outgoing bridge events with tokens
  redacted, and keeps online play on the browser device-auth fallback. PGN and
  invite copying use a Clipboard API + selection fallback for WebViews.
- Browser fallbacks cover lifecycle pause/resume, haptics, sound events, safe
  external URLs, and native/Web Share with a clipboard fallback. Flutter and
  React Native hosts handle the same bridge events through their platform
  services.
- Chess and the launcher use inline SVG icons throughout instead of emoji or
  font-glyph controls, with custom game artwork for Chess, cards, Ludo, and
  Carrom.
- Bundle tooling produces deterministic signed ZIPs, Ed25519 descriptors, and a
  release manifest. Tool tests cover ZIP determinism, traversal rejection,
  signing-payload stability, signature/tamper detection, semver ordering,
  catalog generation/sorting, and release selection.
- The shared catalog contract validates `games.json`, resolves browser links,
  fetches over HTTP, and gives Flutter/React Native typed models for custom game
  panels. It is covered by 3 host-core tests.
- A responsive browser launcher reads the same catalog and renders search,
  filters, a featured game, themed cards, and coming-soon titles. It includes a
  shared launcher account, verified-release badges, friends, personal chats,
  and the native launch bridge. Its 35 tests cover account validation, release
  proofs, the signed web handoff, social/invite helpers, shared social RPC
  clients, notification pagination, direct-chat invite cards, catalog helpers,
  and native launch options. It builds together with Chess as a deployable
  static web app.
- `@moongames/host-core` verifies sizes, SHA-256 digests, and Ed25519 signatures
  with the same payload contract on web/native JavaScript runtimes; its 14
  tests include a cross-check against Node-generated signatures, catalog
  behavior, native launch-query parsing, catalog release proofs, and
  shared-account launch-config construction.
- The React Native host package implements remote/cache/bundled resolution,
  pinned keys, downgrade rejection, the full WebView bridge, and native launch
  queries. It also ships a native `MoonGamesLauncher` catalog with SVG controls,
  signed-release badges, deep-link handling, the verified shared-account
  gate. It typechecks against local native-module shims.
- The Flutter host package implements the same resolution, bridge, and launch
  query contract.
  Dart 3.13 formatting and a pure-Dart harness validated the descriptor,
  signature, archive, remote, cache, offline, and bundled paths against a real
  signed Chess release. The WebView widget was also typechecked against local
  platform API stubs. The optional Flutter `MoonGamesLauncher` shell mirrors the
  React Native verified-release gate, and its pure-Dart proof and social-model
  harnesses pass. The Flutter SDK is not installed here, so `flutter
  analyze/test` and an app build remain outstanding.
- `pnpm smoke:online` runs real WebSocket clients against Nakama and verifies
  private seating, spectator join/read-only behavior/result delivery,
  player/spectator chat, moves, clock broadcasts, reconnect, state snapshots,
  resignation, matchmaker pairing, delayed quick-table fallback, draw
  agreement, casual/rated persistence, rating changes, history, and leaderboard
  records.
- Carrom is the second official title and ships as a local and online
  release (`0.3.0`, signed with `dev-1`) with the `local`, `ai`, `online`,
  `private-match`, and `spectators` capabilities.
- The Carrom board follows the International Carrom Federation standard for a
  74 cm playing surface: 3.1 cm men, a 4.13 cm striker weighing 15 g, 4.45 cm
  corner pockets, a baseline strip of two lines 3.8 cm apart closed by red
  base circles of 3.8 cm, diagonal foul lines with arrows running to each
  pocket, a red centre circle the size of one piece, and the 47.5 cm outer
  circle around the opening medallion. The 19 pieces open in the ICF layout:
  the queen on the centre spot, six men touching it, and twelve men touching
  the inner ring, with white men on the axis of the first player.
- The Carrom core is a deterministic fixed-step physics engine (240 Hz, with
  60 Hz capture frames) plus a separate rules layer. It models elastic disc
  and striker collisions with the striker nearly three times heavier than a
  man, wall bounces, pocket capture, and friction, so an identical shot always
  produces an identical result. The same shot is used by the local UI, the AI
  search, and the authoritative server.
- Carrom rules cover turn continuation on an own pocket, opponent pockets,
  striker fouls with a returned piece, the queen pocket/cover cycle including
  the queen returning to the centre when it is not covered, protection of the
  last piece until the queen is covered, and the win condition. They are
  covered by 24 core tests, including the ICF board proportions, the opening
  medallion for two, three, and four players, the seating order around the
  table, and a full AI match that finishes with a winner and no deadlock.
- The Carrom AI is a simulation-backed opponent. It proposes pocket lines and
  striker positions, scores them by simulating each candidate, and plays the
  best one. The search yields between batches so a phone browser keeps
  painting, and the synchronous variant returns the identical shot for tests
  and server use.
- The Carrom web client renders the board procedurally on a canvas: a rosewood
  frame with streaks and a bevel, a mango playing surface with wood grain,
  knots, a varnish sheen and powder speckle, the ICF markings, and painted
  wooden men with bevelled rims, engraved rings, and contact shadows. Aiming
  supports pull-back (slingshot) and direct styles, both with a launch arrow,
  a first-contact ghost, and a power ring. It also ships a rules dialog, a
  score board with per-piece pips, turn and queen status, generated wooden
  sounds, haptics, light/dark themes, fullscreen, and the shared lite paint
  path for low-memory devices. Its 6 tests cover the power curve, both aim
  styles, baselines, frame interpolation, and the aim raycast.
- Carrom online runs on the launcher's Nakama server. A verified launch uses
  the shared account session and the launcher's server address; a direct launch
  falls back to a guest device identity on the same server. The web client
  connects over the realtime socket, finds a table through the atomic
  matchmaker, opens private rooms, joins by room code, and renders the
  authoritative state.
- The Carrom table shows a pocket box with every pocketed piece, the shared
  profile panel with the rating, history, and leaderboard, the shared account
  panel, the shared table chat, and a fullscreen mode that leaves only the
  board and its controls on the screen.
- The Carrom AI plays like a person. It reads the table, picks a pocket line,
  and misses the hard ones: the strongest line is the most likely choice, not
  the only one, and the difficulty decides how often it misses.
- When the other player leaves, both titles say so plainly and offer the way
  out, so nobody is left staring at a table that cannot continue.
- The authoritative Carrom server is a Lua runtime module. It owns the seats,
  the turn, the rules, and the result: it simulates every shot itself,
  validates the striker placement, refuses out-of-turn shots, keeps a rate
  limited table chat, and broadcasts the state with the shot so every client
  replays the same animation. Two, three, and four player tables are
  supported, and the room creator keeps the first colour.
- The Carrom progression follows the shared profile shape: a rating, the
  counters, the stats a title owns (pieces pocketed, queens covered, the best
  streak), the finished game history with the shot list, and a rating
  leaderboard.
- Nakama keeps a single matchmaker callback, so the shared module owns it and
  routes a ticket to the game that asked for it. Chess and Carrom therefore
  pair their own tables instead of overwriting each other, and the matchmaker
  query is scoped to the game and table size.
- A table's label follows its state, so a room that has started or finished is
  never handed out as an open table.
- The TypeScript core and the Lua server share the same rules and the same
  physics. Both resolve the reference shot to the same piece positions, and
  that vector is asserted on both sides. The live smoke test creates a room,
  plays a shot, checks that the turn passes, checks that an out-of-turn shot
  is refused, checks that the chat arrives, starts a four player table with
  37 pieces and pairs two players through the atomic matchmaker.
- The launcher no longer hardcodes games. Artwork resolves from the catalog:
  a registered motif when the catalog names one, otherwise a generated mark
  derived from the game id, so a new title never needs a launcher change. The
  play button runs a real launch pipeline (verifying, account, preparing,
  opening, error) with a label for each phase, the hardcoded fallback game
  list is gone, and the invite composer asks for a time control only when the
  catalog marks a game as timed.
- Carrom is listed in the catalog as `available` at `0.2.0`, and the signed
  release manifest indexes 13 bundles (11 Chess, 2 Carrom). The launcher
  renders it as a normal catalog card next to Chess.

Current local automation: 22 core + 26 web + 14 host-core + 42 launcher
TypeScript tests, 25 Carrom core + 6 Carrom web tests, 11 tool tests, and 108
Lua tests (254 passing tests total, excluding Flutter package tests that
require the Flutter SDK). The launcher
account, social, and invite smoke scripts also run against real local Nakama,
and the Carrom online smoke test runs two and four player tables against the
same server. Manual browser QA of the catalog menu, account/social/notification
drawer, verified launch flow, AI, spectator, invite, replay, fullscreen board,
the Carrom table, launcher
and match-chat emoji pickers, and online/profile flows, plus Android
Chrome/Flutter/React Native device testing, is still required.

Current limitations:

- The local Chess release is signed with the development key `dev-1`; pin and
  sign with a production Ed25519 key before public deployment.
- Carrom online tables work, but the in-game invite flow, the friend picker,
  and the match chat are still limited to what the shared launcher services
  already provide. Carrom has no ratings or history yet, and the four player
  table is available online only.
- The Flutter SDK is not installed in this environment, so full Flutter
  analysis/tests and native app builds remain outstanding even though the pure
  Dart proof and social harnesses pass.
- Launcher/match emoji pickers and responsive layouts still need visual QA on
  real Android Chrome, Flutter, React Native, and iOS surfaces.
- Email verification and password reset require operator SMTP configuration.
- OS push notifications are out of scope for this milestone; the launcher uses
  sockets plus persistent in-app notifications.
- Host identity attestation is optional and deferred. Host account linking is
  currently password-gated to prevent silent account takeover.

The remaining device/multi-file work is tracked in `TODO.md`.
