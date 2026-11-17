import { describe, expect, it } from "vitest";
import {
  cpWinningChances,
  evalWinningChances,
  povChances,
  winningPercent,
} from "../src/lib/engine/winningChances";
import {
  engineVisible,
  readEngineOutput,
} from "../src/lib/engine/externalEngine";
import {
  fillPvLines,
  movesToSan,
} from "../src/hooks/useEngineAnalysis";

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/**
 * The engine that runs on the server, and what it says.
 */

describe("the winning chances", () => {
  it("are even when the game is even", () => {
    expect(cpWinningChances(0)).toBeCloseTo(0, 5);
    expect(winningPercent(cpWinningChances(0))).toBeCloseTo(0.5, 5);
  });

  it("rise when the number rises", () => {
    expect(cpWinningChances(100)).toBeGreaterThan(cpWinningChances(0));
    expect(cpWinningChances(-100)).toBeLessThan(cpWinningChances(0));
  });

  it("are nearly certain when the game is a mate", () => {
    expect(evalWinningChances({ mate: 1 })).toBeGreaterThan(0.95);
    expect(evalWinningChances({ mate: -1 })).toBeLessThan(-0.95);
  });

  it("are turned about for the other side", () => {
    const evaluation = { cp: 120 };
    expect(povChances("w", evaluation)).toBeGreaterThan(0);
    expect(povChances("b", evaluation)).toBeLessThan(0);
  });
});

describe("the answer of the engine", () => {
  it("is read into an evaluation", () => {
    const evaluation = readEngineOutput(
      {
        time: 1200,
        depth: 14,
        nodes: 42000,
        pvs: [{ depth: 14, cp: 35, moves: ["g1f3", "b8c6"] }],
      },
      false,
    );

    expect(evaluation?.cp).toBe(35);
    expect(evaluation?.depth).toBe(14);
    expect(evaluation?.nodes).toBe(42000);
    expect(evaluation?.moves).toEqual(["g1f3", "b8c6"]);
  });

  it("is turned about when it is the other side's turn", () => {
    const evaluation = readEngineOutput(
      {
        depth: 10,
        nodes: 100,
        pvs: [{ depth: 10, cp: 35, moves: ["b8c6"] }],
      },
      true,
    );

    expect(evaluation?.cp).toBe(-35);
  });

  it("is nothing when the engine has not said anything yet", () => {
    expect(readEngineOutput({ keepalive: true }, false)).toBeNull();
    expect(readEngineOutput({ depth: 1 }, false)).toBeNull();
  });
});

describe("whether the engine is shown", () => {
  it("is shown in the games against yourself and against the computer", () => {
    expect(engineVisible("local", false)).toBe(true);
    expect(engineVisible("ai", false)).toBe(true);
  });

  it("is hidden in a game against a person, unless the server says so", () => {
    expect(engineVisible("online", false)).toBe(false);
    expect(engineVisible("online", true)).toBe(true);
  });
});

describe("the moves of the engine", () => {
  it("are written the way a player writes them", () => {
    expect(movesToSan(START_FEN, ["e2e4", "e7e5", "g1f3"])).toEqual([
      "e4",
      "e5",
      "Nf3",
    ]);
  });

  it("are nothing when the moves cannot be played", () => {
    expect(movesToSan(START_FEN, ["e2e5"])).toEqual([]);
  });

  it("are read from the position after the moves already played", () => {
    // After e4 e5, the engine's line begins with Nf3. Replayed from the
    // start, that move is not legal yet; played after e4 e5, it is.
    expect(
      movesToSan(START_FEN, ["g1f3", "b8c6"], ["e2e4", "e7e5"]),
    ).toEqual(["Nf3", "Nc6"]);
  });
});

describe("holding the place of every engine line", () => {
  const line = {
    depth: 12,
    score: { cp: 25 },
    san: ["e4"],
    uci: ["e2e4"],
  };

  it("keeps all the rows when only the first line has arrived", () => {
    const lines = fillPvLines([line], 3);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual(line);
    expect(lines[1]).toEqual({ depth: 0, score: {}, san: [], uci: [] });
    expect(lines[2]).toEqual({ depth: 0, score: {}, san: [], uci: [] });
  });

  it("fills the rows as the lines arrive", () => {
    const lines = fillPvLines([line, line], 3);
    expect(lines).toHaveLength(3);
    expect(lines[0].san).toEqual(["e4"]);
    expect(lines[1].san).toEqual(["e4"]);
    expect(lines[2].san).toEqual([]);
  });

  it("holds no rows when the engine was not asked for any", () => {
    expect(fillPvLines([], 0)).toEqual([]);
  });
});
