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
│   │   ├── protocol.ts # the wire op codes the client and server share
│   │   ├── challenges.ts # the challenge table targets
│   │   └── ai.ts      # simulation-backed opponent search
│   └── test/             # 11 files: rules, physics, parity, teams, AI, ...
├── server/         # authoritative Nakama runtime logic (Lua)
│   ├── carrom_physics.lua
│   ├── carrom_rules.lua
│   ├── carrom_protocol.lua
│   ├── carrom_match.lua
│   ├── carrom_rpc.lua
│   ├── carrom_glicko.lua  # Glicko-2 ratings
│   ├── carrom_profile.lua # profile, history, replay shots, leaderboard
│   └── test/             # 4 files + shared whole-match fixtures
└── web/            # portable canvas board UI (React + Vite)
    ├── public/
    │   ├── art/game/      # 1702 real board, striker, puck and effect images
    │   └── sounds/        # 5 sets of real recorded carrom sounds
    ├── scripts/online-smoke.mjs
    ├── src/
    │   ├── App.tsx
    │   ├── components/   # board, picker, replay, lobby, dialogs, ...
    │   ├── hooks/        # useOnlineCarrom, useArtChoices, ...
    │   └── lib/          # aim, audio, designs, art catalog, physics helpers
    └── test/             # 15 files: board, art, sound coverage, online, ...
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

### The table turns

A player who is sitting at their own screen sees the table turned so their
own side is at the bottom, the way they sit at a real table. Their striker is
then always at hand level, and the striker control sits under their own hand
in one comfortable place.

A table played on one device is shared, so it is **never** turned. There the
striker control moves to the side of the player whose turn it is, because
that is where their striker is.

The turn is animated, so the table swings round instead of jumping, and the
aim keeps following the finger while it moves. The geometry lives in
`core/src/board.ts` (`viewRotation` and `sideForViewer`), and the pointer
math in `web/src/lib/view.ts`; both are covered by tests.

### Names

A player is known by the name on their MoonGames account, which is the shared
session the launcher hands over. The computer opponent is called Computer.
A table played on one device names the seats. Nothing on the table says
"Player" when the account knows better.

### Invites

A player at a table can invite a friend to it. The picker is the shared one:
it lists the friends, takes an incoming friend request, and sends the
invitation with the table. The copied link is the fallback when a friend
cannot be reached.

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

- Place the striker on your baseline between the two lines. The striker
  control sits on the board, on the side of the player whose turn it is, and
  that side is always the bottom of your screen.
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

### Points

The score is counted the way the carrom apps count it: every man is worth one
point and the queen is worth three, so a full table is worth twelve points.
The points bar above the board is the only score display on the table. The
sidebar shows who is sitting where, how many of their colour is left, and
which striker they brought.

### Game types

The type of game is chosen in the table settings and is kept by the server,
so both players play the same game:

| Type | Fouls | Queen | Scoring |
| --- | --- | --- | --- |
| Classic | yes | must be covered | a man is one point, the queen three |
| Freestyle | yes | an ordinary piece | a man is one point, the queen three |
| Practice | no | an ordinary piece | no score |

### Strikers

A striker is a real choice: it changes how hard the shot leaves the
baseline. The striker travels with the shot, and the server keeps the one a
player brought to the table.

| Striker | Power | Mass | Note |
| --- | --- | --- | --- |
| Classic | 1.00 | 1.00 | the standard 15 g striker |
| Heavy | 1.28 | 1.50 | hits through a rattle and travels further |
| Light | 0.72 | 0.70 | a soft touch for short, careful shots |
| Swift | 1.12 | 0.85 | quick off the line, little weight behind it |

### The shot clock

A table can run with a 15, 30, or 60 second clock, or with no clock at all.
When a player runs out of time the turn is handed on without a shot and the
table carries on. Online tables are timed by the server.

### Challenges

A challenge is a solo table with a target: pocket a number of your pieces
inside a number of shots. The challenge table uses the freestyle rules, so
the queen does not need covering and the challenge is only about the shots.

## Physics

`core/src/physics.ts` runs a fixed 240 Hz step with 30 Hz capture frames:

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
  limited table chat, runs the shot clock, and broadcasts the state with the
  shot so every client replays the same animation. The striker and the
  colour travel with the shot, because the striker changes how hard it
  leaves the baseline.
- `carrom_rpc.lua` creates private rooms, pairs the atomic matchmaker, and
  registers the shared invite room hook.

The Lua modules are copied to the local Nakama runtime with
`pnpm stack sync`.

Nakama keeps a single matchmaker callback, so the shared module owns it and
routes a ticket to the game that asked for it. The matchmaker query is scoped
to the game, the table size, the game type, the shot clock and the teams
choice. A quick match room is created only when the matchmaker has paired a
full table, so waiting players never leave empty rooms behind.

## Next

- Keyboard aiming is available when the player turns it on in the preferences.
- The remaining platform work is tracked in `Games/TODO.md`: device QA, a
  generic asset loader for file-backed WebViews, and stack auto-start.

## The table speaks

A player should never have to guess what the table is doing, so the client
says it out loud:

- The table connects by itself. There is no button to press to get into the
  game, and the connection state is shown on the turn strip when something is
  wrong.
- The account is picked up from the shared session, so the player is known by
  their own name, and the rating, the history, and the leaderboard load with
  the connection.
- Every shot is heard and felt: the strike, the pockets, the foul, and the
  win, whether the shot was played on this device or on the server.
- The turn says who is shooting, and a player is told when it is their turn.
- The table tells a player when somebody joins, when the clock runs out, and
  when the other player leaves.
