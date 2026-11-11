export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

export interface DisplaySquare {
  square: string;
  file: string;
  rank: string;
  showFile: boolean;
  showRank: boolean;
}

export function getDisplaySquares(flipped: boolean): DisplaySquare[] {
  const files = flipped ? [...FILES].reverse() : [...FILES];
  const ranks = flipped ? [...RANKS].reverse() : [...RANKS];
  const squares: DisplaySquare[] = [];

  for (const rank of ranks) {
    for (const file of files) {
      squares.push({
        square: `${file}${rank}`,
        file,
        rank,
        showFile: rank === ranks[ranks.length - 1],
        showRank: file === files[0],
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
