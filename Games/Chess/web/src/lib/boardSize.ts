/**
 * The size of the board.
 *
 * A player can drag the corner of the board to make it bigger or smaller,
 * the way a board is made bigger or smaller on a table. The size is kept on
 * the device, so the board comes back the way it was left.
 */

/** The smallest a board may be, in pixels. */
export const MIN_BOARD_SIZE = 260;

/** The key the size is kept under. */
function boardSizeKey(gameId: string): string {
  return `moongames.${gameId}.boardSize`;
}

/** The size of the board, or nothing when it fills the space it has. */
export function readBoardSize(gameId: string): number | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(boardSizeKey(gameId));
    if (stored === null) {
      return null;
    }
    const size = Number(stored);
    if (!Number.isFinite(size) || size < MIN_BOARD_SIZE) {
      return null;
    }
    return Math.round(size);
  } catch {
    return null;
  }
}

/** Keep the size of the board, so it comes back the way it was left. */
export function writeBoardSize(gameId: string, size: number | null): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    if (size === null) {
      window.localStorage.removeItem(boardSizeKey(gameId));
      return;
    }
    window.localStorage.setItem(boardSizeKey(gameId), String(Math.round(size)));
  } catch {
    // The size is lost, but the board is still a board.
  }
}

/**
 * The size the board may have, between the smallest it may be and the
 * space it has.
 */
export function clampBoardSize(size: number, available: number): number {
  const upper = Math.max(MIN_BOARD_SIZE, Math.floor(available));
  return Math.min(upper, Math.max(MIN_BOARD_SIZE, Math.round(size)));
}
