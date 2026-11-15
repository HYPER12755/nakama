import { Coordinates } from "@moongames/game-ui";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

export interface DisplaySquare {
  square: string;
  file: string;
  rank: string;
  /** The file of the square, drawn on the edge of the board. */
  showFile: boolean;
  /** The rank of the square, drawn on the edge of the board. */
  showRank: boolean;
  /** The file of the square, drawn inside the square. */
  showInnerFile: boolean;
  /** The rank of the square, drawn inside the square. */
  showInnerRank: boolean;
}

/**
 * The squares of the board, in the order they are drawn, with the
 * coordinates that are shown on them.
 *
 * The coordinates can be drawn on the edge of the board, inside every
 * square, both, or not at all.
 */
export function getDisplaySquares(
  flipped: boolean,
  coordinates: Coordinates = Coordinates.Outside,
): DisplaySquare[] {
  const files = flipped ? [...FILES].reverse() : [...FILES];
  const ranks = flipped ? [...RANKS].reverse() : [...RANKS];
  const squares: DisplaySquare[] = [];

  const outside =
    coordinates === Coordinates.Outside || coordinates === Coordinates.All;
  const inside =
    coordinates === Coordinates.Inside || coordinates === Coordinates.All;

  for (const rank of ranks) {
    for (const file of files) {
      squares.push({
        square: `${file}${rank}`,
        file,
        rank,
        showFile: outside && rank === ranks[ranks.length - 1],
        showRank: outside && file === files[0],
        showInnerFile: inside,
        showInnerRank: inside,
      });
    }
  }

  return squares;
}

export function isLightSquare(square: string): boolean {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);
  return (file + rank) % 2 === 0;
}
