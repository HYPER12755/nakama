/**
 * The table is turned so the player it belongs to sits at the bottom of the
 * screen. These helpers convert between the canvas and the board, with the
 * turn of the table taken into account.
 */

/** The canvas is drawn at a fixed size and scaled by the browser. */
export const LOGICAL_SIZE = 1000;

/** The frame around the playing surface. */
export const PLAY_INSET = 62;

/** The side of the playing surface. */
export const PLAY_SIZE = LOGICAL_SIZE - PLAY_INSET * 2;

/**
 * Turn a point on the canvas into a point on the board. The board is turned
 * by `rotation`, so the point is turned back before it is used.
 */
export function screenToBoard(
  screenX: number,
  screenY: number,
  rotation: number,
): { x: number; y: number } {
  const centre = LOGICAL_SIZE / 2;
  const dx = screenX - centre;
  const dy = screenY - centre;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: (centre + dx * cos + dy * sin - PLAY_INSET) / PLAY_SIZE,
    y: (centre - dx * sin + dy * cos - PLAY_INSET) / PLAY_SIZE,
  };
}

/** Turn a point on the board into a point on the canvas. */
export function boardToScreen(
  boardX: number,
  boardY: number,
  rotation: number,
): { x: number; y: number } {
  const centre = LOGICAL_SIZE / 2;
  const x = PLAY_INSET + boardX * PLAY_SIZE;
  const y = PLAY_INSET + boardY * PLAY_SIZE;
  const dx = x - centre;
  const dy = y - centre;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return {
    x: centre + dx * cos - dy * sin,
    y: centre + dx * sin + dy * cos,
  };
}
