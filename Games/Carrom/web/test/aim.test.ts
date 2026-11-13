import { describe, expect, it } from "vitest";
import type { CarromFrame } from "@moongames/carrom-core";
import {
  aimFromPoint,
  powerFromDistance,
  raycastBoard,
  sampleFrame,
  strikerPoint,
} from "../src/lib/aim";

describe("aim helpers", () => {
  it("maps drag distance to a bounded power", () => {
    expect(powerFromDistance(0)).toBeCloseTo(0.08);
    expect(powerFromDistance(0.19)).toBeCloseTo(0.5);
    expect(powerFromDistance(2)).toBe(1);
  });

  it("points from the striker toward the drag position", () => {
    const aim = aimFromPoint(0.5, 0.8, { x: 0.5, y: 0.4 });
    expect(aim.angle).toBeCloseTo(-Math.PI / 2);
    expect(aim.power).toBe(1);
  });

  it("uses the correct baseline for each player", () => {
    expect(strikerPoint("white", 0.4).y).toBeCloseTo(0.805);
    expect(strikerPoint("black", 0.6).y).toBeCloseTo(0.195);
  });

  it("interpolates animation frames", () => {
    const frames: CarromFrame[] = [
      {
        time: 0,
        discs: [
          { id: "w1", kind: "white", x: 0.1, y: 0.2, pocketed: false },
        ],
        striker: { x: 0.5, y: 0.8, pocketed: false },
      },
      {
        time: 1,
        discs: [
          { id: "w1", kind: "white", x: 0.3, y: 0.4, pocketed: true },
        ],
        striker: { x: 0.7, y: 0.6, pocketed: false },
      },
    ];
    const middle = sampleFrame(frames, 0.5);
    expect(middle?.discs[0]?.x).toBeCloseTo(0.2);
    expect(middle?.discs[0]?.y).toBeCloseTo(0.3);
    expect(middle?.discs[0]?.pocketed).toBe(true);
    expect(middle?.striker.x).toBeCloseTo(0.6);
    expect(middle?.striker.y).toBeCloseTo(0.7);
    expect(sampleFrame(frames, 2)).toBe(frames[1]);
  });

  it("finds the first wall or disc along an aim line", () => {
    const wall = raycastBoard(
      { x: 0.5, y: 0.8 },
      -Math.PI / 2,
      [],
    );
    expect(wall.kind).toBe("wall");
    expect(wall.point.y).toBeCloseTo(0.03);

    const disc = raycastBoard(
      { x: 0.5, y: 0.8 },
      -Math.PI / 2,
      [{ x: 0.5, y: 0.4, pocketed: false }],
    );
    expect(disc.kind).toBe("disc");
    expect(disc.distance).toBeLessThan(wall.distance);
  });
});
