import type {
  CarromDisc,
  CarromDiscKind,
  CarromPlayer,
  CarromPoint,
  CarromState,
} from "./types";

/**
 * Board geometry follows the International Carrom Federation standard for a
 * 74 cm square playing surface. Every length below is that measurement
 * divided by 74, so the numbers stay directly comparable to the real board.
 *
 * - playing surface: 74 x 74 cm (ICF allows 73.5 to 74)
 * - carrom man: 3.02 to 3.18 cm across, 5.0 to 5.5 g
 * - striker: up to 4.13 cm across, 15 g
 * - pocket: 4.45 cm across
 * - baseline strip: two lines 3.8 cm apart, closed by red base circles of
 *   3.8 cm, one quarter of the board in from each side
 * - centre circle: one piece wide (3.18 cm); outer circle: 47.5 cm across
 */
export const CARROM_BOARD = {
  discRadius: 0.0216,
  strikerRadius: 0.0279,
  pocketRadius: 0.0301,
  pocketCenters: [
    { x: 0.036, y: 0.036 },
    { x: 0.964, y: 0.036 },
    { x: 0.036, y: 0.964 },
    { x: 0.964, y: 0.964 },
  ] as const,
  baseline: {
    white: 0.75,
    black: 0.25,
  } as const,
  /** Half of the 3.8 cm distance between the two baseline lines. */
  baselineHalfWidth: 0.0257,
  baselineMinX: 0.25,
  baselineMaxX: 0.75,
  /** Red base circles close the baseline strips on all four sides. */
  baseCircleRadius: 0.0257,
  baseCircles: [
    { x: 0.25, y: 0.25 },
    { x: 0.75, y: 0.25 },
    { x: 0.25, y: 0.75 },
    { x: 0.75, y: 0.75 },
  ] as const,
  /** Red centre circle the size of one piece. */
  centerCircleRadius: 0.0215,
  /** The large decorative circle around the opening medallion. */
  outerCircleRadius: 0.321,
  /** Opening medallion: six men around the queen, twelve men outside them. */
  innerRingRadius: 0.0432,
  outerRingRadius: 0.0864,
  friction: 1.45,
  wallRestitution: 0.86,
  discRestitution: 0.92,
  strikerRestitution: 0.95,
  /** A striker is 15 g against 5.0 to 5.5 g for a carrom man. */
  strikerMass: 2.8,
  discMass: 1,
  minShotSpeed: 1,
  maxShotSpeed: 4.6,
  stopSpeed: 0.02,
  stepSeconds: 1 / 240,
  sampleSeconds: 1 / 60,
  maxSimulationSeconds: 9,
} as const;

export const PLAYER_LABEL: Record<CarromPlayer, string> = {
  white: "Ivory",
  black: "Onyx",
};

export function oppositePlayer(player: CarromPlayer): CarromPlayer {
  return player === "white" ? "black" : "white";
}

export function baselineY(player: CarromPlayer): number {
  return CARROM_BOARD.baseline[player];
}

export function clampStrikerX(value: number): number {
  return Math.min(
    CARROM_BOARD.baselineMaxX,
    Math.max(CARROM_BOARD.baselineMinX, value),
  );
}

export function strikerFits(state: CarromState, strikerX: number): boolean {
  const y = baselineY(state.turn);
  const minimum = CARROM_BOARD.discRadius + CARROM_BOARD.strikerRadius + 0.002;
  return state.discs.every(
    (disc) =>
      disc.pocketed ||
      Math.hypot(disc.x - strikerX, disc.y - y) >= minimum,
  );
}

/**
 * Find the nearest legal striker position. This keeps the controls usable
 * when a returned carrom man happens to land near the baseline.
 */
