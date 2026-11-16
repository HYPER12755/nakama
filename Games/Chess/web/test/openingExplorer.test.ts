import { describe, expect, it } from "vitest";
import {
  pathPairs,
  readExplorerResult,
  resultText,
} from "../src/lib/openingExplorer";

/**
 * The opening explorer: the answer of the server, and the way it is shown.
 */

describe("the answer of the explorer", () => {
  it("is read as it is written", () => {
    const result = readExplorerResult(
      {
        ok: true,
        path: ["e4", "e5"],
        total: 12,
        moves: [
          { san: "Nf3", count: 8 },
          { san: "Bc4", count: 4 },
        ],
        games: [
          {
            matchId: "abc",
            white: "Alice",
            black: "Bob",
            result: "1-0",
            mode: "quick",
            moves: 30,
            endedAt: 1700000000000,
          },
        ],
      },
      [],
    );

    expect(result.ok).toBe(true);
    expect(result.total).toBe(12);
    expect(result.moves).toEqual([
      { san: "Nf3", count: 8 },
      { san: "Bc4", count: 4 },
    ]);
    expect(result.games[0].white).toBe("Alice");
    expect(result.games[0].moves).toBe(30);
  });

  it("keeps the path that was asked for when the server does not give one", () => {
    const result = readExplorerResult({ ok: true, total: 0 }, ["e4"]);
    expect(result.path).toEqual(["e4"]);
    expect(result.moves).toEqual([]);
    expect(result.games).toEqual([]);
  });

  it("says what went wrong", () => {
    const result = readExplorerResult(
      {
        ok: false,
        error: { code: "unknown_opening", message: "no game here played Zz" },
      },
      ["Zz"],
    );

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("unknown_opening");
    expect(result.error?.message).toBe("no game here played Zz");
  });

  it("does not trust an answer that is not written properly", () => {
    const result = readExplorerResult(
      { ok: true, moves: ["e4", null, { san: "Nf3", count: 2 }], games: [7] },
      [],
    );

    expect(result.ok).toBe(true);
    expect(result.moves).toEqual([{ san: "Nf3", count: 2 }]);
    expect(result.games).toEqual([]);
  });

  it("has a message when the answer is nothing at all", () => {
    const result = readExplorerResult(null, []);
    expect(result.ok).toBe(false);
    expect(result.error?.message.length).toBeGreaterThan(0);
  });
});

describe("the path of an opening", () => {
  it("is shown in pairs, as a game is shown", () => {
    expect(pathPairs(["e4", "e5", "Nf3"])).toEqual([
      [1, "e4", "e5"],
      [2, "Nf3", undefined],
    ]);
  });

  it("is empty at the start", () => {
    expect(pathPairs([])).toEqual([]);
  });
});

describe("how a result is written", () => {
  it("is said in words", () => {
    expect(resultText("1-0")).toBe("White won");
    expect(resultText("0-1")).toBe("Black won");
    expect(resultText("1/2-1/2")).toBe("Draw");
    expect(resultText("*")).toBe("Finished");
  });
});
