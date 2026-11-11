import type {
  BoardPiece,
  MoveRecord,
  Square,
} from "@moongames/chess-core";
import { getDisplaySquares, isLightSquare } from "../lib/coordinates";
import { pieceName } from "../lib/pieces";
import { Piece } from "./Piece";

export interface ChessBoardProps {
  board: BoardPiece[];
  selected: Square | null;
  legalTargets: Square[];
  lastMove: MoveRecord | null;
  checkSquare: Square | null;
  flipped: boolean;
  onSquareClick: (square: Square) => void;
}

export function ChessBoard({
  board,
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  flipped,
  onSquareClick,
}: ChessBoardProps) {
  const pieces = new Map(board.map((piece) => [piece.square, piece]));
  const targets = new Set(legalTargets);

  return (
    <div className="board" role="grid" aria-label="Chess board">
      {getDisplaySquares(flipped).map(({ square, showFile, showRank }) => {
        const piece = pieces.get(square);
        const isSelected = selected === square;
        const isTarget = targets.has(square);
        const isLastMove =
          lastMove?.from === square || lastMove?.to === square;
        const isCheck = checkSquare === square;
        const classes = [
          "square",
          isLightSquare(square) ? "square--light" : "square--dark",
        ];

        if (isSelected) {
          classes.push("square--selected");
        }
        if (isLastMove) {
          classes.push("square--last");
        }
        if (isCheck) {
          classes.push("square--check");
        }

        const label = `${square}, ${
          piece === undefined ? "empty" : pieceName(piece)
        }${isTarget ? ", legal move" : ""}`;

        return (
          <button
            key={square}
            type="button"
            role="gridcell"
            className={classes.join(" ")}
            onClick={() => onSquareClick(square)}
            aria-label={label}
            aria-pressed={isSelected}
          >
            {showFile && (
              <span className="coord coord--file" aria-hidden="true">
                {square[0]}
              </span>
            )}
            {showRank && (
              <span className="coord coord--rank" aria-hidden="true">
                {square[1]}
              </span>
            )}
            {piece !== undefined && <Piece piece={piece} />}
            {isTarget && (
              <span
                className={`move-hint ${
                  piece === undefined ? "" : "move-hint--capture"
                }`}
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
