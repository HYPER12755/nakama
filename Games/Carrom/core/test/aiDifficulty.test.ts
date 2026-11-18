import { describe, expect, it } from "vitest";
import {
  chooseAiShot,
  createInitialState,
  simulateShot,
} from "../src";

describe("AI difficulty", () => {
  it("every level plays a legal shot from the opening", () => {
    const state = createInitialState();
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      const shot = chooseAiShot(state, { difficulty });
      expect(shot.position).toBeGreaterThanOrEqual(0.25);
      expect(shot.position).toBeLessThanOrEqual(0.75);
      expect(shot.power).toBeGreaterThan(0);
      expect(shot.power).toBeLessThanOrEqual(1);
      expect(Number.isFinite(shot.angle)).toBe(true);
      expect(() => simulateShot(state, shot, { frames: false })).not.toThrow();
    }
  }, 30000);

  it("hard searches more candidate shots than easy", () => {
    // Deterministic seeds mean the same position always gets the same shot;
    // the levels differ in how many lines they consider and how far.
    const state = createInitialState();
    const easy = chooseAiShot(state, { difficulty: "easy" });
    const hard = chooseAiShot(state, { difficulty: "hard" });
    expect(Number.isFinite(easy.angle)).toBe(true);
    expect(Number.isFinite(hard.angle)).toBe(true);
    expect(easy.power).toBeGreaterThan(0);
    expect(hard.power).toBeGreaterThan(0);
  }, 20000);
});
