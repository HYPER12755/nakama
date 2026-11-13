import type {
  CarromDisc,
  CarromDiscKind,
  CarromPlayer,
  CarromPoint,
  CarromState,
} from "./types";

export const CARROM_BOARD = {
  discRadius: 0.0225,
  strikerRadius: 0.03,
  pocketRadius: 0.043,
  pocketCenters: [
    { x: 0.058, y: 0.058 },
    { x: 0.942, y: 0.058 },
    { x: 0.058, y: 0.942 },
    { x: 0.942, y: 0.942 },
  ] as const,
  baseline: {
    white: 0.805,
    black: 0.195,
  } as const,
  baselineMinX: 0.24,
  baselineMaxX: 0.76,
  queenRingRadius: 0.075,
  outerRingRadius: 0.132,
  friction: 1.75,
  wallRestitution: 0.82,
  discRestitution: 0.9,
  strikerRestitution: 0.93,
  strikerMass: 1.35,
  discMass: 1,
  minShotSpeed: 0.9,
  maxShotSpeed: 3.6,
  stopSpeed: 0.012,
  stepSeconds: 1 / 240,
  sampleSeconds: 1 / 60,
  maxSimulationSeconds: 12,
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

  const innerKinds: CarromDiscKind[] = [
    "white",
    "black",
    "white",
    "black",
    "white",
    "black",
  ];
  const outerKinds: CarromDiscKind[] = [
    "black",
    "white",
    "black",
    "white",
    "black",
    "white",
    "black",
    "white",
    "black",
    "white",
    "black",
    "white",
  ];
  const counts: Record<CarromDiscKind, number> = {
    white: 0,
    black: 0,
    queen: 0,
  };

  for (let index = 0; index < innerKinds.length; index += 1) {
    const kind = innerKinds[index]!;
    const angle = -Math.PI / 2 + (index * Math.PI) / 3;
    counts[kind] += 1;
    discs.push({
      id: `${kind[0]}${counts[kind]}`,
      kind,
      x: 0.5 + Math.cos(angle) * CARROM_BOARD.queenRingRadius,
      y: 0.5 + Math.sin(angle) * CARROM_BOARD.queenRingRadius,
      pocketed: false,
    });
  }

  for (let index = 0; index < outerKinds.length; index += 1) {
    const kind = outerKinds[index]!;
    const angle = -Math.PI / 2 + Math.PI / 12 + (index * Math.PI) / 6;
    counts[kind] += 1;
    discs.push({
      id: `${kind[0]}${counts[kind]}`,
      kind,
      x: 0.5 + Math.cos(angle) * CARROM_BOARD.outerRingRadius,
      y: 0.5 + Math.sin(angle) * CARROM_BOARD.outerRingRadius,
      pocketed: false,
    });
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
  const edge = radius + 0.035;
  if (x < edge || x > 1 - edge || y < edge || y > 1 - edge) {
    return false;
  }
  for (const pocket of CARROM_BOARD.pocketCenters) {
    if (Math.hypot(x - pocket.x, y - pocket.y) < CARROM_BOARD.pocketRadius + radius) {
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

  const ringRadii = [0.045, 0.08, 0.115, 0.15, 0.185, 0.22, 0.26, 0.3];
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
