import { describe, expect, it } from "vitest";
import { boardAt, readReplay, type ReplayData } from "../src/lib/replay";

const data: ReplayData = {
  variant: "classic",
  teams: false,
  seats: ["white", "black"],
  shots: [{ position: 0.5, angle: -Math.PI / 2, power: 0.8 }],
};

describe("replaying a finished table", () => {
  it("reads the replay data out of a history record", () => {
    expect(readReplay({ replay: data })).toEqual(data);
    expect(readReplay({})).toBeNull();
    expect(readReplay({ replay: { shots: [] } })).toBeNull();
  });

  it("rebuilds the board at each step", () => {
    const first = boardAt(data, 0);
    expect(first?.discs).toHaveLength(19);
    expect(first?.shotNumber).toBe(1);
    expect(first?.turn).toBe("black");
  });

  it("holds the last position after the last shot", () => {
    const last = boardAt(data, 9);
    expect(last?.shotNumber).toBe(1);
  });

  it("refuses a record without enough seats", () => {
    expect(boardAt({ ...data, seats: ["white"] }, 0)).toBeNull();
  });
});
