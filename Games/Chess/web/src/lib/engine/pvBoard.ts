import { ChessEngine, type BoardPiece, type Square } from "@moongames/chess-core";

/**
 * The position a line of the engine reaches.
 *
 * The engine writes its moves in its own way, and the moves are played out
 * here so the board can show where the line goes.
 */
export interface PvPosition {
  /** The pieces on the board at that point of the line. */
  board: BoardPiece[];
  /** The move that was played last, so it can be marked. */
  lastMove: { from: Square; to: Square } | null;
  /** The position, written down. */
  fen: string;
}

/**
 * The position after the first moves of a line.
 *
 * Nothing is given when the moves cannot be played, for a line that does
 * not make sense has no position to show.
 */
export function positionAfter(
  initialFen: string,
  moves: string[],
): PvPosition | null {
  if (moves.length === 0) {
    return null;
  }

  try {
    const engine = new ChessEngine(initialFen);
    let lastMove: { from: Square; to: Square } | null = null;
    for (const move of moves) {
      const from = move.slice(0, 2) as Square;
      const to = move.slice(2, 4) as Square;
      const promotion = move.length > 4 ? move[4] : undefined;
      engine.move({
        from,
        to,
        promotion: promotion as "q" | "r" | "b" | "n" | undefined,
      });
      lastMove = { from, to };
    }

    return {
      board: engine.getState().board,
      lastMove,
      fen: engine.fen,
    };
  } catch {
    return null;
  }
}
