import {
  Chess,
  type Move,
  type Square as ChessSquare,
} from "chess.js";
import type {
  BoardPiece,
  ChessState,
  ChessStatus,
  Color,
  MoveInput,
  MoveRecord,
  PieceSymbol,
  PromotionPiece,
  Square,
} from "./types";

const PROMOTION_PIECES: ReadonlySet<string> = new Set(["q", "r", "b", "n"]);

export class ChessMoveError extends Error {
  readonly from: Square;
  readonly to: Square;

  constructor(from: Square, to: Square, message: string) {
    super(message);
    this.name = "ChessMoveError";
    this.from = from;
    this.to = to;
  }
}

function asPromotion(value: string | undefined): PromotionPiece | undefined {
  return value !== undefined && PROMOTION_PIECES.has(value)
    ? (value as PromotionPiece)
    : undefined;
}

function toMoveRecord(move: Move): MoveRecord {
  return {
    from: move.from,
    to: move.to,
    promotion: asPromotion(move.promotion),
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
    piece: move.piece,
    color: move.color,
    captured: move.captured,
    flags: move.flags,
  };
}

function statusOf(chess: Chess): ChessStatus {
  if (chess.isCheckmate()) {
    return {
      status: "checkmate",
      winner: chess.turn() === "w" ? "b" : "w",
      inCheck: true,
      isGameOver: true,
    };
  }

  if (chess.isStalemate()) {
    return {
      status: "stalemate",
      winner: null,
      inCheck: false,
      isGameOver: true,
    };
  }

  if (chess.isDraw()) {
    return {
      status: "draw",
      winner: null,
      inCheck: chess.isCheck(),
      isGameOver: true,
    };
  }

  if (chess.isCheck()) {
    return {
      status: "check",
      winner: null,
      inCheck: true,
      isGameOver: false,
    };
  }

  return {
    status: "active",
    winner: null,
    inCheck: false,
    isGameOver: false,
  };
}

function boardOf(chess: Chess): BoardPiece[] {
  const pieces: BoardPiece[] = [];

  for (const row of chess.board()) {
    for (const piece of row) {
      if (piece !== null) {
        pieces.push({
          square: piece.square,
          type: piece.type,
          color: piece.color,
        });
      }
    }
  }

  return pieces;
}

function groupMoves(moves: Move[]): Record<Square, MoveRecord[]> {
  const grouped: Record<Square, MoveRecord[]> = {};

  for (const move of moves) {
    const record = toMoveRecord(move);
    const bucket = grouped[record.from];
    if (bucket) {
      bucket.push(record);
    } else {
      grouped[record.from] = [record];
    }
  }

  return grouped;
}

function moveNumberFromFen(fen: string): number {
  const value = Number(fen.split(" ")[5] ?? "1");
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export class ChessEngine {
  private readonly chess: Chess;

  constructor(fen?: string) {
    this.chess = fen === undefined ? new Chess() : new Chess(fen);
  }

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn();
  }

  get history(): MoveRecord[] {
    return this.chess.history({ verbose: true }).map(toMoveRecord);
  }

  get lastMove(): MoveRecord | null {
    const history = this.chess.history({ verbose: true });
    const last = history.at(-1);
    return last === undefined ? null : toMoveRecord(last);
  }

  legalMoves(from?: Square): MoveRecord[] {
    const options: { verbose: true; square?: ChessSquare } = { verbose: true };
    if (from !== undefined) {
      options.square = from as ChessSquare;
    }
    return this.chess.moves(options).map(toMoveRecord);
  }

  move(input: MoveInput): MoveRecord {
    try {
      const move = this.chess.move({
        from: input.from,
        to: input.to,
        promotion: input.promotion,
      });
      return toMoveRecord(move);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Illegal chess move";
      throw new ChessMoveError(input.from, input.to, message);
    }
  }

  moveSan(san: string): MoveRecord {
    try {
      return toMoveRecord(this.chess.move(san));
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Illegal chess move";
      throw new Error(`Could not apply ${san}: ${message}`);
    }
  }

  undo(): MoveRecord | null {
    const move = this.chess.undo();
    return move === null ? null : toMoveRecord(move);
  }

  reset(): void {
    this.chess.reset();
  }

  load(fen: string): void {
    this.chess.load(fen);
  }

  loadPgn(pgn: string): void {
    try {
      this.chess.loadPgn(pgn);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Invalid PGN";
      throw new Error(message);
    }
  }

  status(): ChessStatus {
    return statusOf(this.chess);
  }

  getState(): ChessState {
    const fen = this.chess.fen();
    const history = this.chess.history({ verbose: true }).map(toMoveRecord);
    const status = statusOf(this.chess);

    return {
      fen,
      turn: this.chess.turn(),
      status: status.status,
      winner: status.winner,
      inCheck: status.inCheck,
      moveNumber: moveNumberFromFen(fen),
      history,
      lastMove: history.at(-1) ?? null,
      board: boardOf(this.chess),
      legalMoves: groupMoves(this.chess.moves({ verbose: true })),
    };
  }

  pgn(): string {
    return this.chess.pgn();
  }

  ascii(): string {
    return this.chess.ascii();
  }
}

export function createChessEngine(fen?: string): ChessEngine {
  return new ChessEngine(fen);
}

export function replay(moves: readonly MoveInput[]): ChessEngine {
  const engine = new ChessEngine();
  for (const move of moves) {
    engine.move(move);
  }
  return engine;
}

export type { PieceSymbol };
