/**
 * The position editor: a position built by hand.
 *
 * A position is written down in six fields, and this is the reading and
 * the writing of them. The pieces go on the squares, the side to move is
 * chosen, the rooks are told whether they may still castle, and the
 * counters are set.
 */

import type { BoardPiece, Color, PieceSymbol, Square } from "@moongames/chess-core";

/** The pieces that can be put on the board. */
export const EDITOR_PIECES: PieceSymbol[] = ["k", "q", "r", "b", "n", "p"];

/** A position being built. */
export interface EditorState {
  /** The pieces on the board, by square. */
  squares: Map<Square, { type: PieceSymbol; color: Color }>;
  /** Whose turn it is. */
  turn: Color;
  /** Whether the white king may still castle. */
  whiteKingSide: boolean;
  /** Whether the white queen may still castle. */
  whiteQueenSide: boolean;
  /** Whether the black king may still castle. */
  blackKingSide: boolean;
  /** Whether the black queen may still castle. */
  blackQueenSide: boolean;
  /** The square a pawn may be taken on, when one may. */
  enPassant: Square | null;
  /** The moves since the last pawn move or capture. */
  halfmove: number;
  /** The move the game is on. */
  fullmove: number;
}

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
const RANKS = ["8", "7", "6", "5", "4", "3", "2", "1"] as const;

/** The position every game starts from. */
export function emptyEditorState(): EditorState {
  const squares = new Map<Square, { type: PieceSymbol; color: Color }>();
  const back: PieceSymbol[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

  for (const file of FILES) {
    squares.set(`${file}8`, { type: back[FILES.indexOf(file)], color: "b" });
    squares.set(`${file}7`, { type: "p", color: "b" });
    squares.set(`${file}2`, { type: "p", color: "w" });
    squares.set(`${file}1`, { type: back[FILES.indexOf(file)], color: "w" });
  }

  return {
    squares,
    turn: "w",
    whiteKingSide: true,
    whiteQueenSide: true,
    blackKingSide: true,
    blackQueenSide: true,
    enPassant: null,
    halfmove: 0,
    fullmove: 1,
  };
}

/**
 * Read a position that is written down.
 *
 * A position that cannot be read gives the empty board, so the editor
 * always has something to show.
 */
export function fenToEditorState(fen: string): EditorState {
  const state = emptyEditorState();
  state.squares.clear();

  const fields = fen.trim().split(/\s+/);
  const placement = fields[0] ?? "";
  const ranks = placement.split("/");

  for (let index = 0; index < RANKS.length && index < ranks.length; index += 1) {
    let file = 0;
    for (const character of ranks[index]) {
      if (character >= "1" && character <= "8") {
        file += Number(character);
        continue;
      }
      const type = character.toLowerCase() as PieceSymbol;
      const color: Color = character === character.toUpperCase() ? "w" : "b";
      if (file < 8) {
        state.squares.set(`${FILES[file]}${RANKS[index]}`, { type, color });
      }
      file += 1;
    }
  }

  state.turn = fields[1] === "b" ? "b" : "w";

  const castling = fields[2] ?? "-";
  state.whiteKingSide = castling.includes("K");
  state.whiteQueenSide = castling.includes("Q");
  state.blackKingSide = castling.includes("k");
  state.blackQueenSide = castling.includes("q");

  const enPassant = fields[3] ?? "-";
  state.enPassant = enPassant.length === 2 ? enPassant : null;

  state.halfmove = Number(fields[4] ?? 0) || 0;
  state.fullmove = Number(fields[5] ?? 1) || 1;

  return state;
}

/**
 * Write a position down, the way it is written in a game.
 */
export function editorToFen(state: EditorState): string {
  const placement: string[] = [];

  for (const rank of RANKS) {
    let row = "";
    let empty = 0;
    for (const file of FILES) {
      const piece = state.squares.get(`${file}${rank}`);
      if (piece === undefined) {
        empty += 1;
        continue;
      }
      if (empty > 0) {
        row += String(empty);
        empty = 0;
      }
      row += piece.color === "w" ? piece.type.toUpperCase() : piece.type;
    }
    if (empty > 0) {
      row += String(empty);
    }
    placement.push(row);
  }

  const castling =
    [
      state.whiteKingSide ? "K" : "",
      state.whiteQueenSide ? "Q" : "",
      state.blackKingSide ? "k" : "",
      state.blackQueenSide ? "q" : "",
    ].join("") || "-";

  return [
    placement.join("/"),
    state.turn,
    castling,
    state.enPassant ?? "-",
    String(Math.max(0, Math.floor(state.halfmove))),
    String(Math.max(1, Math.floor(state.fullmove))),
  ].join(" ");
}

/** The pieces of a position, as the board draws them. */
export function editorToBoard(state: EditorState): BoardPiece[] {
  const board: BoardPiece[] = [];
  for (const [square, piece] of state.squares) {
    board.push({ square, type: piece.type, color: piece.color });
  }
  return board;
}

/** Put a piece on a square, or take the one that is there off. */
export function editorPlace(
  state: EditorState,
  square: Square,
  piece: { type: PieceSymbol; color: Color } | null,
): EditorState {
  const squares = new Map(state.squares);
  if (piece === null) {
    squares.delete(square);
  } else {
    squares.set(square, piece);
  }
  return { ...state, squares };
}

/**
 * Take every piece off the board, so a position can be built from nothing.
 *
 * The rules of the position are kept, so the side to move and the counters
 * stay as they were.
 */
export function clearEditorState(state: EditorState): EditorState {
  return { ...state, squares: new Map() };
}

/** The colours of the sides, for the picker of the pieces. */
export const EDITOR_COLORS: Color[] = ["w", "b"];
