import { describe, expect, it } from "vitest";
import { ratingPath } from "@moongames/game-ui";
import type { GameHistoryEntry } from "@moongames/game-ui";

/**
 * The rating of a player, drawn as a line.
 */

function entry(
  ratingAfter: number,
  rated = true,
  endedAt = 0,
): GameHistoryEntry {
  return {
    matchId: `m${ratingAfter}-${endedAt}`,
    mode: "quick",
    rated,
    outcome: "win",
    status: "checkmate",
    reason: "checkmate",
    opponent: { userId: "u2", username: "Someone" },
    steps: [],
    ratingBefore: ratingAfter - 10,
    ratingAfter,
    ratingDelta: 10,
    endedAt,
  };
}

describe("the path of a rating", () => {
  it("is drawn from the oldest game to the newest", () => {
    const history = [entry(1210, true, 3), entry(1190, true, 2), entry(1200, true, 1)];
    const { path, points } = ratingPath(history, 200, 100);

    expect(points).toHaveLength(3);
    // The oldest game is on the left.
    expect(points[0].x).toBeLessThan(points[2].x);
    // The rating of the oldest game is the first one.
    expect(points[0].rating).toBe(1200);
    expect(points[2].rating).toBe(1210);
    expect(path.startsWith("M ")).toBe(true);
  });

  it("is a flat line when the rating never moved", () => {
    const history = [entry(1200, true, 2), entry(1200, true, 1)];
    const { points } = ratingPath(history, 200, 100);

    expect(points[0].y).toBe(points[1].y);
  });

  it("leaves out the games that were not rated", () => {
    const history = [entry(1210, true, 3), entry(1300, false, 2), entry(1200, true, 1)];
    const { points } = ratingPath(history, 200, 100);

    expect(points).toHaveLength(2);
    expect(points.every((point) => point.rating !== 1300)).toBe(true);
  });

  it("is nothing when there are no rated games", () => {
    const { path, points } = ratingPath([entry(1200, false)], 200, 100);

    expect(path).toBe("");
    expect(points).toHaveLength(0);
  });
});
