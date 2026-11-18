import { LudoColor, START_INDEX, TRACK_LENGTH } from "@moongames/ludo-core";

/** A square on the hand-drawn 15x15 board. Coordinates are [column, row]. */
export type GridPoint = readonly [number, number];

/**
 * The 52 outside squares, clockwise from red's entry. This layout is the
 * classic cross: the four starts sit exactly 13 squares apart and the safe
 * squares are 0, 8, 13, 21, 26, 34, 39 and 47, matching the rules core.
 */
export const TRACK: readonly GridPoint[] = [
  [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  [0, 7], [0, 6],
];

/** The five home-lane squares plus the centre, for each colour. */
export const HOME_COLUMN: Readonly<Record<LudoColor, readonly GridPoint[]>> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [7, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 7]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [7, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 7]],
};

/** Top-left cell of each private yard. */
export const YARD_ORIGIN: Readonly<Record<LudoColor, GridPoint>> = {
  red: [1, 1],
  green: [10, 1],
  blue: [1, 10],
  yellow: [10, 10],
};

/** The four token spots inside a yard, in grid units. */
/** Measured from the supplied board art: printed centres are at 2.125 and
 * 3.844 grid units, so the spot origin is half a cell behind each. */
export const YARD_SPOTS: readonly GridPoint[] = [
  [1.625, 1.625], [3.344, 1.625], [1.625, 3.344], [3.344, 3.344],
];

export const GRID_SIZE = 15;

export function trackPoint(index: number): GridPoint {
  const wrapped = ((index % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  return TRACK[wrapped]!;
}

export function yardSpot(color: LudoColor, token: number): GridPoint {
  const origin = YARD_ORIGIN[color];
  const spot = YARD_SPOTS[token]!;
  return [origin[0] + (spot[0] - 1), origin[1] + (spot[1] - 1)];
}

/** Where a token belongs on the board for a given progress value. */
export function tokenPoint(color: LudoColor, progress: number, token: number): GridPoint {
  if (progress < 0) return yardSpot(color, token);
  if (progress <= 50) return trackPoint(START_INDEX[color] + progress);
  return HOME_COLUMN[color][Math.min(5, progress - 51)]!;
}
