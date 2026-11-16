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
- [x] Add an equivalent Flutter launcher shell on top of the catalog client and `MoonGamesHost`.
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

## Phase 7.6 — Host-platform social, accounts, invites, and notifications

### Locked product decisions

- [x] MoonGames is a platform for vetted Flutter, React Native, and web host apps; only official MoonGames games are published for now.
- [x] MoonGames owns one global identity, the global friend graph, launcher DMs, launcher notifications, and game invites.
- [x] Host apps keep their own social/DM system and data. MoonGames does not read or write host databases.
- [x] MoonGames sends invite events and card data to the host SDK; the host maps the recipient by username and posts the card in its own DM UI.
- [x] Both chat surfaces can receive an invite: MoonGames launcher chat and the host app's own DM UI.
- [x] Groups are out of scope for this milestone. Only direct friend invites are planned.
- [x] The default embedded launcher is the web launcher inside a WebView. Native Flutter/RN launcher components remain optional.
- [x] Host apps can build their own native screens through the MoonGames SDK and must be able to reach parity with the web launcher.
- [x] Host apps provide email and username from their own signed-in account. Email is the stable identity key; username syncs when it changes.
- [x] First link asks the user to agree, choose a MoonGames password, and creates the global account. No host backend is required.
- [x] Existing-account access requires the MoonGames password, preventing a host app from silently taking over an account by supplying a fake email.
- [x] A matching email links to the same MoonGames account. A username collision is non-fatal: the guest name is preserved, the host sees the actual returned name, and can ask for another before calling username sync.
- [x] Email verification and password reset remain blocked on operator SMTP; the host's verified email is accepted for vetted apps during development.
- [x] Headless SDK events drive host-owned notification/invite UI. MoonGames renders its own notification center only in the launcher.
- [x] OS push notifications are not in this milestone; sockets plus queued in-app notifications are.
- [x] Emoji pickers belong to MoonGames-owned chat surfaces (launcher friend chat and in-game match chat), not host-owned chat.
- [x] Invite creation uses the authoritative game backend; invites expire and unfilled rooms are cleaned up.
- [x] Recent-player invites can merge MoonGames match history with a host-provided player list.

### Shared contracts and backend

- [x] Add versioned social types/constants to `Games/shared/sdk` for friends, DMs, invites, notifications, and invite-card payloads.
- [x] Add a shared Lua social module under `Games/shared/server/`; keep game rules out of it and register room creation per game.
- [x] Add RPCs for friend request/accept/decline/remove event notifications.
- [x] Add RPCs for invite create/resolve/accept/decline/cancel plus unread notification state.
- [x] Store invite records and notification read state in Nakama storage; never persist temporary match chat.
- [x] Add hashed invite tokens with expiry, recipient checks, friend checks, and idempotent accept/decline/cancel.
- [x] Register Chess invite-room creation through the shared registry without moving Chess rules into shared code.
- [x] Add recent-player tracking from completed authoritative matches.
- [x] Add automated shared Lua tests for invite state, expiry, authorization, notification read state, and RPC context forwarding.
- [x] Sync shared social modules in `Games/tools/sync-nakama-modules.sh` and document the server contract.

### Web launcher

- [x] Add a notification bell/center with unread badge, filters, mark-read, and empty/error states.
- [x] Generate notifications for friend requests, accepts, declines, cancels, invites, and invite status changes. DMs surface as unread message alerts.
- [x] Add invite actions from friends and recent players with game/mode selection.
- [x] Render invite cards in DMs with join, accept, decline, cancel, expired, and already-joined states.
- [x] Add emoji picker and recent emojis to launcher friend chat and match chat.
- [x] Add a shareable invite link and deep-link handling for `moongames://invite/<token>` and `/invite/<token>`.
- [x] Keep notification/read state synced across tabs and launcher relaunches using Nakama read state plus `BroadcastChannel` refresh.
- [x] Page through Nakama's oldest-first notification cursor, refresh on focus/visibility, and re-read Alerts when opened so new invites cannot be hidden behind older notifications.
- [x] Send a persisted direct-chat invite card from in-game invites and show an in-game invite banner with accept/dismiss.
- [x] Add focused web tests for notification normalization, notification pagination, direct-chat invite cards, invite state, cross-client invite parsing, and emoji insertion.

### Host SDKs

