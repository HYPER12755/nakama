import type { LudoColor, LudoState, LudoToken } from "./types";

/** The outside ring has 13 squares per arm: 4 arms x 13 = 52. */
export const TRACK_LENGTH = 52;

/** The last six steps run up the player's own home column; 56 is the centre. */
export const HOME_COLUMN_START = 51;
export const FINISH_PROGRESS = 56;
export const TOKENS_PER_PLAYER = 4;
export const DICE_SIDES = 6;

/** First track square for each colour, 13 apart around the ring. */
export const START_INDEX: Readonly<Record<LudoColor, number>> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

/**
 * Star squares. Every player's start square is safe, as is the square eight
 * steps further on, which is where the next arm's stars begin.
 */
export const SAFE_SQUARES: readonly number[] = [
  0, 8, 13, 21, 26, 34, 39, 47,
];

/** Human-readable labels kept generic so any seat can be a person or AI. */
export const PLAYER_LABEL = ["PLAYER 1", "PLAYER 2", "PLAYER 3", "PLAYER 4"] as const;

export const PLAYER_COLOR_HEX: Readonly<Record<LudoColor, string>> = {
  red: "#ef5b5b",
  green: "#48c98a",
  yellow: "#f4c445",
  blue: "#5b9cff",
};

/** The square a token occupies on the outside ring. */
export function trackIndex(color: LudoColor, progress: number): number {
  return (START_INDEX[color] + progress) % TRACK_LENGTH;
}

export function isSafeSquare(index: number): boolean {
  return SAFE_SQUARES.includes(((index % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH);
}

/** True when a token is exposed on the outside ring. */
export function onTrack(token: LudoToken): boolean {
  return token.location === "track" && token.progress >= 0 && token.progress <= 50;
}

export function inHomeColumn(token: LudoToken): boolean {
  return token.location === "column" && token.progress >= HOME_COLUMN_START;
}

/** Tokens of `color` standing on the given outside square. */
export function tokensOnSquare(
  state: LudoState,
  color: LudoColor,
  index: number,
): LudoToken[] {
  const player = state.players.find((entry) => entry.color === color);
  if (player === undefined) return [];
  return player.tokens.filter((token) => onTrack(token) && trackIndex(color, token.progress) === index);
}

/** True when two or more own tokens make an impassable wall. */
export function isBlockedBy(state: LudoState, color: LudoColor, index: number): boolean {
  return state.rules.blocks && tokensOnSquare(state, color, index).length >= 2;
}

export function activePlayers(state: LudoState): number[] {
  return state.players
    .filter((player) => player.seat < state.playerCount && player.finished < state.tokensPerPlayer)
    .map((player) => player.seat);
}

export function playerAt(state: LudoState, seat: number): LudoState["players"][number] {
  const player = state.players[seat];
  if (player === undefined) throw new Error(`No Ludo seat ${seat}`);
  return player;
}
