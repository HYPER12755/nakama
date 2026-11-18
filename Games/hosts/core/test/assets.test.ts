import { describe, expect, it } from "vitest";
import { safeAssetPath } from "@moongames/game-sdk";
import { isHostToGameMessage } from "@moongames/game-sdk";

describe("bundle asset paths", () => {
  it("allows a relative path inside the bundle", () => {
    expect(safeAssetPath("sounds/standard/strike1.mp3")).toBe(
      "sounds/standard/strike1.mp3",
    );
  });

  it("refuses paths that could leave the bundle", () => {
    for (const path of [
      "../secret",
      "/etc/passwd",
      "http://example.com/a.png",
      "C:\\secret",
      "a/../b",
      "a//b",
      "a\0b",
      "",
    ]) {
      expect(safeAssetPath(path)).toBeNull();
    }
  });

  it("accepts an asset response from a host", () => {
    expect(
      isHostToGameMessage({
        type: "assetResponse",
        requestId: "asset-1",
        ok: true,
        base64: "AA==",
      }),
    ).toBe(true);
  });
});
