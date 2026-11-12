# MoonGames TODO

## Decisions locked

- [x] Portable web bundle per game, loaded by thin Flutter/RN wrappers.
- [x] Web first for development; wrappers after the game is stable.
- [x] Chess local pass-and-play first, then online.
- [x] Chess v1 target modes: local, online quick match, private match, AI, spectators.
- [x] Clean MoonGames default visual style.
- [x] Device guest auth plus email/password account upgrade and sign-in; social auth later.
- [x] Share one launcher identity across all verified official games; no per-game account choice for official titles. Independent games keep their own auth.
- [x] Local Nakama for development; VPS deployment later.
- [x] Remote download on demand for game packages (with signed bundles and a bundled fallback).
- [x] Original card-game branding for the Uno-style game; "Uno" is only an internal codename.
- [x] Authoritative backend in Lua inside Nakama (Go plugins are unsupported on android/arm64; Rust would need a separate service).
- [x] Central server owned by the operator; players receive clients; server is the source of truth.

## Phase 1 — Foundation

- [x] Create the `Games/` pnpm workspace.
- [x] Define the shared game/host bridge contract in `shared/sdk/`.
- [x] Create the pure TypeScript chess core.
- [x] Add shared chess test vectors.
- [x] Add core unit tests.
- [x] Verify the core with `pnpm test`.

## Phase 2 — Local portable Chess UI

- [x] Build the responsive React/Vite board.
- [x] Add click/tap movement, legal-move hints, last-move highlight, check highlight.
- [x] Add promotion picker.
- [x] Add move history, undo, new game, board flip, theme toggle, PGN copy.
- [x] Verify the production web build.
- [x] Start and verify the local Vite server (`http://localhost:5173/`).

## Phase 3 — Lua authoritative rules

- [x] Implement `Chess/server/chess_rules.lua` with no Nakama dependencies.
- [x] Support FEN, legal moves, castling, en passant, promotion, check, checkmate, stalemate, draws.
- [x] Add Lua parity tests against `Chess/tests/vectors.json`.
- [x] Add JSON-safe move, action, and state serialization matching the TypeScript contract (clock state is handled in Phase 4).

## Phase 4 — Nakama online play

- [x] Add the Lua match handler (`chess_match.lua`).
- [x] Add RPCs for private match creation and quick-match fallback.
- [x] Add Nakama matchmaker integration for atomic two-player pairing.
- [x] Add reconnect and full-state sync, including pending draw offers.
- [x] Add server-authoritative clocks with one-second broadcasts and client interpolation.
- [x] Add resign, draw offers, timeout, and disconnect forfeit.
- [x] Add the online client UI: quick match, private match ID sharing/joining, connection status, clocks, resign/draw controls, and leave match.
- [x] Fall back from the atomic matchmaker to a persistent quick table, with elapsed search time and cancellation.
- [x] Add a real multi-client WebSocket smoke test covering private matches, matchmaker pairing, delayed quick-table fallback, moves, clocks, draw offers, resign, reconnect, and state snapshots.

## Phase 5 — Persistence and progression

- [x] Persist completed games in Nakama storage (`chess_profile`, `chess_history`).
- [x] Add Elo/rating updates: quick matches are rated, private matches are casual.
- [x] Add the authoritative `chess_rating` leaderboard.
- [x] Add match history UI with results and rating changes; persist PGN for later export.
- [x] Add player profile/statistics and profile/leaderboard RPCs.

## Phase 6 — Remaining Chess modes

- [x] AI opponent (on-device Easy/Medium/Hard search).
- [x] Spectator support (read-only match join, state/clock/result updates).
- [x] Private-match invite links for players and spectators.
- [x] Replay/PGN export from stored history.
- [x] Temporary server-relayed match chat for players and spectators.
- [x] Fullscreen board toggle with browser and WebView fallbacks.
- [ ] Optional quick messages (preset table reactions). Deferred until after host wrappers.

## Phase 7 — Host wrappers and delivery

