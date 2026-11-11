import type { BoardPiece } from "@moongames/chess-core";
import { pieceGlyph, pieceName } from "../lib/pieces";

export interface PieceProps {
  piece: BoardPiece;
}

export function Piece({ piece }: PieceProps) {
  return (
    <span
      className={`piece piece--${piece.color}`}
      aria-hidden="true"
      data-piece={pieceName(piece)}
    >
      {pieceGlyph(piece)}
    </span>
  );
}
