import { describe, expect, it } from "vitest";
import {
  CENTER_POSITION,
  positionFor,
  positionsForTurn,
} from "../src/lib/striker";

describe("the striker when the turn changes", () => {
  it("starts in the middle of the baseline", () => {
    expect(CENTER_POSITION).toBe(0.5);
    expect(positionFor({}, "white")).toBe(0.5);
  });

  it("uses a player's own position when they are on the table", () => {
    expect(positionFor({ white: 0.72 }, "white")).toBe(0.72);
    expect(positionFor({ white: 0.72 }, "black")).toBe(0.5);
  });

  it("clears the old positions when the turn passes", () => {
    const next = positionsForTurn({ white: 0.9 }, "white", "black");
    expect(next).toEqual({});
    expect(positionFor(next, "black")).toBe(0.5);
  });

  it("keeps the position when a player pockets and stays on the table", () => {
    const positions = { white: 0.62 };
    expect(positionsForTurn(positions, "white", "white")).toBe(positions);
  });
});
