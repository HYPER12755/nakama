# Carrom

Carrom is the second official MoonGames title. It ships as a portable web
bundle with the same launch, packaging, signing, and hosting flow as Chess.

```text
Carrom/
├── manifest.json   # package metadata and capabilities (local, ai)
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
│       └── match.test.ts
└── web/            # portable canvas board UI (React + Vite)
    ├── src/
    │   ├── App.tsx
    │   ├── components/
    │   │   ├── CarromBoard.tsx   # canvas board, aiming, animation
    │   │   ├── GameOverDialog.tsx
    │   │   ├── Icon.tsx
    │   │   ├── RulesDialog.tsx
    │   │   └── ScoreCard.tsx
    │   └── lib/
    │       ├── aim.ts    # power curve, aim raycast, frame interpolation
    │       ├── audio.ts  # generated wooden shot sounds
    │       └── theme.ts
    └── test/aim.test.ts
```

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
```

The packaged bundle is served by the managed stack at
`http://localhost:4174/carrom/` and listed in `releases/games.json`.

## Next

- Authoritative Nakama server: a Lua port of the physics and rules, quick
  match, private rooms, spectators, invites, and temporary match chat.
- Shared parity vectors between the TypeScript core and the Lua server.
- Four-player and three-player variants.