- [x] Shared bundle/release contracts and Ed25519 signing payload.
- [x] Signed game bundle packaging tool.
- [x] Remote manifest, checksum verification, pinned keys, and cache.
- [x] Downgrade rejection for installed bundles.
- [x] Bundled fallback for app-store compliance.
- [x] Generic React Native host package (typechecked against native shims).
- [x] Generic Flutter host package (bundle manager Dart-validated; widget typechecked via stubs; Flutter SDK build pending).
- [x] Web host bridge handling for init, theme, session, pause/resume, and destroy.
- [x] Native launch-query forwarding for invite/deep-link matches.
- [x] Single-file web bundle output for reliable file-backed WebView loading.
- [x] Node release server for local manifests, catalogs, and signed ZIPs.
- [ ] Run `flutter pub get`, `flutter analyze`, `flutter test`, and Android/iOS builds on a Flutter-capable machine.
- [ ] Build and run the React Native host with real native modules on a device.
- [ ] End-to-end tests on Android Chrome, Flutter, and React Native, including remote update and bundled fallback.

## Phase 7.5 — Accounts, catalog, and menus

- [x] Add guest-to-email account upgrades that preserve rating, history, and player name.
- [x] Add the shared launcher guest/email account used by every verified official game.
- [x] Add email/password sign-in with per-server session restore and sign-out isolation.
- [x] Keep host-provided account sessions authoritative and non-managed by the game.
- [x] Reject email credentials over public plaintext HTTP while allowing local development.
- [x] Verify signed release descriptors and catalog release fields before showing official status or enabling shared auth.
- [x] Write the official launcher session into a game-scoped browser handoff and consume it in Chess.
- [x] Pass the shared session, account mode, and Nakama connection through native launch requests.
- [x] Add optional shared-account, official, and release-identity fields to the Flutter and React Native host wrappers.
- [x] Add a React Native launcher shell with a native catalog, signed-release verification, deep-link requests, and shared-account game launch.
- [ ] Add an equivalent Flutter launcher shell on top of the catalog client and `MoonGamesHost`.
- [ ] Device-test native shared handoff, deep links, and session refresh on Android and iOS.
- [x] Add persistent friends using Nakama's built-in friend graph.
- [x] Add persisted personal chats using Nakama direct channels, with live delivery and history.
- [x] Keep friends and personal chats in the launcher account drawer with SVG-only controls.
- [x] Add real-backend launcher account and social smoke tests.
- [ ] Add email verification and password reset when operator SMTP is configured.
- [x] Replace Chess and launcher emoji/font-glyph icons with inline SVG icons.
- [x] Add a versioned `games.json` catalog contract to the shared SDK.
- [x] Add a one-command local stack manager for PostgreSQL, Nakama, launcher, releases, health, logs, and URLs.
- [x] Generate the catalog from game manifests, planned titles, and release data.
- [x] Expose Flutter and React Native catalog clients for custom native game panels.
- [x] Add a responsive browser launcher with search, filters, featured game, and coming-soon titles.
- [x] Assemble the launcher and available web game builds into one deployable directory.
- [ ] Run browser visual QA of the launcher and launch flow.
- [ ] Add real cover art/screenshots when the asset pipeline lands.

## Phase 8 prerequisite — multi-file game loading

Deferred until the games need external assets, audio, or split code. The current
hosts are file-backed and should load only the single-entry subset.

- [ ] Add a generic platform asset-loader adapter for extracted bundles, with a secure local-origin fallback.
- [x] Add a browser host-preview harness that sends host init/theme/session/lifecycle messages and logs outgoing bridge events.
- [x] Keep the browser and native paths on the same built bundle and the same Nakama backend.
- [x] Add remaining web fallbacks for native capabilities: share, sound, haptics, URL opening, and lifecycle.
- [x] Add a clipboard fallback for browsers and WebViews without the Clipboard API.
- [ ] Verify images/audio, ES modules, dynamic imports, Workers, and WASM on Android and iOS WebViews.
- [ ] Gate asset-heavy bundles with a higher `minHostProtocol` and keep the previous compatible single-file build selectable.
- [ ] Add device tests for offline cache and bundled fallback with a multi-file bundle.

## Phase 8 — Other games

- [ ] Uno-style original card game (core, UI, Lua server).
- [ ] Ludo (core, UI, Lua server).
- [ ] Carrom (deterministic physics core, UI, Lua server).
