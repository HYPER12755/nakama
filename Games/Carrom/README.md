# Carrom

Carrom is the second official MoonGames title. It ships as a portable web
bundle with the same launch, packaging, signing, and hosting flow as Chess.

```text
Carrom/
├── manifest.json   # package metadata and capabilities (local, ai, online)
├── core/           # deterministic physics + rules engine (no UI, no network)
│   ├── src/
│   │   ├── types.ts
│   │   ├── board.ts   # board constants, opening setup, striker placement
│   │   ├── physics.ts # fixed-step simulation, pockets, collisions
│   │   ├── rules.ts   # carrom rules applied to a finished simulation
│   │   ├── shot.ts    # physics + rules entry point
│   │   └── ai.ts      # simulation-backed opponent search
│   └── test/
│       ├── carrom.test.ts
│       ├── match.test.ts
│       └── parity.test.ts
├── server/         # authoritative Nakama runtime logic (Lua)
│   ├── carrom_physics.lua
│   ├── carrom_rules.lua
│   ├── carrom_protocol.lua
│   ├── carrom_match.lua
│   ├── carrom_rpc.lua
│   └── test/
│       ├── carrom_rules_test.lua
│       └── carrom_match_test.lua
└── web/            # portable canvas board UI (React + Vite)
    ├── scripts/online-smoke.mjs
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── CarromBoard.tsx   # canvas board, aiming, animation
    │   │   ├── EmojiPicker.tsx
    │   │   ├── GameOverDialog.tsx
    │   │   ├── Icon.tsx
    │   │   ├── OnlinePanel.tsx    # lobby, seats, table chat
    │   │   ├── RulesDialog.tsx
    │   │   └── ScoreCard.tsx
    │   ├── hooks/
    │   │   └── useOnlineCarrom.ts # Nakama client, seats, shots, chat
    │   └── lib/
    │       ├── aim.ts    # power curve, aim raycast, frame interpolation
    │       ├── audio.ts  # generated wooden shot sounds
    │       └── theme.ts
    └── test/aim.test.ts
```

## Tables

Two, three, and four player tables are supported. Each side of the board has
its own baseline, so every player shoots from their own edge and the turn
moves clockwise around the table:

| Seat | Colour | Side |
| --- | --- | --- |
| 1 | Ivory | bottom |
| 2 | Amber | left |
| 3 | Onyx | top |
| 4 | Jade | right |

A two player table uses Ivory and Onyx. The room creator keeps the first
colour, whoever joins first otherwise takes the next free colour.

## Board

The board follows the International Carrom Federation standard for a 74 cm
square playing surface. Every measurement in `core/src/board.ts` is that size
divided by 74, so the numbers stay comparable to a real table:

| Feature | Real board | Normalized |
| --- | --- | --- |
| Carrom man | 3.02 to 3.18 cm across | radius 0.0216 |
| Striker | 4.13 cm across, 15 g | radius 0.0279, 2.8x a man |
| Pocket | 4.45 cm across | radius 0.0301 |
| Baseline strip | two lines 3.8 cm apart | half width 0.0257 |
| Base circles | red, 3.8 cm across | radius 0.0257 |
| Centre circle | 3.18 cm across | radius 0.0215 |
| Outer circle | 47.5 cm across | radius 0.321 |

The baseline strips sit a quarter of the way in from each side, closed by red
base circles at the four inner corners, and diagonal foul lines with arrows
run from each circle to its pocket. The 19 pieces open in the ICF layout: the
queen on the centre spot, six men touching the centre circle, and twelve men
touching the inner ring, with white men on the axis of the first player.

## Rules

Two players, ivory and onyx, with nine men each plus the red queen.

- Place the striker on your baseline between the two lines.
- Pull back from your target and release: the striker launches away from the
  pull, with a longer pull meaning a harder shot. A direct style, where the
  striker launches toward your pointer, is available in the aim switch.
- Pocketing your own colour scores a piece and keeps you at the table.
- Pocketing an opponent's piece is a foul and ends your turn.
- A striker in a pocket is a foul: one of your pocketed men returns to the
  table.
- Pocket the queen, then cover it with one of your own pieces on the same or
  the next shot. If you miss the cover, the queen returns to the centre.
- The last piece of a colour cannot finish the board until the queen is
  covered. If it is not, that piece returns and the turn passes.
- The first player to clear all nine of their colour, with the queen covered,
  wins.

## Physics

`core/src/physics.ts` runs a fixed 240 Hz step with 60 Hz capture frames:

- Elastic disc and striker collisions with mass-weighted impulses and
  positional correction. The striker is nearly three times heavier than a car
  man, so a firm shot scatters the cluster instead of tapping it.
- Wall bounces with restitution, and friction applied per step. A maximum
  strength shot runs about three board lengths, matching the ICF requirement
  that a striker must be able to travel three and a half runs.
- Pocket capture when a piece centre reaches the pocket.

The step is deterministic: the same state and shot always produce the same
positions, pockets, and frames. That is what lets the local UI, the AI search,
and a future authoritative server agree on a result.

`core/src/rules.ts` is deliberately separate from the physics. It takes a
finished simulation and applies the carrom rules, so the rule behaviour can be
tested against fabricated pocket outcomes and later ported to Lua.

## Commands

From `Games/`:

```bash
pnpm dev:carrom          # Vite dev server for the Carrom client
pnpm build:carrom        # production build into Carrom/dist/
pnpm package:carrom      # deterministic ZIP + signed descriptor
pnpm --filter @moongames/carrom-core test
pnpm --filter @moongames/carrom-web test
pnpm smoke:carrom        # live two and four player tables against Nakama
```

The packaged bundle is served by the managed stack at
`http://localhost:4174/carrom/` and listed in `releases/games.json`.

## Server

`server/` is the authoritative Nakama backend. It owns the seats, the turn,
the rules, and the result:

- `carrom_physics.lua` and `carrom_rules.lua` are the Lua ports of the
  TypeScript core. The same reference shot resolves to the same piece
  positions on both sides, and both assert it.
- `carrom_match.lua` assigns the seats, starts the table once every seat is
  taken, simulates each shot itself, refuses out-of-turn shots, keeps a rate
  limited table chat, and broadcasts the state with the shot so every client
  replays the same animation.
- `carrom_rpc.lua` creates private rooms, finds open quick tables, pairs the
  atomic matchmaker, and registers the shared invite room hook.

The Lua modules are copied to the local Nakama runtime with
`pnpm stack sync`.

Nakama keeps a single matchmaker callback, so the shared module owns it and
routes a ticket to the game that asked for it. The matchmaker query is scoped
to the game and the table size, and a table's label follows its state so the
quick table lookup never hands out a table that has already started.

## Next

- The in-game friend picker, the invite banner, and the shared chat emoji
  picker for Carrom tables.
- An offline four player table, ratings, and history.
- A parity suite that replays whole matches on both sides.
