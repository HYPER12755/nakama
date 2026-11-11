import { Chess, type Move } from "chess.js";
import type { MoveInput, PieceSymbol, PromotionPiece } from "./types";

export type AiDifficulty = "easy" | "medium" | "hard";

export interface AiMove extends MoveInput {
  san: string;
  uci: string;
}

export interface AiOptions {
  difficulty?: AiDifficulty;
  /** Soft search budget for one decision. */
  timeLimitMs?: number;
  /** Injectable randomness keeps the easy level testable. */
  random?: () => number;
}

const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

const MATE_SCORE = 1_000_000;
const INFINITY = MATE_SCORE * 2;

const DEPTHS: Record<AiDifficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
};

const TIME_LIMITS: Record<AiDifficulty, number> = {
  easy: 200,
  medium: 500,
  hard: 1_000,
};

const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_TABLE = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];

const QUEEN_TABLE = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_TABLE = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -30, -30, -40, -40, -30, -30, -30,
  -20, -20, -20, -20, -20, -20, -20, -20,
  -10, -10, -10, 0, 0, -10, -10, -10,
  0, 0, 0, 20, 20, 0, 0, 0,
  20, 30, 30, 0, 0, 30, 30, 20,
  20, 30, 30, 0, 0, 30, 30, 20,
];

const PIECE_TABLES: Record<PieceSymbol, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_TABLE,
};

interface RootScore {
  move: Move;
  score: number;
}

interface SearchContext {
  deadline: number;
  nodes: number;
  aborted: boolean;
}

function promotionOf(value: string | undefined): PromotionPiece | undefined {
  return value === "q" || value === "r" || value === "b" || value === "n"
    ? value
    : undefined;
}

function evaluation(chess: Chess): number {
  let whiteScore = 0;
  const board = chess.board();

  for (let row = 0; row < 8; row += 1) {
    const boardRow = board[row];
    if (boardRow === undefined) {
      continue;
    }

    for (let file = 0; file < 8; file += 1) {
      const piece = boardRow[file];
      if (piece === null) {
        continue;
      }

      const table =
        PIECE_TABLES[piece.type as PieceSymbol] ?? PIECE_TABLES.p;
      const tableRow = piece.color === "w" ? row : 7 - row;
      const positional = table[tableRow * 8 + file] ?? 0;
      const value = (PIECE_VALUES[piece.type as PieceSymbol] ?? 0) + positional;
      whiteScore += piece.color === "w" ? value : -value;
    }
  }

  // Eval is always returned from the side-to-move perspective.
  return chess.turn() === "w" ? whiteScore : -whiteScore;
}

function orderingScore(move: Move): number {
  let score = 0;
  if (move.captured) {
    score += 10 * (PIECE_VALUES[move.captured] ?? 0);
    score -= PIECE_VALUES[move.piece] ?? 0;
  }
  if (move.promotion) {
    score += PIECE_VALUES[move.promotion as PieceSymbol] ?? 0;
  }
  if (move.san.endsWith("#")) {
    score += 100_000;
  } else if (move.san.endsWith("+")) {
    score += 200;
  }
  return score;
}

function orderedMoves(chess: Chess): Move[] {
  return chess
    .moves({ verbose: true })
    .slice()
    .sort((left, right) => orderingScore(right) - orderingScore(left));
}

function expired(context: SearchContext): boolean {
  if (context.aborted) {
    return true;
  }
  if (Date.now() >= context.deadline) {
    context.aborted = true;
    return true;
  }
  return false;
}

function negamax(
  chess: Chess,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  context: SearchContext,
): number {
  context.nodes += 1;
  if (expired(context)) {
    return 0;
  }

  // Leaf nodes only need a static evaluation. Checkmate is detected one ply
  // above when the parent sees that this position has no legal replies.
  if (depth <= 0) {
    return evaluation(chess);
  }

  // Generating moves once tells us whether this is a terminal position.
  const moves = orderedMoves(chess);
  if (moves.length === 0) {
    return chess.isCheck() ? -MATE_SCORE + ply : 0;
  }
  if (chess.isDraw()) {
    return 0;
  }

  let best = -INFINITY;
  for (const move of moves) {
    chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    const score = -negamax(
      chess,
      depth - 1,
      -beta,
      -alpha,
      ply + 1,
      context,
    );
    chess.undo();

    if (context.aborted) {
      return 0;
    }
    if (score > best) {
      best = score;
    }
    if (score > alpha) {
      alpha = score;
    }
    if (alpha >= beta) {
      break;
    }
  }

  return best;
}

function searchRoot(
  chess: Chess,
  depth: number,
  context: SearchContext,
  preferred: readonly string[] = [],
): RootScore[] | null {
  const moves = orderedMoves(chess);
  const order = new Map(preferred.map((san, index) => [san, index]));

  moves.sort((left, right) => {
    const leftOrder = order.get(left.san);
    const rightOrder = order.get(right.san);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) -
        (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return orderingScore(right) - orderingScore(left);
  });

  const results: RootScore[] = [];
  let alpha = -INFINITY;

  for (const move of moves) {
    chess.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    });
    const score = -negamax(chess, depth - 1, -INFINITY, -alpha, 1, context);
    chess.undo();

    if (context.aborted) {
      return null;
    }

    results.push({ move, score });
    if (score > alpha) {
      alpha = score;
    }
  }

  return results.sort((left, right) => {
    if (left.score !== right.score) {
      return right.score - left.score;
    }
    return left.move.san.localeCompare(right.move.san);
  });
}

function asAiMove(move: Move): AiMove {
  return {
    from: move.from,
    to: move.to,
    promotion: promotionOf(move.promotion),
    san: move.san,
    uci: `${move.from}${move.to}${move.promotion ?? ""}`,
  };
}

/**
 * Pick a legal move for the side to move. The search is deterministic for
 * medium/hard levels; easy intentionally chooses among near-best moves so a
 * beginner can win games.
 */
export function chooseAiMove(
  fen: string,
  options: AiOptions = {},
): AiMove | null {
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (legal.length === 0) {
    return null;
  }
  if (legal.length === 1) {
    return asAiMove(legal[0]);
  }

  const difficulty = options.difficulty ?? "medium";
  const random = options.random ?? Math.random;

  if (difficulty === "easy") {
    // Easy deliberately skips the search tree. It prefers a capture most of
    // the time, otherwise it picks a random legal move so beginners can win.
    const captures = legal.filter((move) => move.captured !== undefined);
    const pool =
      captures.length > 0 && random() < 0.7 ? captures : legal;
    const index = Math.min(
      pool.length - 1,
      Math.floor(random() * pool.length),
    );
    return asAiMove(pool[Math.max(0, index)]);
  }

  const maxDepth = DEPTHS[difficulty];
  const timeLimit = Math.max(
    50,
    options.timeLimitMs ?? TIME_LIMITS[difficulty],
  );
  const context: SearchContext = {
    deadline: Date.now() + timeLimit,
    nodes: 0,
    aborted: false,
  };

  let completed: RootScore[] | null = null;
  let preferred: string[] = [];

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const result = searchRoot(chess, depth, context, preferred);
    if (result === null) {
      break;
    }
    completed = result;
    preferred = result.map((entry) => entry.move.san);
    if (Math.abs(result[0]?.score ?? 0) > MATE_SCORE / 2) {
      break;
    }
  }

  if (completed === null || completed.length === 0) {
    // The time limit can expire before even a one-ply search completes on a
    // very slow device. Any legal move is still better than stalling the game.
    return asAiMove(legal[Math.floor(Math.random() * legal.length)]);
  }

  return asAiMove(completed[0].move);
}