- [x] Add host-facing account-link, friend, DM, invite, notification, catalog, and launch APIs to the shared TypeScript SDK.
- [x] Add a documented invite event stream with replay of pending events after reconnect.
- [x] Add invite card payloads containing preview art, game title, sender, room/join URL, expiry, status, and safe metadata.
- [x] Add `linkHostAccount` with new-account/password and existing-account/password flows.
- [x] Add Flutter high-level social/invite/notification controllers using the official `nakama` Dart package.
- [x] Add React Native high-level social/invite/notification controllers using `@heroiclabs/nakama-js`.
- [ ] Add optional host identity attestation hooks so a host with a backend can replace password-gated linking later.
- [x] Add SDK docs and examples for custom invitation cards and custom native notification centers.
- [x] Add focused SDK tests; do not require Flutter/RN device builds for pure logic tests.

### Validation

- [x] Run focused web, SDK, Lua, and tools tests.
- [x] Run real Nakama account/link/invite/notification smoke tests.
- [x] Verify two real users can invite, accept, join, decline, cancel, and see read-state changes.
- [x] Verify offline invite queue delivery after reconnect.
- [ ] Verify launcher friend chat and match chat emoji rendering on desktop and mobile widths. Model insertion tests pass; visual device verification is still required.
- [x] Verify temporary match chat is never persisted while invite/DM records are.
- [x] Document remaining Flutter/RN device and SMTP blockers.

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
- [x] Carrom deterministic physics core (240 Hz fixed step, 60 Hz capture
  frames, elastic disc collisions, pocket capture, deterministic replay).
- [x] Carrom rules layer (turn continuation, opponent pockets, striker foul
  with a returned piece, queen pocket/cover cycle, last-piece protection, win
  condition) with 24 core tests including a full AI match and the two, three,
  and four player opening medallions.
- [x] Carrom web UI (canvas board drawn to the ICF board spec: 74 cm surface,
  4.45 cm pockets, baseline strips with red base circles, diagonal foul lines,
  centre and outer circles, procedural wood, painted men), pull-back and
  direct aiming, score board, rules dialog, generated sound, haptics,
  light/dark theme, fullscreen, lite paint path) with 6 web tests.
- [x] Carrom simulation-backed AI that yields between candidate batches so a
  phone browser keeps painting.
- [x] Carrom `0.4.0` signed release, catalog entry, and launcher card.
- [x] Carrom `0.5.0`: one points bar above the table with the standard count
  (a man is one point, the queen three), a striker control that sits on the
  board on the side of the player whose turn it is, the table chat reachable
  in fullscreen, and the table settings moved out of the board controls.
- [x] Carrom game types (Classic, Freestyle, Practice), striker skins that
  change how hard a shot leaves the baseline, and a shot clock, all kept by
  the authoritative server so both players play the same table.
- [x] Carrom challenge tables: a solo table with a target, the trick shot mode
  the mobile carrom apps are built around.
- [x] The Carrom table turns for a player who is sitting at their own
  screen, so their striker is always at hand level. A table played on one
  device is shared, so it is never turned.
- [x] The Carrom client speaks for itself: it connects on its own, it knows
  the player by their account name, it says and sounds every shot, and it
  says when it is your turn.
- [x] The hardcoding sweep across the platform: the shared host preview no
  longer claims to be Chess, both titles take their game id and their
  storage keys from the build, and the shared profile panel shows the
  counters under the names the title gives them.
- [x] Launcher rebuilt around catalog data: generated artwork for unknown
  games, a real launch phase pipeline for the play button, no hardcoded game
  list, and a data driven time control.
- [x] Shared game UI kit at `Games/shared/gameui/`: the account panel, the
  profile panel, the table chat and its emoji picker, the friend invite
  dialog, the player card, the action toolbar, the mode switch, the replay
  chrome, the icon set, the auth and invite helpers, and the host preview.
  Chess and Carrom share one implementation.
- [x] Carrom pocket box, shared profile panel, fullscreen table that shows
  only the board and its controls, and an AI that misses like a player.
- [x] A graceful message when the other player leaves, in both titles.
- [x] Carrom authoritative Nakama server (Lua port of the physics and rules)
  with seats for two, three, and four players, the room creator keeping the
  first colour, spectators, a rate limited table chat, and the shared invite
  room hook.
