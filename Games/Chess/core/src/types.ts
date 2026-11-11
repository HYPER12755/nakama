export type Color = "w" | "b";
export type PieceSymbol = "p" | "n" | "b" | "r" | "q" | "k";
export type PromotionPiece = "q" | "r" | "b" | "n";
export type Square = string;
export type GameStatus =
  | "active"
  | "check"
  | "checkmate"
  | "stalemate"
  | "draw";

export interface MoveInput {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
}

export interface MoveRecord {
  from: Square;
  to: Square;
  promotion?: PromotionPiece;
  san: string;
  uci: string;
  piece: PieceSymbol;
  color: Color;
  captured?: PieceSymbol;
  flags: string;
}

export interface BoardPiece {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

export interface ChessState {
  fen: string;
  turn: Color;
  status: GameStatus;
  winner: Color | null;
  inCheck: boolean;
  moveNumber: number;
  history: MoveRecord[];
  lastMove: MoveRecord | null;
  board: BoardPiece[];
  legalMoves: Record<Square, MoveRecord[]>;
}

export interface ChessStatus {
  status: GameStatus;
  winner: Color | null;
  inCheck: boolean;
  isGameOver: boolean;
}
