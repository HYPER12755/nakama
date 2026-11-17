import { describe, expect, it } from "vitest";
import { mayShowEngineArrow } from "../src/lib/engine/arrow";

const base = {
  analysisOn: true,
  allowed: true,
  error: null,
  mode: "online" as const,
  turn: "w" as const,
  myColor: "w" as const,
  humanColor: "w" as const,
  bestMove: "e2e4",
};

describe("when the engine arrow is shown", () => {
  it("is shown on the player's turn online", () => {
    expect(mayShowEngineArrow(base)).toBe(true);
  });

  it("is hidden on the opponent's turn online", () => {
    expect(mayShowEngineArrow({ ...base, turn: "b" })).toBe(false);
  });

  it("is hidden when the player's colour is not known yet", () => {
    expect(mayShowEngineArrow({ ...base, myColor: null })).toBe(false);
  });

  it("is hidden when the engine is off, not allowed or in error", () => {
    expect(mayShowEngineArrow({ ...base, analysisOn: false })).toBe(false);
    expect(mayShowEngineArrow({ ...base, allowed: false })).toBe(false);
    expect(mayShowEngineArrow({ ...base, error: "no engine" })).toBe(false);
  });

  it("is hidden without a real move", () => {
    expect(mayShowEngineArrow({ ...base, bestMove: undefined })).toBe(false);
    expect(mayShowEngineArrow({ ...base, bestMove: "e2" })).toBe(false);
  });

  it("follows the human side in a game against the computer", () => {
    expect(
      mayShowEngineArrow({
        ...base,
        mode: "ai",
        humanColor: "b",
        turn: "b",
      }),
    ).toBe(true);
    expect(
      mayShowEngineArrow({
        ...base,
        mode: "ai",
        humanColor: "b",
        turn: "w",
      }),
    ).toBe(false);
  });

  it("is always shown in a local game", () => {
    expect(mayShowEngineArrow({ ...base, mode: "local", turn: "b" })).toBe(true);
  });
});
