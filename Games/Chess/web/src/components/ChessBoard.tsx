import { memo } from "react";
import type {
  BoardPiece,
  MoveRecord,
  Square,
} from "@moongames/chess-core";
import { getDisplaySquares, isLightSquare } from "../lib/coordinates";
import { pieceName } from "../lib/pieces";
import { Piece, type PieceMotion } from "./Piece";

export interface ChessBoardProps {
  board: BoardPiece[];
  selected: Square | null;
  legalTargets: Square[];
  lastMove: MoveRecord | null;
  checkSquare: Square | null;
  flipped: boolean;
  onSquareClick: (square: Square) => void;
}

function displayPosition(square: Square, flipped: boolean) {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  return {
    x: flipped ? 7 - file : file,
    y: flipped ? rank : 7 - rank,
  };
}

function motionBetween(
  from: Square,
  to: Square,
  flipped: boolean,
): PieceMotion {
  const source = displayPosition(from, flipped);
  const target = displayPosition(to, flipped);
  return {
    x: source.x - target.x,
    y: source.y - target.y,
    key: `${from}-${to}`,
  };
}

export const ChessBoard = memo(function ChessBoard({
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
  const motions = new Map<Square, PieceMotion>();

  if (lastMove !== null && lastMove.from !== lastMove.to) {
    motions.set(
      lastMove.to,
      motionBetween(lastMove.from, lastMove.to, flipped),
    );

    // Castling is one history entry. Animate the rook alongside the king.
    const moved = pieces.get(lastMove.to);
    if (moved?.type === "k") {
      const fromFile = lastMove.from[0];
      const toFile = lastMove.to[0];
      const rank = lastMove.to[1];
      let rookFrom: Square | null = null;
      let rookTo: Square | null = null;
      if (fromFile === "e" && toFile === "g") {
        rookFrom = `h${rank}` as Square;
        rookTo = `f${rank}` as Square;
      } else if (fromFile === "e" && toFile === "c") {
        rookFrom = `a${rank}` as Square;
        rookTo = `d${rank}` as Square;
      }
      if (
        rookFrom !== null &&
        rookTo !== null &&
        pieces.get(rookTo)?.type === "r"
      ) {
        motions.set(
          rookTo,
          motionBetween(rookFrom, rookTo, flipped),
        );
      }
    }
  }

  return (
    <div className="board" role="grid" aria-label="Chess board">
      {getDisplaySquares(flipped).map(({ square, showFile, showRank }) => {
        const piece = pieces.get(square);
        const motion = motions.get(square) ?? null;
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
            style={
              motion === null
                ? undefined
                : { overflow: "visible", zIndex: 8 }
            }
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
            {piece !== undefined && (
              <Piece
                piece={piece}
                justMoved={lastMove?.to === square}
                motion={motion}
              />
            )}
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
});
