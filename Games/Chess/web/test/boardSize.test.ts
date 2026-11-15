import { describe, expect, it } from "vitest";
import { clampBoardSize, MIN_BOARD_SIZE } from "../src/lib/boardSize";
import { replayFrames } from "../src/lib/replay";

/**
 * The corner of the board and the replay of a finished game.
 */

describe("the size of the board", () => {
  it("is never smaller than a board that can be played on", () => {
    expect(clampBoardSize(10, 800)).toBe(MIN_BOARD_SIZE);
    expect(clampBoardSize(-40, 800)).toBe(MIN_BOARD_SIZE);
  });

  it("never grows past the space it has", () => {
    expect(clampBoardSize(1200, 700)).toBe(700);
    expect(clampBoardSize(1200, 100)).toBe(MIN_BOARD_SIZE);
  });

  it("keeps the size the player chose", () => {
    expect(clampBoardSize(520, 800)).toBe(520);
    expect(clampBoardSize(520.4, 800)).toBe(520);
  });
});

describe("the replay of a finished game", () => {
  it("shows the board before the first move and after every move", () => {
    const frames = replayFrames(["e4", "e5", "Nf3"]);

    expect(frames).toHaveLength(4);
    expect(frames[0].san).toBeNull();
    expect(frames[1].san).toBe("e4");
    expect(frames[3].san).toBe("Nf3");
    // The board is really played out, so the knight is on f3 at the end.
    const knight = frames[3].state.board.find(
      (piece) => piece.square === "f3",
    );
    expect(knight?.type).toBe("n");
  });

  it("keeps the board it can play when a move is broken", () => {
    const frames = replayFrames(["e4", "not a move", "Nf3"]);

    expect(frames).toHaveLength(2);
    expect(frames[1].san).toBe("e4");
  });

  it("has only the start when there were no moves", () => {
    expect(replayFrames([])).toHaveLength(1);
  });
});
