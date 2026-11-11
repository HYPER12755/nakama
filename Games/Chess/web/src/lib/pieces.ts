import type {
  BoardPiece,
  PieceSymbol,
} from "@moongames/chess-core";

const GLYPHS: Record<PieceSymbol, string> = {
  k: "♚",
  q: "♛",
  r: "♜",
  b: "♝",
  n: "♞",
  p: "♟",
};

const NAMES: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export function glyphFor(type: PieceSymbol): string {
  return GLYPHS[type];
}

export function pieceGlyph(piece: BoardPiece): string {
  return GLYPHS[piece.type];
}

export function pieceName(piece: BoardPiece): string {
  return `${piece.color === "w" ? "White" : "Black"} ${NAMES[piece.type]}`;
}
