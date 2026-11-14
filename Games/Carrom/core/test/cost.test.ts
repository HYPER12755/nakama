import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  createInitialState,
  simulateShot,
} from "../src";

/**
 * The cost of a shot. The board runs the simulation on the main thread, so a
 * slow shot must not hold the page still. These numbers are the budget the
 * client plays against.
 */
describe("the cost of a shot", () => {
  it("resolves a shot quickly enough for the main thread", () => {
    const state = createInitialState();
    // The fastest run is the cost of the code. The slowest run also counts
    // whatever else the machine was doing, so it is not a fair measure.
    let elapsed = Number.POSITIVE_INFINITY;
    let duration = 0;
    for (let run = 0; run < 5; run += 1) {
      const started = performance.now();
      const result = simulateShot(
        state,
        { position: 0.5, angle: -Math.PI / 2, power: 0.8 },
        { frames: true },
      );
      elapsed = Math.min(elapsed, performance.now() - started);
      duration = result.duration;
    }
    expect(duration).toBeGreaterThan(0);
    // A shot has to be ready in well under a frame budget of a second, or
    // the table freezes when the striker is released.
    expect(elapsed).toBeLessThan(400);
  });

  it("keeps the frames small enough to replay", () => {
    const state = createInitialState();
    const result = simulateShot(
      state,
      { position: 0.5, angle: -Math.PI / 2, power: 0.8 },
      { frames: true },
    );
    // The frames are the memory and the work of the animation.
    expect(result.frames.length).toBeLessThan(
      Math.ceil(CARROM_BOARD.maxSimulationSeconds * 60) + 2,
    );
  });
});
