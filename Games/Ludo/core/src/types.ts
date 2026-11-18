/**
 * JSON-safe types for the Ludo rules engine.
 *
 * The same shape is used by the web client, the Lua server and the replay
 * format. Nothing here holds a function, a class instance or a DOM object.
 */

export type LudoColor = "red" | "green" | "yellow" | "blue";

export const LUDO_COLORS: readonly LudoColor[] = ["red", "green", "yellow", "blue"];

export type TokenLocation = "home" | "track" | "column" | "finished";

/** A single token. `progress` is -1 in home, 0..50 on the track, 51..56 in
 * the home column, with 56 being the centre square (finished). */
export interface LudoToken {
  id: number;
  location: TokenLocation;
  progress: number;
}

export interface LudoPlayer {
  /** Seat index, 0..3. */
  seat: number;
  color: LudoColor;
  tokens: LudoToken[];
  /** Number of tokens that have reached the centre. */
  finished: number;
  /** True when an AI drives this seat. Used by local play and replays. */
  ai: boolean;
}

export type LudoPhase = "roll" | "move" | "over";

export type LudoEventType =
  | "roll"
  | "leave-home"
  | "move"
  | "capture"
  | "finish"
  | "extra"
  | "six-foul"
  | "no-move"
  | "win";

export interface LudoEvent {
  type: LudoEventType;
  player: number;
  token?: number;
  from?: number;
  to?: number;
  value?: number;
  /** Seed produced by this roll, so a replay can continue the same game. */
  seed?: number;
  captured?: { player: number; token: number }[];
  /** Monotonic action counter, so a replay can replay one event at a time. */
  action: number;
}

export interface LudoRules {
  /** Star squares cannot be captured on. */
  safeSquares: boolean;
  /** Two or more own tokens on a square form a wall opponents may not enter. */
  blocks: boolean;
  /** Three consecutive sixes forfeit that turn. */
  threeSixesFoul: boolean;
  /** A capture earns another roll. */
  captureExtra: boolean;
  /** Rolling a six earns another roll. */
  sixExtra: boolean;
  /** A token must land exactly on the centre to finish. */
  exactFinish: boolean;
}

export const DEFAULT_RULES: LudoRules = {
  safeSquares: true,
  blocks: true,
  threeSixesFoul: true,
  captureExtra: true,
  sixExtra: true,
  exactFinish: true,
};

export interface LudoState {
  /** Four seats always exist; `playerCount` says how many are in the game. */
  players: LudoPlayer[];
  playerCount: number;
  current: number;
  phase: LudoPhase;
  dice: number | null;
  /** Seed for the next dice roll. Advances on every roll. */
  seed: number;
  /** Consecutive sixes rolled by the current player. */
  sixStreak: number;
  /** Set when the last move earned an extra roll. */
  extraTurn: boolean;
  winner: number | null;
  /** Seats in the order they finished. */
  ranking: number[];
  /** Number of rolls that have been resolved. */
  action: number;
  events: LudoEvent[];
  rules: LudoRules;
}

export interface LudoMove {
  player: number;
  token: number;
  from: number;
  to: number;
  leavesHome: boolean;
  finishes: boolean;
  captures: { player: number; token: number }[];
  /** True when the destination is a safe star square. */
  safe: boolean;
}

export interface MoveResult {
  move: LudoMove;
  extra: boolean;
  foul: boolean;
  won: boolean;
  nextPlayer: number;
}

export type LudoDifficulty = "easy" | "normal" | "hard";
