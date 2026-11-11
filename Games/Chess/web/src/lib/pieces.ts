import type {
  BoardPiece,
  PieceSymbol,
} from "@moongames/chess-core";

const NAMES: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

export function pieceName(piece: BoardPiece): string {
  return `${piece.color === "w" ? "White" : "Black"} ${NAMES[piece.type]}`;
}
