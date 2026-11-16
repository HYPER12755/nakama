import { ChessBoard } from "./ChessBoard";
import type { BoardTheme } from "../lib/boardThemes";

export interface EnginePvBoardProps {
  /** The pieces of the position that is shown. */
  board: Parameters<typeof ChessBoard>[0]["board"];
  /** The move that was played last, so it can be marked. */
  lastMove: { from: string; to: string } | null;
  /** Whose side the board is about. */
  color: "w" | "b";
  /** The colouring of the board. */
  theme?: BoardTheme;
  /** The pieces of the board, as the player has chosen them. */
  pieceSet?: string;
}

/**
 * The little board that shows where the line of the engine goes.
 *
 * This is lichess's line board: when a move of the line is touched, the
 * position that follows it is shown beside the line, so the player can see
 * what the engine is thinking about.
 */
export function EnginePvBoard({
  board,
  lastMove,
  color,
  theme,
  pieceSet,
}: EnginePvBoardProps) {
  return (
    <div className="pv-board">
      <div className="pv-board__square">
        <ChessBoard
          board={board}
          selected={null}
          legalTargets={[]}
          lastMove={lastMove}
          checkSquare={null}
          flipped={color === "b"}
          theme={theme}
          pieceSet={pieceSet}
          onSquareClick={() => undefined}
        />
      </div>
    </div>
  );
}
