import { describe, expect, it } from "vitest";
import {
  chooseAiShot,
  createInitialState,
  simulateShot,
  type CarromState,
} from "../src";

describe("carrom matches", () => {
  it("finishes an ai match with a winner and no deadlock", () => {
    let state: CarromState = createInitialState();
    let shots = 0;
    while (state.status === "aiming" && shots < 60) {
      const shot = chooseAiShot(state, { difficulty: "easy" });
      state = simulateShot(state, shot, { frames: false }).state;
      shots += 1;
    }
    expect(state.status).toBe("finished");
    expect(state.winner).not.toBeNull();
    expect(shots).toBeLessThan(60);
  });
});