- [x] Carrom online client: shared account session, launcher Nakama address,
  atomic matchmaker, private rooms, room codes, and a local replay of the
  authoritative shot.
- [x] Carrom rules and physics parity vectors shared with the Lua server, and
  a live smoke test for two and four player tables.
- [x] Carrom in-game friend picker, invite banner, and the shared chat
  emoji picker.
- [ ] Carrom offline four player table and ratings or history.
- [ ] Carrom two against two team mode, where the turn order crosses the
  teams.
- [ ] Generated artwork for unknown games in the native React Native and
  Flutter launchers (both currently fall back to a generic board icon).
- [ ] The cancel button in a persisted chat invite card does nothing. The
  card in the chat keeps the invite it was sent with, so the server changes
  the invite when it is cancelled but the card still shows a pending invite
  and offers to cancel it again. The chat message has to be given the
  invite the server returns, so the card shows the new state.
- [ ] The launcher invite composer can get stuck busy. If sending the
  invite throws, the busy flag is never cleared, so the cancel button stops
  working and the send button stays disabled. The busy flag has to be
  cleared when the send fails.
- [ ] Chess and Carrom private rooms keep their room code after the table
  is left, so a code can be read for a table that no longer exists. The
  code has to be dropped with the table.
- [x] The Chess online smoke test failed on "alice history should include
  replay SANs". The history carried the moves under `steps`, and the test
  looked for them under `sans`, so the test was wrong and the history was
  right. The smoke test passes from end to end now.
- [ ] The local stack has to be started by hand after the machine wakes
  up, and the launcher then says "MoonGames is offline" until the page is
  reloaded. The launcher now keeps trying on its own, but the stack itself
  should come back by itself, so a phone that was asleep wakes up with a
  working menu.

## Phase 9 — Taking from lichess

The lichess sources are cloned beside the project (`lila/`, ignored by git)
so the rules, the sounds and the ways of playing can be read and taken.
The licences of everything taken are named beside it.

### The customizations of the table — done

Every choice in lichess's `ui/lib/src/prefs.ts` is now ours, and the panel
that offers them is shared by every title (`Games/shared/gameui/`).

- [x] The sets of pieces: forty-two sets came with the game, each with its
  own licence named in `Games/Chess/web/public/pieces/PIECES.txt`. The
  pieces the game draws itself stay the default.
- [x] The boards: the boards of lichess themselves, wood with its grain,
  marble, leather, plastic, canvas, newspaper, and the rest, copied with
  the game and named in `Games/Chess/web/public/boards/BOARDS.txt`. The
  board of the game itself keeps its own colours.
- [x] The coordinates: hidden, inside every square, on the edge, or both.
- [x] How fast a piece travels: off, fast, normal, slow.
- [x] The sound: nine sets of sounds, the volume, and a table that can be
  quiet.
- [x] Whether the squares a piece may go to and the squares of the last
  move are marked.
- [x] A pawn that reaches the last rank: always ask, ask with the queen
  one click away, or always a queen.
- [x] How a piece is moved: by a click, by a drag, or by either.
- [x] The tenths of the clock: never, below ten seconds, or always.
- [x] The corner of the board that is dragged to make the board bigger or
  smaller, and the size kept on the device.
- [x] The replay of a finished game: never, only for slow games, or always.
- [x] The names of the pieces hidden in the notation.
- [x] A move written with the keyboard.
- [x] A move ready for the turn after this one, while the other side
  thinks.
- [x] The choices are kept on the device, per game, with a shared room
  underneath for the choice made once for every game.
- [x] The screen is three lines, the way lichess keeps it: the pieces, the
  board, and the sound, each with a picture of what is chosen, and the rest
  behind "More settings".

### The desk and the editor — done

- [x] The desk: a game brought in as PGN or a position as FEN, walked
  through move by move on the board, and a game of the player's own played
  from the position on it.
- [x] The editor: the pieces put on a board by hand, the side to move, the
  castling rights, and the counters, written down as a position the engine
  can play from.
- [x] A game brought in can be added to the player's own games. The server
  plays the moves out again with its own rules first, so a game that cannot
  be played is refused, and the rating is not touched.

### The ratings — done

- [x] The ratings are in the Glicko-2 system, so a player who has played
  little is treated as uncertain and their rating settles down.