export function nearestValidStrikerX(
  state: CarromState,
  requested: number,
): number {
  const target = clampStrikerX(requested);
  let best = target;
  let bestDistance = Number.POSITIVE_INFINITY;
  const step = 0.002;
  for (
    let x = CARROM_BOARD.baselineMinX;
    x <= CARROM_BOARD.baselineMaxX + 0.0001;
    x += step
  ) {
    if (!strikerFits(state, x)) {
      continue;
    }
    const distance = Math.abs(x - target);
    if (distance < bestDistance) {
      best = x;
      bestDistance = distance;
    }
  }
  return best;
}

export function createInitialState(): CarromState {
  const discs: CarromDisc[] = [
    { id: "queen", kind: "queen", x: 0.5, y: 0.5, pocketed: false },
  ];

  const counts: Record<CarromDiscKind, number> = {
    white: 0,
    black: 0,
    queen: 0,
  };

  const push = (kind: CarromDiscKind, x: number, y: number) => {
    counts[kind] += 1;
    discs.push({
      id: `${kind[0]}${counts[kind]}`,
      kind,
      x,
      y,
      pocketed: false,
    });
  };

  // Six men touch the centre circle and each other. White sits on the axis
  // that points at the first player, matching the ICF opening layout.
  for (let index = 0; index < 6; index += 1) {
    const kind: CarromDiscKind = index % 2 === 0 ? "white" : "black";
    const angle = (Math.PI / 2) + (index * Math.PI) / 3;
    push(
      kind,
      0.5 + Math.cos(angle) * CARROM_BOARD.innerRingRadius,
      0.5 + Math.sin(angle) * CARROM_BOARD.innerRingRadius,
    );
  }

  // Twelve men touch the inner ring. The white men form the three-armed
  // shape that points at the first player.
  for (let index = 0; index < 12; index += 1) {
    const kind: CarromDiscKind = index % 2 === 1 ? "white" : "black";
    const angle = (index * Math.PI) / 6;
    push(
      kind,
      0.5 + Math.cos(angle) * CARROM_BOARD.outerRingRadius,
      0.5 + Math.sin(angle) * CARROM_BOARD.outerRingRadius,
    );
  }

  return {
    discs,
    striker: {
      x: 0.5,
      y: baselineY("white"),
      pocketed: false,
    },
    turn: "white",
    queen: { status: "board" },
    scores: { white: 0, black: 0 },
    status: "aiming",
    winner: null,
    shotNumber: 0,
  };
}

function isOpenSpot(
  discs: CarromDisc[],
  x: number,
  y: number,
  radius: number,
  ignoreId?: string,
): boolean {
  const edge = radius + 0.03;
  if (x < edge || x > 1 - edge || y < edge || y > 1 - edge) {
    return false;
  }
  for (const pocket of CARROM_BOARD.pocketCenters) {
    if (
      Math.hypot(x - pocket.x, y - pocket.y) <
      CARROM_BOARD.pocketRadius + radius
    ) {
      return false;
    }
  }
  return discs.every(
    (disc) =>
      disc.id === ignoreId ||
      disc.pocketed ||
      Math.hypot(disc.x - x, disc.y - y) >=
        CARROM_BOARD.discRadius + radius + 0.002,
  );
}

/**
 * Place a returned piece or the queen without overlapping the existing table.
 * Candidate rings are deterministic so the same shot resolves identically in
 * a replay or on the server.
 */
export function findOpenSpot(
  discs: CarromDisc[],
  preferred: CarromPoint = { x: 0.5, y: 0.5 },
  radius = CARROM_BOARD.discRadius,
  ignoreId?: string,
): CarromPoint {
  if (isOpenSpot(discs, preferred.x, preferred.y, radius, ignoreId)) {
    return preferred;
  }

  const ringRadii = [0.04, 0.07, 0.1, 0.13, 0.16, 0.19, 0.22, 0.26, 0.3];
  for (const ringRadius of ringRadii) {
    for (let index = 0; index < 24; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI) / 12;
      const x = preferred.x + Math.cos(angle) * ringRadius;
      const y = preferred.y + Math.sin(angle) * ringRadius;
      if (isOpenSpot(discs, x, y, radius, ignoreId)) {
        return { x, y };
      }
    }
  }

  return preferred;
}
