# Chess server (Lua)

This folder is the authoritative Nakama backend for Chess. It is deliberately
separate from `Chess/web/` and `Chess/core/`; no UI code belongs here.

## Why Lua

- Nakama loads Lua runtime modules natively on every platform.
- Go runtime modules are built as `.so` plugins, and Go does not support
  `-buildmode=plugin` on `android/arm64`, which is the local development host.
- Rust would require a separate service rather than a Nakama runtime module.

The production VPS runs the same Lua modules, so there is no platform-specific
build step between local and production.

## Files

```text
server/
├── chess_rules.lua      # pure rules, no Nakama API calls
├── chess_protocol.lua   # opcodes, time controls, labels, wire helpers
├── chess_match.lua      # authoritative match handler, clocks, reconnect
├── chess_rpc.lua        # match/profile RPCs, matchmaker hook
├── chess_profile.lua    # Elo, profiles, history, leaderboard persistence
├── test/
│   ├── chess_rules_test.lua
│   ├── chess_protocol_test.lua
│   ├── chess_match_test.lua
│   ├── chess_profile_test.lua
│   └── json.lua
└── README.md
```

`chess_rules.lua` is testable outside Nakama with a plain Lua interpreter. The
shared vectors in `../tests/vectors.json` are the parity contract between the
TypeScript client core and the Lua server rules.

## Running the tests

From `Games/`:

```bash
pnpm test:lua
```

Or directly with Lua 5.4:

```bash
lua Chess/server/test/chess_rules_test.lua
lua Chess/server/test/chess_protocol_test.lua
lua Chess/server/test/chess_match_test.lua
lua Chess/server/test/chess_profile_test.lua
```

The rules suite covers the shared parity vectors, perft (initial position to
depth 3 and Kiwipete to depth 2), SAN, castling, en passant, promotion,
checkmate, stalemate, threefold repetition, the fifty-move rule, insufficient
material, undo, FEN round-trips, PGN, and JSON-safe state/action serialization.
The protocol and match suites cover time control parsing, opcodes, seating,
moves, clocks, resign/draw/timeout/disconnect results, reconnect, spectator
join/read-only/result behavior, finished-match viewing, state snapshots, RPCs,
and the matchmaker hook using a fake Nakama dispatcher. The progression suite
covers Elo math, rated/casual/abandoned results, profile statistics, history
ordering, replay SANs, leaderboard writes/reads, versioned storage updates, and
idempotent repeated finalization.

## Real online smoke test

With Nakama running on `127.0.0.1:7350`, run from `Games/`:

```bash
pnpm smoke:online
```

The script authenticates seven device accounts and uses real WebSocket
connections. It verifies a private match (including creator-white reservation),
spectator join/read-only behavior and result delivery, authoritative moves and
clock broadcasts, reconnect within the grace window, draw-offer state snapshots,
resignation, atomic matchmaker pairing, the delayed quick-table fallback, draw
agreement, casual/rated persistence, Elo changes, profile history with SANs, and
leaderboard records. The web client uses the matchmaker first, then calls the
quick-match RPC after five seconds if no concurrent partner is found. That RPC
opens or reuses a persistent open table so players arriving at different times
can still be paired.

Spectators opt in with join metadata `{ spectate: "1" }`. Because Nakama only
exposes join metadata to `match_join_attempt`, the handler records the choice in
`state.pending_joins` until `match_join` runs. Spectators are tracked separately
from the two seated players, capped at 24, and can view a finished match during
the result linger. They cannot move, resign, or offer/accept draws.

## Persistence and ratings

When a match ends, `chess_match.lua` calls
`chess_profile.finalize_match()` before broadcasting `GAME_OVER`. Server writes
are synchronous, so the client can refresh its profile as soon as the result
arrives. Finalization is idempotent: an existing per-player history entry for the
match is used as a completed marker, so a repeated call cannot double-count
statistics or Elo.

- `chess_profile` (collection) stores one owner-private `profile` object per
  player: rating, peak rating, games, wins, losses, draws, rated/casual counts,
  and timestamps.
- `chess_history` stores one owner-private object per player per completed
  match. Each entry contains the match ID, mode, color, outcome, status/reason,
  opponent, move count, SAN list, PGN, final FEN, time control, rating
  before/after/delta, and end time.
- `chess_rating` is an authoritative, descending, `set`-operator leaderboard.
  Its score is the current rating and its metadata carries the player's record.

Quick matches are rated with Elo (default 1200, K=32). Private matches are
casual: they update the win/loss/draw record and history but not the rating.
Only rated matches write to `chess_rating`, so a private-only player stays
unranked. Abandoned matches are recorded without changing statistics or the
leaderboard.

Two RPCs expose progression to the client:

| RPC | Purpose |
| --- | --- |
| `chess_get_profile` | Returns the caller's profile and up to 10 newest history entries. |
| `chess_get_leaderboard` | Returns the top rating records and the caller's own ranked record. |

## Server authority

The server validates every move, controls the clock, owns dice/shuffles, and
decides results. Clients are never trusted for legality, turn order, timing, or
randomness. This is the same model as a hosted multiplayer game server: the
player receives a client, but the server owns the match.

## Status

Phase 6 is complete except for the optional chat/quick-message feature. The pure
Lua rules pass 21 local tests and expose JSON-friendly moves, actions, statuses,
and full match state using the same field names as the TypeScript `ChessState`
contract. The protocol, match, and progression suites add 36 passing tests, for
57 Lua tests in total. Spectator support is authoritative and read-only; finished
matches remain watchable during the result linger. History records now include
the SAN list needed for robust client replay in addition to PGN and final FEN.

The real multi-client smoke test passes against the local Nakama server,
including spectator behavior, rated/casual persistence, Elo changes, history,
and leaderboard records. The next backend work is optional chat/quick messages
when the host wrappers and delivery pipeline are ready.