- [x] The profile shows how far the rating may be from the truth, and the
  rating over the games that were played is drawn as a line.

### The engine — done

The engine runs on the server, the way it does on lichess, and the client
asks it over the network. The engine never runs inside the phone, so it
works the same on every device.

- [x] The engine service (`Games/tools/engine-service/`), which owns
  Stockfish and answers the same call lichess answers:
  `POST /api/external-engine/{id}/analyse`, answered with a stream of
  lines, each one an evaluation deeper than the last.
- [x] The client of that call, ported from lichess's external engine: the
  position and the search are sent, and the answer is read line by line so
  the player sees the engine think.
- [x] The bar that says who is better, and the line the engine is thinking
  about, ported from lichess's gauge and principal variation.
- [x] The winning chances of a number, with the same constant lichess uses,
  so a number means the same thing here as it does there.
- [x] The engine is reached through the same address as the menu and the
  games, so a tunnel or a CDN needs that one address.
- [x] The engine is a service of the stack, built and started with it.
- [x] The moves of the engine can be played on the board by clicking them,
  the way lichess does. The line is shown for now.
- [x] The line of the engine can be looked at on a little board, and the
  engine can be asked to look deeper.
- [x] The report of a finished game: the engine looks at every position and
  the moves that gave the most away are marked `?!`, `?` and `??`, on the
  same lines lichess draws them, so a move that is a blunder there is a
  blunder here. The biggest mistake is named at the top.

### The trainer — done

- [x] The coordinate trainer, ported from lichess: a coordinate is named
  and the square is found, or a square is marked and the coordinate is
  written. The clock runs for thirty seconds unless the time is turned
  off, the side of the board may be random, only the files and the ranks
  that were chosen are used, and the score of every round is kept and
  drawn.
- [ ] The opening trainer, which asks the moves of an opening and says
  whether they are right. It needs the opening book that the explorer
  needs.

### The opening explorer — done

The explorer is the tree of the openings people play here. The book is made
on the server from the games that were played on this platform, so the
tree is the tree of the moves, as it is on lichess, and every player sees
the same one.

- [x] The book is read from the history of every game on the server, each
  game counted once though each player has a record of it, and the older
  games that kept only their PGN count too.
- [x] The tree is walked by clicking a move; the board shows the place
  the player has come to, and the path can be walked back.
- [x] The moves are shown with how many games played them, and the games
  behind the place are named, with both players and the result.

### The puzzles — done

The puzzles are the positions to solve, and they are made from the games
that were played here: the engine looks at a game and the moves where a
player gave away the most become puzzles. The lines the mistakes are
drawn at are the ones lichess draws them at.

- [x] The engine looks at every position of a game and the mistakes in it
  become puzzles: the position before the mistake, and the move that
  should have been played there. A position that is already won, or
  already lost, is not worth a puzzle.
- [x] The server does not take a puzzle on trust: the game is played out
  again with the rules of the server, and a puzzle whose position is not
  in that game, or whose answer cannot be played there, is refused.
- [x] The puzzles are the same for everybody, and each player keeps their
  own record of the ones they have solved.
- [x] The streak: the puzzles solved in a row, and the most in a row. A
  wrong answer ends the run, the way it does on lichess.

### The storm — done

The storm is the puzzles with a clock on them: as many as can be solved in
three minutes. It is the same puzzles as the practice board, and the run
keeps its own score, so the streak of the practice board is not touched
by it.

- [x] A run of three minutes, the puzzles one at a time, and the score of
  the ones solved.
- [x] The answer is kept back by the server until the move has been made,
  so it is not in the hands of the client before the player has found it.

### What lichess has that we do not — to take next

- [x] The opening explorer: the openings people play, with the games they
  came from. The book is the games of this platform, since there is no
  other book to read.
- [x] Puzzles: positions to solve, and a streak.
- [ ] The storm and the racer, which are the puzzles with a clock on them.
  The storm is done; the racer, where the puzzles are solved against the
  clock and against other players, is not.
- [ ] The opening trainer, and the practice game against the computer.
- [ ] Tournaments: an arena, a swiss, and a round of games.
- [ ] The badges and the titles a player earns.
- [ ] The dashboard: the puzzles, the streak, the ratings, and the games
  played, all in one place.
- [ ] The reports, the appeals, and the moderation of a community.
- [ ] The voice chat of a table (we have the written one).
