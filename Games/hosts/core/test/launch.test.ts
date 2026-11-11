import { describe, expect, it } from "vitest";
import { createGameLaunchContext } from "@moongames/game-sdk";

describe("native launch context", () => {
  it("normalizes and decodes a launch query", () => {
    expect(
      createGameLaunchContext("?match=abc%20123&spectate=1&spectate=0"),
    ).toEqual({
      query: "match=abc%20123&spectate=1&spectate=0",
      params: { match: "abc 123", spectate: "0" },
    });
    expect(createGameLaunchContext("#match=abc")).toEqual({
      query: "match=abc",
      params: { match: "abc" },
    });
  });

  it("ignores empty and oversized queries", () => {
    expect(createGameLaunchContext(undefined)).toBeUndefined();
    expect(createGameLaunchContext("")).toBeUndefined();
    expect(createGameLaunchContext("?")).toBeUndefined();
    expect(createGameLaunchContext("x".repeat(4097))).toBeUndefined();
  });
});
