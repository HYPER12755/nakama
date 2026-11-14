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
  /** The hole in the frame: 4.45 cm across. */
  pocketRadius: 0.0301,
  /**
   * A piece drops when its centre passes the edge of the hole. The capture
   * radius is the hole minus half a piece, so a piece has to be over the
   * hole and not merely resting on its rim.
   */
  captureRadius: 0.0193,
  pocketCenters: [
    { x: 0.036, y: 0.036 },
    { x: 0.964, y: 0.036 },
    { x: 0.036, y: 0.964 },
    { x: 0.964, y: 0.964 },
  ] as const,
  /** Half of the 3.8 cm distance between the two baseline lines. */
  baselineHalfWidth: 0.0257,
  baselineMin: 0.25,
  baselineMax: 0.75,
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
  piecesPerPlayer: 9,
} as const;

/**
 * Seating order around the table, clockwise: the bottom player, then the
 * left, top, and right players. The turn always moves along this order.
 */
export const CARROM_SEATS: readonly CarromPlayer[] = [
  "white",
  "yellow",
  "black",
  "green",
];

export interface CarromBaseline {
  /** Axis the striker slides along. */
  slideAxis: "x" | "y";
  /** Axis the baseline lines run along. */
  lineAxis: "x" | "y";
  /** Position of the baseline strip on that axis. */
  linePosition: number;
  /** Direction the striker travels when it shoots straight at the centre. */
  inward: 1 | -1;
  /** Angle from the board centre towards this player's side. */
  axisAngle: number;
}

export const CARROM_BASELINES: Record<CarromPlayer, CarromBaseline> = {
  white: {
    slideAxis: "x",
    lineAxis: "y",
    linePosition: 0.75,
    inward: -1,
    axisAngle: Math.PI / 2,
  },
  yellow: {
    slideAxis: "y",
    lineAxis: "x",
    linePosition: 0.25,
    inward: 1,
    axisAngle: Math.PI,
  },
  black: {
    slideAxis: "x",
    lineAxis: "y",
    linePosition: 0.25,
    inward: 1,
    axisAngle: (Math.PI * 3) / 2,
  },
  green: {
    slideAxis: "y",
    lineAxis: "x",
    linePosition: 0.75,
    inward: -1,
    axisAngle: 0,
  },
};

export const PLAYER_LABEL: Record<CarromPlayer, string> = {
  white: "Ivory",
  black: "Onyx",
  green: "Jade",
  yellow: "Amber",
};

/**
 * The tables a game can be played at, in seating order. Every title reads the
 * list from here instead of repeating it.
 */
export const TABLE_PLAYERS: readonly (readonly CarromPlayer[])[] = [
  ["white", "black"],
  ["white", "black", "green"],
  ["white", "black", "green", "yellow"],
];

export function tablePlayers(count: number): CarromPlayer[] {
  const clamped = Math.max(2, Math.min(TABLE_PLAYERS.length, Math.floor(count)));
  return [...(TABLE_PLAYERS[clamped - 1] ?? TABLE_PLAYERS[0]!)];
}

/**
 * The longest drag that still means full power. The aim uses it, so the
 * gesture feels the same everywhere.
 */
export const AIM_MAX_DISTANCE = 0.38;

/** The colour used for each player's pieces in the interface. */
export const PLAYER_COLOR: Record<CarromPlayer, string> = {
  white: "#f3ead4",
  black: "#22252a",
  green: "#2f7d55",
  yellow: "#c9932c",
};

export function baselineOf(player: CarromPlayer): CarromBaseline {
  return CARROM_BASELINES[player];
}

/** Seated players in turn order, clockwise around the table. */
export function playersInTurnOrder(
  players: readonly CarromPlayer[],
): CarromPlayer[] {
  return CARROM_SEATS.filter((player) => players.includes(player));
}

export function nextPlayerInTurnOrder(
  players: readonly CarromPlayer[],
  current: CarromPlayer,
): CarromPlayer {
  const order = playersInTurnOrder(players);
  const index = order.indexOf(current);
  if (index < 0 || order.length === 0) {
    return current;
  }
  return order[(index + 1) % order.length]!;
}

