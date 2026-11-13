import { describe, expect, it } from "vitest";
import { createInitialState, simulateShot } from "../src";

/**
 * The parity vectors for the opening shot. The Lua server resolves the same
 * shot to the same positions, so a client animation matches the server
 * result exactly.
 */
const REFERENCE = [
  { id: "queen", x: 0.713965, y: 0.273371 },
  { id: "w1", x: 0.443125, y: 0.25948 },
  { id: "b1", x: 0.469462, y: 0.464569 },
  { id: "w2", x: 0.338996, y: 0.7475 },
  { id: "b2", x: 0.265515, y: 0.315526 },
  { id: "w3", x: 0.929379, y: 0.377471 },
  { id: "b3", x: 0.559062, y: 0.375093 },
  { id: "w4", x: 0.632513, y: 0.515642 },
  { id: "b4", x: 0.301612, y: 0.596193 },
  { id: "w5", x: 0.200215, y: 0.65545 },
  { id: "b5", x: 0.16306, y: 0.390473 },
  { id: "w6", x: 0.49885, y: 0.20732 },
  { id: "b6", x: 0.051941, y: 0.331563 },
  { id: "w7", x: 0.828435, y: 0.38519 },
  { id: "b7", x: 0.607566, y: 0.374 },
  { id: "w8", x: 0.733676, y: 0.075445 },
  { id: "b8", x: 0.846186, y: 0.568947 },
  { id: "w9", x: 0.674797, y: 0.60575 },
  { id: "b9", x: 0.576525, y: 0.577042 },
];

describe("carrom parity vectors", () => {
  it("resolves the opening shot the same way the server does", () => {
    const state = createInitialState();
    const result = simulateShot(
      state,
      { position: 0.5, angle: -Math.PI / 2, power: 0.8 },
      { frames: false },
    );

    expect(result.state.discs).toHaveLength(REFERENCE.length);
    for (const expected of REFERENCE) {
      const disc = result.state.discs.find(
        (candidate) => candidate.id === expected.id,
      );
      expect(disc, expected.id).toBeDefined();
      expect(disc!.x).toBeCloseTo(expected.x, 5);
      expect(disc!.y).toBeCloseTo(expected.y, 5);
      expect(disc!.pocketed).toBe(false);
    }
    expect(result.state.turn).toBe("black");
    expect(result.state.scores.white).toBe(0);
    expect(result.state.scores.black).toBe(0);
    expect(result.outcome.foul).toBe(false);
    expect(result.duration).toBeCloseTo(3.25, 2);
  });
});
