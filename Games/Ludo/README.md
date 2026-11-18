# MoonGames Ludo

The classic four-colour race, built as a first-class MoonGames title.

## Layout

- `core/` — pure TypeScript rules: 52-square track, safe squares, seeded dice,
  captures, walls, exact finish, AI and deterministic replay.
- `server/` — authoritative Nakama Lua: the same rules, the match handler,
  RPCs, progression and Glicko-2 ratings. `tests/vectors.json` is shared with
  the TypeScript core so the two implementations are proven identical.
- `web/` — single-file React app with a hand-drawn canvas board. The board is
  drawn from code, not from a raster image; `reference-board.jpg` is the
  visual reference used while drawing it and is not loaded at runtime.
- `dist/` — production bundle assembled by `pnpm build:ludo`.

## Play

Local pass-and-play supports two to four colours. In computer mode you take
the first seat and the computer drives the rest; Easy, Normal and Hard change
how carefully it chooses moves. Online play has quick tables, private room
codes, spectators and table chat.

A token needs a six to leave its yard. Four baselines form a wall that
opponents cannot enter, captures send a rival home and earn another roll, and
a token must land exactly on its centre square to finish. First player home
wins.

## Verification

```sh
pnpm --filter @moongames/ludo-core typecheck
pnpm --filter @moongames/ludo-core test
pnpm test:lua
pnpm --filter @moongames/ludo-web typecheck
pnpm --filter @moongames/ludo-web test
pnpm build:ludo
pnpm smoke:ludo
```
