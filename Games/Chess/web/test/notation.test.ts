import { describe, expect, it } from "vitest";
import { ChessEngine } from "@moongames/chess-core";
import {
  blindSan,
  findKeyboardMove,
  readKeyboardMove,
} from "../src/lib/notation";

/**
 * Reading the moves without seeing the pieces, and writing a move without
 * touching the board.
 */

describe("a move without the name of the piece", () => {
  it("hides the name of the piece that moves", () => {
    expect(blindSan("Nf3")).toBe("f3");
    expect(blindSan("Bc4")).toBe("c4");
    expect(blindSan("Rd1")).toBe("d1");
    expect(blindSan("Qd5")).toBe("d5");
    expect(blindSan("Ke2")).toBe("e2");
  });

  it("hides the file a pawn took from", () => {
    expect(blindSan("exd5")).toBe("d5");
  });

  it("keeps the square of a pawn that only moves", () => {
    expect(blindSan("e4")).toBe("e4");
  });

  it("keeps the shape of a castling move", () => {
    expect(blindSan("O-O")).toBe("0-0");
    expect(blindSan("O-O-O")).toBe("0-0-0");
  });
});

describe("a move that is written", () => {
  it("is read as the square it goes to", () => {
    const written = readKeyboardMove("e4");

    expect(written.to).toBe("e4");
    expect(written.from).toBeNull();
    expect(written.piece).toBeNull();
  });

  it("is read as the two squares when both are written", () => {
    const written = readKeyboardMove("e2e4");

    expect(written.from).toBe("e2");
    expect(written.to).toBe("e4");
  });

  it("is read with the piece that moves", () => {
    const written = readKeyboardMove("Nf3");

    expect(written.piece).toBe("n");
    expect(written.to).toBe("f3");
  });

  it("is read with the piece that is taken", () => {
    expect(readKeyboardMove("exd5").capture).toBe(true);
    expect(readKeyboardMove("e4").capture).toBe(false);
  });

  it("is read with the piece a pawn becomes", () => {
    expect(readKeyboardMove("e8=Q").promotion).toBe("q");
  });
});

describe("a move that is written and looked for", () => {
  const engine = new ChessEngine();
  const moves = Object.values(engine.getState().legalMoves).flat();

  it("finds the move that was written", () => {
    const found = findKeyboardMove(moves, readKeyboardMove("e4"));

    expect(found?.san).toBe("e4");
    expect(found?.from).toBe("e2");
    expect(found?.to).toBe("e4");
  });

  it("finds a move written with both squares", () => {
    const found = findKeyboardMove(moves, readKeyboardMove("e2e4"));

    expect(found?.san).toBe("e4");
  });

  it("finds a move written with the name of the piece", () => {
    const found = findKeyboardMove(moves, readKeyboardMove("Nf3"));

    expect(found?.san).toBe("Nf3");
    expect(found?.to).toBe("f3");
  });

  it("finds nothing when the move cannot be played", () => {
    expect(findKeyboardMove(moves, readKeyboardMove("e5"))).toBeNull();
    expect(findKeyboardMove(moves, readKeyboardMove(""))).toBeNull();
  });
});

describe("the moves of a piece, whoever's turn it is", () => {
  it("are known even when it is the other side's turn", () => {
    const engine = new ChessEngine();
    const moves = engine.movesFrom("e2");

    expect(moves.length).toBeGreaterThan(0);
    expect(moves.some((move) => move.to === "e3")).toBe(true);
    expect(moves.some((move) => move.to === "e4")).toBe(true);
  });

  it("are nothing for a square with no piece", () => {
    expect(new ChessEngine().movesFrom("e5")).toHaveLength(0);
  });
});
