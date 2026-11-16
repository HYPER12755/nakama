import { memo, useRef, useState } from "react";
import type {
  BoardPiece,
  MoveRecord,
  Square,
} from "@moongames/chess-core";
import { Coordinates, MoveEvent } from "@moongames/game-ui";
import { getDisplaySquares, isLightSquare } from "../lib/coordinates";
import { boardThemeStyle, type BoardTheme } from "../lib/boardThemes";
import { pieceName } from "../lib/pieces";
import { EngineArrow } from "./EngineArrow";
import { Piece, type PieceMotion } from "./Piece";

export interface ChessBoardProps {
  board: BoardPiece[];
  selected: Square | null;
  legalTargets: Square[];
  /** The move that was played last, so it can be marked. */
  lastMove: { from: Square; to: Square } | null;
  checkSquare: Square | null;
  flipped: boolean;
  onSquareClick: (square: Square) => void;
  /** Move a piece from one square to another, as a drag does. */
  onMove?: (from: Square, to: Square) => void;
  /** How a piece is moved across the board. */
  moveEvent?: MoveEvent;
  /** Where the coordinates are drawn. */
  coordinates?: Coordinates;
  /** The colouring of the board. */
  theme?: BoardTheme;
  /** The set of pieces on the board. */
  pieceSet?: string;
  /** How long a piece takes to travel, in milliseconds. */
  animationMs?: number;
  /** Whether the squares a piece may go to are marked. */
  showLegalMoves?: boolean;
  /** Whether the squares of the last move are marked. */
  highlightLastMove?: boolean;
  /** The move that is ready for the turn after this one. */
  premove?: { from: Square; to: Square } | null;
  /** The move the engine likes, shown as an arrow. */
  arrow?: { from: Square; to: Square } | null;
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
  onMove,
  moveEvent = MoveEvent.ClickOrDrag,
  coordinates = Coordinates.Outside,
  theme,
  pieceSet = "moongames",
  animationMs = 190,
  showLegalMoves = true,
  highlightLastMove = true,
  premove = null,
  arrow = null,
}: ChessBoardProps) {
  const pieces = new Map(board.map((piece) => [piece.square, piece]));
  const targets = new Set(legalTargets);
  const motions = new Map<Square, PieceMotion>();

  // The drag in progress, if there is one.
  const dragRef = useRef<{
    square: Square | null;
    x: number;
    y: number;
    moved: boolean;
  }>({ square: null, x: 0, y: 0, moved: false });
  // A drag ends with a click, and the click must not move the piece again.
  const skipClickRef = useRef(false);
  const [dragging, setDragging] = useState<Square | null>(null);

  const draggingAllowed = moveEvent !== MoveEvent.Click;

  const handlePointerDown = (
    square: Square,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (!draggingAllowed) {
      return;
    }
    dragRef.current = {
      square,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };

    // The piece is picked up, so the squares it may go to are shown. A
    // square the piece may go to is left alone, so that the piece is moved
    // by the drop and not by the press.
    const isTarget = targets.has(square);
    if (isTarget || selected === square) {
      return;
    }
    onSquareClick(square);
    // The click that follows the press must not undo the picking up.
    skipClickRef.current = true;
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (drag.square === null || drag.moved) {
      return;
    }
    const moved =
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 6;
    if (!moved) {
      return;
    }
    drag.moved = true;
    setDragging(drag.square);
  };

  const handlePointerUp = (square: Square) => {
    const drag = dragRef.current;
    dragRef.current = { square: null, x: 0, y: 0, moved: false };
    setDragging(null);

    if (drag.square === null || !drag.moved || onMove === undefined) {
      return;
    }
    // The click that follows the drag must not move the piece a second time.
    skipClickRef.current = true;
    onMove(drag.square, square);
  };

  const handleClick = (square: Square) => {
    if (skipClickRef.current) {
      skipClickRef.current = false;
      return;
    }
    if (moveEvent === MoveEvent.Drag) {
      // A piece is moved by dragging it, never by clicking.
      return;
    }
    onSquareClick(square);
  };

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
      }
      if (fromFile === "e" && toFile === "c") {
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
    <div
      className={`board${draggingAllowed ? " board--drag" : ""}${
        dragging !== null ? " board--dragging" : ""
      }`}
      role="grid"
      aria-label="Chess board"
      style={theme === undefined ? undefined : boardThemeStyle(theme)}
    >
      {getDisplaySquares(flipped, coordinates).map(
        ({ square, showFile, showRank, showInnerFile, showInnerRank }) => {
        const piece = pieces.get(square);
        const motion = motions.get(square) ?? null;
        const isSelected = selected === square;
        const isTarget = targets.has(square);
        const isLastMove =
          highlightLastMove &&
          (lastMove?.from === square || lastMove?.to === square);
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
        if (dragging === square) {
          classes.push("square--dragging");
        }
        if (premove !== null && premove.from === square) {
          classes.push("square--premove");
        }
        if (premove !== null && premove.to === square) {
          classes.push("square--premove-target");
        }

        const label = `${square}, ${
          piece === undefined ? "empty" : pieceName(piece)
        }${isTarget && showLegalMoves ? ", legal move" : ""}`;

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
            onClick={() => handleClick(square)}
            onPointerDown={(event) => handlePointerDown(square, event)}
            onPointerMove={handlePointerMove}
            onPointerUp={() => handlePointerUp(square)}
            onPointerCancel={() => {
              dragRef.current = { square: null, x: 0, y: 0, moved: false };
              setDragging(null);
            }}
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
            {showInnerFile && (
              <span className="coord coord--inner coord--inner-file" aria-hidden="true">
                {square[0]}
              </span>
            )}
            {showInnerRank && (
              <span className="coord coord--inner coord--inner-rank" aria-hidden="true">
                {square[1]}
              </span>
            )}
            {piece !== undefined && (
              <Piece
                piece={piece}
                justMoved={lastMove?.to === square}
                motion={motion}
                pieceSet={pieceSet}
                animationMs={animationMs}
              />
            )}
            {isTarget && showLegalMoves && (
              <span
                className={`move-hint ${
                  piece === undefined ? "" : "move-hint--capture"
                }`}
                aria-hidden="true"
              />
            )}
          </button>
        );
      },
      )}
      {arrow !== null && (
        <EngineArrow
          from={arrow.from}
          to={arrow.to}
          flipped={flipped}
        />
      )}
    </div>
  );
});
