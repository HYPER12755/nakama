/**
 * Writing a move without touching the board, and reading the moves
 * without seeing the pieces.
 */

/**
 * The move without the name of the piece.
 *
 * A player who does not want to see the names of the pieces reads "f3"
 * instead of "Nf3", and "d5" instead of "exd5".
 */
export function blindSan(san: string): string {
  if (san.length === 0) {
    return san;
  }

  // Castling keeps its shape, for there is no square to write.
  if (san === "O-O" || san === "O-O-O") {
    return san.replace(/O/g, "0");
  }

  // A pawn that takes: the file it took from and the mark of the taking
  // are names too, so only the square it went to is left.
  if (/^[a-h]x/.test(san)) {
    return san.slice(2);
  }

  // A piece that moves: the name of the piece goes, the rest stays. A
  // pawn that only moves keeps its square, for a square is not a name.
  return san.replace(/^[NBRQK]/, "");
}

/**
 * The move a player wrote, and the square it was written on.
 *
 * A player may write "e4", "e2e4", "Nf3" or "N f3", and the same move is
 * meant by all of them.
 */
export interface KeyboardMove {
  /** The move, as the player wrote it. */
  text: string;
  /** The square the piece stands on, when the player wrote it. */
  from: string | null;
  /** The square the piece goes to, when the player wrote it. */
  to: string | null;
  /** The piece that moves, when the player wrote its name. */
  piece: string | null;
  /** Whether the move takes a piece. */
  capture: boolean;
  /** Whether the move makes a queen. */
  promotion: string | null;
}

const FILES = "abcdefgh";

/** Read what a player has typed so far. */
export function readKeyboardMove(text: string): KeyboardMove {
  const trimmed = text.trim().replace(/\s+/g, "");
  const move: KeyboardMove = {
    text: trimmed,
    from: null,
    to: null,
    piece: null,
    capture: false,
    promotion: null,
  };

  if (trimmed.length === 0) {
    return move;
  }

  let rest = trimmed;

  // The piece that moves.
  if (/^[NBRQK]/.test(rest)) {
    move.piece = rest[0].toLowerCase();
    rest = rest.slice(1);
  }

  // Two squares: the piece stands on the first and goes to the second.
  if (/^[a-h][1-8][a-h][1-8]/.test(rest)) {
    move.from = rest.slice(0, 2);
    rest = rest.slice(2);
  } else if (
    move.piece === null &&
    /^[a-h]x/.test(rest)
  ) {
    // A pawn that takes: the file it took from is not needed.
    rest = rest.slice(1);
  }

  // A piece that is taken.
  if (rest.startsWith("x")) {
    move.capture = true;
    rest = rest.slice(1);
  }

  // The square the piece goes to.
  const toMatch = /^([a-h][1-8])/.exec(rest);
  if (toMatch !== null) {
    move.to = toMatch[1];
    rest = rest.slice(toMatch[1].length);
  }

  // The piece a pawn becomes.
  const promotion = /^=([NBRQK])/.exec(rest);
  if (promotion !== null) {
    move.promotion = promotion[1].toLowerCase();
  }

  return move;
}

/**
 * The moves of a piece, by the name and the square the player wrote.
 *
 * The moves are the ones the engine says are legal, so a move written by
 * hand is checked the same way a move made by clicking is.
 */
export function findKeyboardMove<T extends { san: string; from: string; to: string; promotion?: string }>(
  moves: T[],
  written: KeyboardMove,
): T | null {
  if (written.text.length === 0) {
    return null;
  }

  for (const move of moves) {
    if (move.san === written.text) {
      return move;
    }
  }

  if (written.to === null) {
    return null;
  }

  for (const move of moves) {
    if (move.to !== written.to) {
      continue;
    }
    if (written.from !== null && move.from !== written.from) {
      continue;
    }
    if (
      written.piece !== null &&
      move.san.replace(/^[NBRQK]/, "")[0]?.toLowerCase() !== written.piece
    ) {
      continue;
    }
    if (written.promotion !== null) {
      if ((move.promotion ?? "").toLowerCase() !== written.promotion) {
        continue;
      }
    }
    return move;
  }

  return null;
}
