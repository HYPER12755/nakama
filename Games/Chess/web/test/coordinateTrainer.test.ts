import { describe, expect, it } from "vitest";
import {
  addTrainerScore,
  emptyTrainerScores,
  newTrainerKey,
  TRAINER_DURATION,
  TRAINER_FILES,
  TRAINER_RANKS,
  TRAINER_SCORE_LIMIT,
  trainerFen,
  trainerScorePath,
} from "../src/lib/coordinateTrainer";

/**
 * The coordinate trainer, the way lichess keeps it.
 */

describe("the next coordinate", () => {
  it("is a square of the board", () => {
    for (let round = 0; round < 50; round += 1) {
      const key = newTrainerKey("a1");
      expect(TRAINER_FILES).toContain(key[0]);
      expect(TRAINER_RANKS).toContain(key[1]);
    }
  });

  it("changes the file or the rank, never both at once", () => {
    for (let round = 0; round < 50; round += 1) {
      const oldKey = "c5";
      const key = newTrainerKey(oldKey);
      const sameFile = key[0] === oldKey[0];
      const sameRank = key[1] === oldKey[1];
      expect(sameFile && sameRank).toBe(false);
    }
  });

  it("uses only the files and the ranks that were chosen", () => {
    for (let round = 0; round < 50; round += 1) {
      const key = newTrainerKey(
        "a1",
        new Set(["d", "e"]),
        new Set(["4", "5"]),
      );
      expect(["d", "e"]).toContain(key[0]);
      expect(["4", "5"]).toContain(key[1]);
    }
  });
});

describe("the board of the trainer", () => {
  it("has the pieces, or has none", () => {
    expect(trainerFen(true)).toContain("rnbqkbnr");
    expect(trainerFen(false)).toBe("8/8/8/8/8/8/8/8");
  });
});

describe("the scores of the trainer", () => {
  it("are kept, and the oldest is let go", () => {
    let scores = emptyTrainerScores();
    for (let round = 0; round < TRAINER_SCORE_LIMIT + 5; round += 1) {
      scores = addTrainerScore(scores, "findSquare", "w", round);
    }

    expect(scores.findSquare.w).toHaveLength(TRAINER_SCORE_LIMIT);
    expect(scores.findSquare.w[scores.findSquare.w.length - 1]).toBe(
      TRAINER_SCORE_LIMIT + 4,
    );
    expect(scores.findSquare.b).toHaveLength(0);
    expect(scores.nameSquare.w).toHaveLength(0);
  });

  it("are drawn as a line", () => {
    const path = trainerScorePath([2, 5, 3], 120, 30);

    expect(path.startsWith("M ")).toBe(true);
    expect(path.split("L ").length).toBe(3);
    expect(trainerScorePath([], 120, 30)).toBe("");
  });
});

describe("the round of the trainer", () => {
  it("lasts thirty seconds when it is timed", () => {
    expect(TRAINER_DURATION).toBe(30_000);
  });
});
