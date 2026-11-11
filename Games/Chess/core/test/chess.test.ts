import { describe, expect, it } from "vitest";
import vectors from "../../tests/vectors.json";
import { ChessEngine, ChessMoveError, replay } from "../src";

function totalLegalMoves(engine: ChessEngine): number {
  return Object.values(engine.getState().legalMoves).flat().length;
}

describe("chess vectors", () => {
  it.each(vectors.positions)(
    "$name has $legalMoves legal moves",
    ({ fen, legalMoves }) => {
      const engine = new ChessEngine(fen);
      expect(totalLegalMoves(engine)).toBe(legalMoves);
    },
  );
});

describe("ChessEngine", () => {
  it("starts from the standard position", () => {
    const engine = new ChessEngine();
    const state = engine.getState();

    expect(state.turn).toBe("w");
    expect(state.status).toBe("active");
    expect(state.board).toHaveLength(32);
    expect(state.history).toHaveLength(0);
    expect(state.legalMoves.e2?.map((move) => move.to)).toEqual(["e3", "e4"]);
  });

  it("applies a legal move and updates the state", () => {
    const engine = new ChessEngine();
    const move = engine.move({ from: "e2", to: "e4" });
    const state = engine.getState();

    expect(move.san).toBe("e4");
    expect(move.uci).toBe("e2e4");
    expect(state.turn).toBe("b");
    expect(state.lastMove?.san).toBe("e4");
    expect(state.history).toHaveLength(1);
    expect(state.board.find((piece) => piece.square === "e4")).toEqual({
      square: "e4",
      type: "p",
      color: "w",
    });
  });

  it("rejects an illegal move", () => {
    const engine = new ChessEngine();

    expect(() => engine.move({ from: "e2", to: "e5" })).toThrow(ChessMoveError);
    expect(engine.history).toHaveLength(0);
  });

  it("detects Fool's Mate", () => {
    const engine = new ChessEngine();

    for (const [from, to] of [
      ["f2", "f3"],
      ["e7", "e5"],
      ["g2", "g4"],
      ["d8", "h4"],
    ] as const) {
      engine.move({ from, to });
    }

    expect(engine.status()).toEqual({
      status: "checkmate",
      winner: "b",
      inCheck: true,
      isGameOver: true,
    });
    expect(engine.getState().history.at(-1)?.san).toBe("Qh4#");
    expect(totalLegalMoves(engine)).toBe(0);
    expect(engine.pgn()).toContain("Qh4#");
  });

  it("supports castling", () => {
    const engine = new ChessEngine();

    for (const [from, to] of [
      ["e2", "e4"],
      ["e7", "e5"],
      ["g1", "f3"],
      ["b8", "c6"],
      ["f1", "c4"],
      ["g8", "f6"],
      ["e1", "g1"],
    ] as const) {
      engine.move({ from, to });
    }

    expect(engine.lastMove?.san).toBe("O-O");
    expect(engine.lastMove?.flags).toContain("k");
    expect(engine.getState().board.find((piece) => piece.square === "g1")).toEqual({
      square: "g1",
      type: "k",
      color: "w",
    });
    expect(engine.getState().board.find((piece) => piece.square === "f1")).toEqual({
      square: "f1",
      type: "r",
      color: "w",
    });
  });

  it("supports en passant", () => {
    const engine = new ChessEngine();

    for (const [from, to] of [
      ["e2", "e4"],
      ["a7", "a6"],
      ["e4", "e5"],
      ["d7", "d5"],
    ] as const) {
      engine.move({ from, to });
    }

    const move = engine.move({ from: "e5", to: "d6" });

    expect(move.san).toBe("exd6");
    expect(move.flags).toContain("e");
    expect(move.captured).toBe("p");
    expect(engine.getState().board.find((piece) => piece.square === "d5")).toBeUndefined();
  });

  it("supports promotion", () => {
    const engine = new ChessEngine("8/P7/8/8/8/8/8/k6K w - - 0 1");
    const move = engine.move({ from: "a7", to: "a8", promotion: "q" });

    expect(move.promotion).toBe("q");
    expect(move.san).toBe("a8=Q+");
    expect(engine.getState().board.find((piece) => piece.square === "a8")).toEqual({
      square: "a8",
      type: "q",
      color: "w",
    });
  });

  it("detects stalemate", () => {
    const engine = new ChessEngine("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1");

    expect(engine.status()).toEqual({
      status: "stalemate",
      winner: null,
      inCheck: false,
      isGameOver: true,
    });
    expect(totalLegalMoves(engine)).toBe(0);
  });

  it("detects checkmate", () => {
    const engine = new ChessEngine("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");

    expect(engine.status()).toEqual({
      status: "checkmate",
      winner: "w",
      inCheck: true,
      isGameOver: true,
    });
    expect(totalLegalMoves(engine)).toBe(0);
  });

  it("undoes moves", () => {
    const engine = new ChessEngine();
    engine.move({ from: "e2", to: "e4" });
    const undone = engine.undo();

    expect(undone?.san).toBe("e4");
    expect(engine.history).toHaveLength(0);
    expect(engine.fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  });

  it("replays a game", () => {
    const engine = replay([
      { from: "e2", to: "e4" },
      { from: "e7", to: "e5" },
      { from: "g1", to: "f3" },
    ]);

    expect(engine.history.map((move) => move.san)).toEqual(["e4", "e5", "Nf3"]);
  });

  it("loads a FEN position", () => {
    const engine = new ChessEngine();
    engine.load("8/P7/8/8/8/8/8/k6K w - - 0 1");

    expect(engine.turn).toBe("w");
    expect(engine.getState().board).toHaveLength(3);
    expect(engine.legalMoves("a7").some((move) => move.promotion === "q")).toBe(true);
  });

  it("loads stored PGN and can walk it backwards for replay", () => {
    const engine = new ChessEngine();
    engine.loadPgn("1. e4 e5 2. Nf3 Nc6 3. Bb5");

    expect(engine.history.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
      "Bb5",
    ]);

    engine.undo();
    expect(engine.history.map((move) => move.san)).toEqual([
      "e4",
      "e5",
      "Nf3",
      "Nc6",
    ]);
  });
});
