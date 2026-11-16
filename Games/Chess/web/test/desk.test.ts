import { describe, expect, it } from "vitest";
import {
  deskPgn,
  isValidFen,
  openGame,
  openPosition,
  readDeskInput,
} from "../src/lib/desk";

/**
 * The desk: a game or a position, brought in and walked through.
 */

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("what is brought to the desk", () => {
  it("tells a position from a game", () => {
    expect(readDeskInput(START_FEN).kind).toBe("fen");
    expect(readDeskInput("  " + START_FEN + "  ").kind).toBe("fen");

    expect(readDeskInput('1. e4 e5 2. Nf3').kind).toBe("pgn");
    expect(readDeskInput('[Event "A game"]\n\n1. e4 e5').kind).toBe("pgn");
  });

  it("says so when nothing can be read", () => {
    expect(readDeskInput("").kind).toBe("none");
    expect(readDeskInput("hello").kind).toBe("none");
  });

  it("knows a position that can be put on a board", () => {
    expect(isValidFen(START_FEN)).toBe(true);
    expect(isValidFen("not a position")).toBe(false);
  });
});

describe("a game at the desk", () => {
  it("is walked through move by move", () => {
    const game = openGame("1. e4 e5 2. Nf3 Nc6 3. Bb5");

    expect(game.error).toBeNull();
    expect(game.steps).toEqual(["e4", "e5", "Nf3", "Nc6", "Bb5"]);
    expect(game.frames).toHaveLength(6);

    // The board really moves: the pawn is on e4 after the first move.
    const pawn = game.frames[1].state.board.find(
      (piece) => piece.square === "e4",
    );
    expect(pawn?.type).toBe("p");
    expect(pawn?.color).toBe("w");
  });

  it("takes the tags of a game as well", () => {
    const game = openGame(
      '[Event "A game"]\n[Result "1-0"]\n\n1. e4 e5 2. Qh5 Nc6 3. Qxf7# 1-0',
    );

    expect(game.error).toBeNull();
    expect(game.steps.length).toBeGreaterThan(4);
    expect(game.frames.length).toBe(game.steps.length + 1);
  });

  it("says so when a game cannot be read", () => {
    const game = openGame("1. e4 e5 2. NotAMove");

    expect(game.error).not.toBeNull();
    expect(game.frames).toHaveLength(0);
  });
});

describe("a position at the desk", () => {
  it("is put on the board as it was written", () => {
    const position = openPosition(START_FEN);

    expect(position.error).toBeNull();
    expect(position.frames).toHaveLength(1);
    expect(position.frames[0].state.board).toHaveLength(32);
    expect(position.fen).toBe(START_FEN);
  });

  it("says so when a position cannot be read", () => {
    const position = openPosition("not a position");

    expect(position.error).not.toBeNull();
    expect(position.frames).toHaveLength(0);
  });
});

describe("a game carried away from the desk", () => {
  it("is written in moves again", () => {
    expect(deskPgn(["e4", "e5", "Nf3"])).toBe("1. e4 e5 2. Nf3 *");
    expect(deskPgn([])).toBe("");
  });
});
