import { describe, expect, it } from "vitest";
import { positionAfter } from "../src/lib/engine/pvBoard";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * The little board that shows where the line of the engine goes.
 */

describe("the position a line reaches", () => {
  it("is the board after the moves of the line", () => {
    const position = positionAfter(START_FEN, ["e2e4", "e7e5"]);

    expect(position).not.toBeNull();
    expect(position?.board).toHaveLength(32);

    const pawn = position?.board.find((piece) => piece.square === "e4");
    expect(pawn?.color).toBe("w");
    expect(position?.lastMove).toEqual({ from: "e7", to: "e5" });
  });

  it("is nothing when the line is empty", () => {
    expect(positionAfter(START_FEN, [])).toBeNull();
  });

  it("is nothing when the moves cannot be played", () => {
    expect(positionAfter(START_FEN, ["e2e5"])).toBeNull();
  });

  it("marks the move that was played last", () => {
    const position = positionAfter(START_FEN, ["e2e4"]);

    expect(position?.lastMove).toEqual({ from: "e2", to: "e4" });
  });
});
