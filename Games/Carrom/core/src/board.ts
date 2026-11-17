import type {
  CarromDisc,
  CarromDiscKind,
  CarromPlayer,
  CarromPoint,
  CarromRuleSet,
  CarromState,
  CarromTeam,
  CarromTeamId,
  GameVariant,
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
   * A piece drops when its centre passes over the hole, so the capture radius
   * is the hole itself. The hole is drawn at this same size, so what a player
   * aims at is what the table does.
   */
  captureRadius: 0.0301,
  pocketCenters: [
    { x: 0.018, y: 0.018 },
    { x: 0.982, y: 0.018 },
    { x: 0.018, y: 0.982 },
    { x: 0.982, y: 0.982 },
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
  /**
   * The animation is sampled thirty times a second. The player never sees
   * the frames one by one, and every frame is a copy of every piece on the
   * table, so a finer rate only costs the phone time.
   */
  sampleSeconds: 1 / 30,
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
 * The two sides of a doubles table. Partners sit opposite: white faces black
 * and yellow faces green. With the clockwise seating order this makes the
 * turn cross the teams at every shot, the way a game of doubles is played.
 */
export const CARROM_TEAM_PLAYERS: Record<CarromTeamId, CarromPlayer[]> = {
  A: ["white", "black"],
  B: ["yellow", "green"],
};

export const CARROM_TEAM_LABEL: Record<CarromTeamId, string> = {
  A: "Ivory & Onyx",
  B: "Amber & Jade",
};

const PLAYER_TEAM: Record<CarromPlayer, CarromTeamId> = {
  white: "A",
  black: "A",
  yellow: "B",
  green: "B",
};

export function teamOf(player: CarromPlayer): CarromTeamId {
  return PLAYER_TEAM[player];
}

/** The player who shares a side of the table with `player`. */
export function teammateOf(player: CarromPlayer): CarromPlayer {
  const team = CARROM_TEAM_PLAYERS[PLAYER_TEAM[player]];
  return team.find((entry) => entry !== player) ?? player;
}

/** The sides of a doubles table that has these seats. */
export function teamsFor(players: readonly CarromPlayer[]): CarromTeam[] {
  return (["A", "B"] as CarromTeamId[])
    .map((id) => ({
      id,
      label: CARROM_TEAM_LABEL[id],
      players: CARROM_TEAM_PLAYERS[id].filter((seat) => players.includes(seat)),
    }))
    .filter((team) => team.players.length > 0);
}

/**
 * The tables a game can be played at, from the smallest to the largest.
 */
export const TABLE_PLAYERS: readonly (readonly CarromPlayer[])[] = [
  ["white", "black"],
  ["white", "black", "green"],
  ["white", "black", "green", "yellow"],
];

/** The seat counts the tables above offer. */
export const TABLE_SIZES: readonly number[] = TABLE_PLAYERS.map(
  (table) => table.length,
);

/**
 * The seats of a table. The count is the number of players at the table, so
 * two players get two seats and four players get four. A count that no table
 * offers takes the nearest table that fits.
 */
export function tablePlayers(count: number): CarromPlayer[] {
  const wanted = Math.floor(count);
  const exact = TABLE_SIZES.indexOf(wanted);
  if (exact >= 0) {
    return [...TABLE_PLAYERS[exact]!];
  }
  // The nearest table that fits, and the largest one when nothing fits.
  const size =
    TABLE_SIZES.find((entry) => entry >= wanted) ??
    TABLE_SIZES[TABLE_SIZES.length - 1]!;
  const index = TABLE_SIZES.indexOf(size);
  return [...(TABLE_PLAYERS[index] ?? TABLE_PLAYERS[0]!)];
}

/**
 * The longest drag that still means full power. The aim uses it, so the
 * gesture feels the same everywhere.
 */
export const AIM_MAX_DISTANCE = 0.38;

/**
 * The game types. Every title picks one of these instead of writing its own
 * rules, so "classic" means the same thing everywhere.
 */
export const CARROM_VARIANTS: Record<GameVariant, CarromRuleSet> = {
  classic: {
    id: "classic",
    label: "Classic",
    fouls: true,
    coverQueen: true,
    queenPoints: 3,
    manPoints: 1,
  },
  freestyle: {
    id: "freestyle",
    label: "Freestyle",
    fouls: true,
    coverQueen: false,
    queenPoints: 3,
    manPoints: 1,
  },
  practice: {
    id: "practice",
    label: "Practice",
    fouls: false,
    coverQueen: false,
    queenPoints: 0,
    manPoints: 0,
  },
};

export function variantRules(variant: GameVariant): CarromRuleSet {
  return CARROM_VARIANTS[variant] ?? CARROM_VARIANTS.classic;
}

/** The edge of the table a player sits at. */
export type CarromSide = "bottom" | "top" | "left" | "right";

/** The edge a player's baseline is on. */
export function sideOf(player: CarromPlayer): CarromSide {
  switch (player) {
    case "white":
      return "bottom";
    case "yellow":
      return "left";
    case "black":
      return "top";
    case "green":
      return "right";
  }
}

/**
 * The rotation that turns the table so a player sits at the bottom of the
 * screen, the way they sit at a real table. The board is a square, so the
 * rotation is always a quarter turn.
 */
export function viewRotation(player: CarromPlayer): number {
  switch (player) {
    case "white":
      return 0;
    case "black":
      return Math.PI;
    case "yellow":
      return -Math.PI / 2;
    case "green":
      return Math.PI / 2;
  }
}

const SIDE_VECTOR: Record<CarromSide, { x: number; y: number }> = {
  bottom: { x: 0, y: 1 },
  top: { x: 0, y: -1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

/**
 * The edge a player is seen at from another player's side of the table. A
 * player at the top of the table sees the player on the left of the table on
 * their own right.
 */
export function sideForViewer(
  player: CarromPlayer,
  viewer: CarromPlayer,
): CarromSide {
  const theta = viewRotation(viewer);
  const vector = SIDE_VECTOR[sideOf(player)];
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const x = vector.x * cos - vector.y * sin;
  const y = vector.x * sin + vector.y * cos;
  if (Math.abs(x) > Math.abs(y)) {
    return x > 0 ? "right" : "left";
  }
  return y > 0 ? "bottom" : "top";
}

/**
 * The strikers a player can bring to the table. A striker is a real choice in
 * carrom: a heavier striker sends the men further, a lighter one is easier to
 * place. The power is a multiplier on the launch speed.
 */
export interface CarromStrikerSkin {
  id: string;
  label: string;
  /** Multiplier on the striker's launch speed. */
  power: number;
  /** Multiplier on the striker's mass, so a heavy one hits through a rattle. */
  mass: number;
  /** One line the picker shows under the name. */
  note: string;
}

export const CARROM_STRIKERS: readonly CarromStrikerSkin[] = [
  {
    id: "classic",
    label: "Classic",
    power: 1,
    mass: 1,
    note: "The standard 15 g striker.",
  },
  {
    id: "heavy",
    label: "Heavy",
    power: 1.28,
    mass: 1.5,
    note: "Much heavier: hits through a rattle and carries the men further.",
  },
  {
    id: "light",
    label: "Light",
    power: 0.72,
    mass: 0.7,
    note: "Much lighter: a soft touch for short, careful shots.",
  },
  {
    id: "swift",
    label: "Swift",
    power: 1.12,
    mass: 0.85,
    note: "Quick off the line but little weight behind it: skids past men.",
  },
];

export function strikerSkin(id: string | undefined): CarromStrikerSkin {
  return CARROM_STRIKERS.find((skin) => skin.id === id) ?? CARROM_STRIKERS[0]!;
}

/** The shot clocks a table can use. Zero means the table has no clock. */
export const CARROM_CLOCKS: readonly number[] = [0, 15, 30, 60];

/** How long a turn takes when the table has no clock. */
export const DEFAULT_TURN_SECONDS = 0;

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

export interface CarromStateOptions {
  /** The game type. Defaults to the ICF game. */
  variant?: GameVariant;
  /** The rules to use instead of the variant's. */
  rules?: CarromRuleSet;
  /** The striker skin each colour brought. */
  strikers?: Partial<Record<CarromPlayer, string>>;
  /** Seconds allowed for one shot. Zero means no clock. */
  turnSeconds?: number;
  /** Epoch milliseconds when the first shot clock runs out. */
  turnDeadline?: number | null;
  /** A solo table: the player keeps the turn for every shot. */
  solo?: boolean;
  /** A doubles table: partners share the pieces and the queen. */
  teams?: boolean;
}

/**
 * The ICF opening layout: the queen on the centre spot, three men per player
 * touching the centre circle, and six men per player touching that ring. The
 * first player's axis carries one of their own men in each ring.
 */
export function createInitialState(
  players: readonly CarromPlayer[] = ["white", "black"],
  options: CarromStateOptions = {},
): CarromState {
  const seated = playersInTurnOrder(players);
  const count = Math.max(2, seated.length);
  const rules = options.rules ?? variantRules(options.variant ?? "classic");
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
    rules,
    strikers: {
      white: options.strikers?.white ?? CARROM_STRIKERS[0]!.id,
      black: options.strikers?.black ?? CARROM_STRIKERS[0]!.id,
      green: options.strikers?.green ?? CARROM_STRIKERS[0]!.id,
      yellow: options.strikers?.yellow ?? CARROM_STRIKERS[0]!.id,
    },
    turnSeconds: options.turnSeconds ?? DEFAULT_TURN_SECONDS,
    turnDeadline: options.turnDeadline ?? null,
    solo: options.solo ?? false,
    teams: options.teams === true && seated.length >= 4,
    queen: { status: "board" },
    scores: { white: 0, black: 0, green: 0, yellow: 0 },
    status: "aiming",
    winner: null,
    winnerTeam: null,
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