export function clampStrikerPosition(value: number): number {
  return Math.min(CARROM_BOARD.baselineMax, Math.max(CARROM_BOARD.baselineMin, value));
}

/** The board position of a striker placed at `position` on a player's side. */
export function strikerPoint(
  player: CarromPlayer,
  position: number,
): CarromPoint {
  const baseline = CARROM_BASELINES[player];
  return baseline.slideAxis === "x"
    ? { x: position, y: baseline.linePosition }
    : { x: baseline.linePosition, y: position };
}

export function strikerFits(state: CarromState, position: number): boolean {
  const point = strikerPoint(state.turn, position);
  const minimum = CARROM_BOARD.discRadius + CARROM_BOARD.strikerRadius + 0.002;
  return state.discs.every(
    (disc) =>
      disc.pocketed ||
      Math.hypot(disc.x - point.x, disc.y - point.y) >= minimum,
  );
}

/**
 * Find the nearest legal striker position. This keeps the controls usable
 * when a returned carrom man happens to land near the baseline.
 */
export function nearestValidStrikerPosition(
  state: CarromState,
  requested: number,
): number {
  const target = clampStrikerPosition(requested);
  let best = target;
  let bestDistance = Number.POSITIVE_INFINITY;
  const step = 0.002;
  for (
    let position = CARROM_BOARD.baselineMin;
    position <= CARROM_BOARD.baselineMax + 0.0001;
    position += step
  ) {
    if (!strikerFits(state, position)) {
      continue;
    }
    const distance = Math.abs(position - target);
    if (distance < bestDistance) {
      best = position;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Radii of the opening medallion. The inner ring always fits three men per
 * player and the outer ring six, and both rings keep the men touching.
 */
export function medallionRadii(playerCount: number): {
  inner: number;
  outer: number;
} {
  const men = CARROM_BOARD.discRadius;
  const inner = Math.max(
    0.0432,
    (3 * playerCount * men) / Math.PI,
  );
  const outer = Math.max(
    inner + 2 * men,
    (6 * playerCount * men) / Math.PI,
  );
  return { inner, outer };
}

/**
 * The ICF opening layout: the queen on the centre spot, three men per player
 * touching the centre circle, and six men per player touching that ring. The
 * first player's axis carries one of their own men in each ring.
 */
export function createInitialState(
  players: readonly CarromPlayer[] = ["white", "black"],
): CarromState {
  const seated = playersInTurnOrder(players);
  const count = Math.max(2, seated.length);
  const discs: CarromDisc[] = [
    { id: "queen", kind: "queen", x: 0.5, y: 0.5, pocketed: false },
  ];

  const counts: Record<CarromDiscKind, number> = {
    white: 0,
    black: 0,
    green: 0,
    yellow: 0,
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

  const radii = medallionRadii(count);
  const first = seated[0] ?? "white";
  const start = CARROM_BASELINES[first].axisAngle;

  for (let index = 0; index < 3 * count; index += 1) {
    const kind = seated[index % count]!;
    const angle = start + (index * Math.PI * 2) / (3 * count);
    push(
      kind,
      0.5 + Math.cos(angle) * radii.inner,
      0.5 + Math.sin(angle) * radii.inner,
    );
  }

  for (let index = 0; index < 6 * count; index += 1) {
    const kind = seated[index % count]!;
    const angle = start + (index * Math.PI * 2) / (6 * count);
    push(
      kind,
      0.5 + Math.cos(angle) * radii.outer,
      0.5 + Math.sin(angle) * radii.outer,
    );
  }

  return {
    discs,
    striker: {
      x: strikerPoint(first, 0.5).x,
      y: strikerPoint(first, 0.5).y,
      pocketed: false,
    },
    turn: first,
    players: seated,
    queen: { status: "board" },
    scores: { white: 0, black: 0, green: 0, yellow: 0 },
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
