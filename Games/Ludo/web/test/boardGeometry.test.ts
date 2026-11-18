import { describe, expect, it } from "vitest";
import { SAFE_SQUARES, START_INDEX, TRACK_LENGTH } from "@moongames/ludo-core";
import { GRID_SIZE, HOME_COLUMN, TRACK, tokenPoint, trackPoint } from "../src/lib/boardGeometry";

describe("the hand-drawn Ludo board", () => {
  it("has 52 distinct track squares on a 15 by 15 grid", () => {
    expect(TRACK_LENGTH).toBe(52);
    expect(TRACK).toHaveLength(52);
    expect(new Set(TRACK.map((point) => point.join(","))).size).toBe(52);
    for (const [column, row] of TRACK) {
      expect(column).toBeGreaterThanOrEqual(0);
      expect(column).toBeLessThan(GRID_SIZE);
      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(GRID_SIZE);
    }
  });

  it("spaces the four colour entries 13 squares apart", () => {
    expect(trackPoint(START_INDEX.red)).toEqual([1, 6]);
    expect(trackPoint(START_INDEX.green)).toEqual([8, 1]);
    expect(trackPoint(START_INDEX.yellow)).toEqual([13, 8]);
    expect(trackPoint(START_INDEX.blue)).toEqual([6, 13]);
    for (const index of [0, 13, 26, 39]) {
      expect(trackPoint(index + 13)).toEqual(trackPoint(index + 52 + 13));
    }
  });

  it("walks a closed loop with no square teleporting across the board", () => {
    for (let index = 0; index < TRACK.length; index += 1) {
      const from = TRACK[index]!;
      const to = TRACK[(index + 1) % TRACK.length]!;
      expect(Math.abs(from[0] - to[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(from[1] - to[1])).toBeLessThanOrEqual(1);
      expect(from[0] === to[0] && from[1] === to[1]).toBe(false);
    }
  });

  it("places each entry on the arm beside its own yard", () => {
    const entry = {
      red: trackPoint(START_INDEX.red),
      green: trackPoint(START_INDEX.green),
      yellow: trackPoint(START_INDEX.yellow),
      blue: trackPoint(START_INDEX.blue),
    };
    expect(entry.red![0]).toBeLessThan(6);
    expect(entry.red![1]).toBeGreaterThan(5);
    expect(entry.green![0]).toBeGreaterThanOrEqual(8);
    expect(entry.green![1]).toBeLessThan(6);
    expect(entry.yellow![0]).toBeGreaterThanOrEqual(8);
    expect(entry.yellow![1]).toBeGreaterThanOrEqual(8);
    expect(entry.blue![0]).toBeLessThanOrEqual(6);
    expect(entry.blue![1]).toBeGreaterThan(8);
  });

  it("marks the same squares safe as the rules core", () => {
    expect(SAFE_SQUARES).toEqual([0, 8, 13, 21, 26, 34, 39, 47]);
  });

  it("routes each colour into its own home column", () => {
    for (const color of ["red", "green", "yellow", "blue"] as const) {
      expect(HOME_COLUMN[color]).toHaveLength(6);
      const entry = tokenPoint(color, 0, 0);
      expect(entry).toEqual(trackPoint(START_INDEX[color]));
      expect(tokenPoint(color, 51, 0)).toEqual(HOME_COLUMN[color][0]);
      expect(tokenPoint(color, 56, 0)).toEqual([7, 7]);
    }
  });

  it("gives idle tokens four separate yard spots", () => {
    const spots = [0, 1, 2, 3].map((token) => tokenPoint("red", -1, token).join(","));
    expect(new Set(spots).size).toBe(4);
  });
});
