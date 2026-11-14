import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  createInitialState,
  medallionRadii,
  tablePlayers,
} from "../src";

const LOGICAL = 1000;
const INSET = 62;
const PLAY = LOGICAL - INSET * 2;

describe("carrom layout", () => {
  it("keeps every piece inside the board and clear of its neighbours", () => {
    const state = createInitialState();
    const points = state.discs.map((disc) => ({
      id: disc.id,
      x: INSET + disc.x * PLAY,
      y: INSET + disc.y * PLAY,
      r: CARROM_BOARD.discRadius * PLAY,
    }));
    for (const point of points) {
      expect(point.x - point.r).toBeGreaterThanOrEqual(INSET - 0.5);
      expect(point.x + point.r).toBeLessThanOrEqual(INSET + PLAY + 0.5);
      expect(point.y - point.r).toBeGreaterThanOrEqual(INSET - 0.5);
      expect(point.y + point.r).toBeLessThanOrEqual(INSET + PLAY + 0.5);
    }
    for (let a = 0; a < points.length; a += 1) {
      for (let b = a + 1; b < points.length; b += 1) {
        const distance = Math.hypot(
          points[a]!.x - points[b]!.x,
          points[a]!.y - points[b]!.y,
        );
        expect(distance).toBeGreaterThanOrEqual(
          points[a]!.r + points[b]!.r - 0.5,
        );
      }
    }
  });

  it("fits the medallion inside the board for every table size", () => {
    for (const count of [2, 3, 4]) {
      const radii = medallionRadii(count);
      expect(radii.outer * PLAY).toBeLessThan(PLAY / 2);
      const state = createInitialState(tablePlayers(count));
      expect(state.discs).toHaveLength(count * 9 + 1);
    }
  });
});
