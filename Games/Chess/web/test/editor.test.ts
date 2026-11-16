import { describe, expect, it } from "vitest";
import { ChessEngine } from "@moongames/chess-core";
import {
  clearEditorState,
  editorPlace,
  editorToBoard,
  editorToFen,
  emptyEditorState,
  fenToEditorState,
} from "../src/lib/editor";

/**
 * The position editor: a position built by hand.
 */

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("a position that is written down", () => {
  it("is read back the way it was written", () => {
    const state = fenToEditorState(START_FEN);

    expect(state.turn).toBe("w");
    expect(state.whiteKingSide).toBe(true);
    expect(state.whiteQueenSide).toBe(true);
    expect(state.blackKingSide).toBe(true);
    expect(state.blackQueenSide).toBe(true);
    expect(state.enPassant).toBeNull();
    expect(state.halfmove).toBe(0);
    expect(state.fullmove).toBe(1);
    expect(state.squares.size).toBe(32);
    expect(state.squares.get("e1")?.type).toBe("k");
    expect(state.squares.get("e8")?.color).toBe("b");
  });

  it("is written back the same way it was read", () => {
    expect(editorToFen(fenToEditorState(START_FEN))).toBe(START_FEN);
  });

  it("keeps the counters and the castling rights", () => {
    const fen = "8/8/8/8/8/5k2/8/4K3 b - - 12 37";
    const state = fenToEditorState(fen);

    expect(state.turn).toBe("b");
    expect(state.whiteKingSide).toBe(false);
    expect(state.enPassant).toBeNull();
    expect(state.halfmove).toBe(12);
    expect(state.fullmove).toBe(37);
    expect(editorToFen(state)).toBe(fen);
  });

  it("keeps the square a pawn may be taken on", () => {
    const state = fenToEditorState(
      "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
    );

    expect(state.enPassant).toBe("e3");
    expect(editorToFen(state)).toContain("e3");
  });
});

describe("a position that is built", () => {
  it("starts from the beginning", () => {
    const state = emptyEditorState();

    expect(state.squares.size).toBe(32);
    expect(editorToFen(state)).toBe(START_FEN);
  });

  it("takes a piece off a square", () => {
    const state = editorPlace(emptyEditorState(), "e2", null);

    expect(state.squares.has("e2")).toBe(false);
    expect(state.squares.size).toBe(31);
    expect(editorToFen(state)).not.toContain("PPPPPPPP");
  });

  it("puts a piece on a square", () => {
    const state = editorPlace(emptyEditorState(), "a4", {
      type: "n",
      color: "w",
    });

    expect(state.squares.get("a4")).toEqual({ type: "n", color: "w" });
    expect(editorToBoard(state)).toHaveLength(33);
  });

  it("writes a position the engine can play from", () => {
    // Two kings and a rook, which is a position that can be played.
    const state = editorPlace(
      editorPlace(
        editorPlace(clearEditorState(emptyEditorState()), "e1", {
          type: "k",
          color: "w",
        }),
        "e8",
        { type: "k", color: "b" },
      ),
      "a1",
      { type: "r", color: "w" },
    );

    const fen = editorToFen(state);
    const engine = new ChessEngine();
    expect(() => engine.load(fen)).not.toThrow();
    expect(engine.getState().board).toHaveLength(3);
  });

  it("takes every piece off the board", () => {
    const cleared = clearEditorState(emptyEditorState());

    expect(cleared.squares.size).toBe(0);
    expect(cleared.turn).toBe("w");
    expect(cleared.fullmove).toBe(1);
  });
});
