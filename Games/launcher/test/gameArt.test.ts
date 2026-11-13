import { describe, expect, it } from "vitest";
import { gameMotif, gameMotifs } from "../src/components/gameArt/motifs";
import { monogramInitials, monogramSeed } from "../src/components/gameArt/monogram";

describe("game artwork", () => {
  it("resolves known motif keys", () => {
    expect(gameMotif("chess")).not.toBeNull();
    expect(gameMotif("carrom")).not.toBeNull();
    expect(Object.keys(gameMotifs).length).toBeGreaterThan(0);
  });

  it("falls back for unknown keys so a new game needs no launcher change", () => {
    expect(gameMotif("brand-new-game")).toBeNull();
  });

  it("derives a stable seed and initials from the catalog entry", () => {
    expect(monogramSeed("carrom")).toBe(monogramSeed("carrom"));
    expect(monogramSeed("carrom")).not.toBe(monogramSeed("chess"));
    expect(monogramInitials("Carrom", "carrom")).toBe("CA");
    expect(monogramInitials("Chess", "chess")).toBe("CH");
    expect(monogramInitials("Card Game", "cards")).toBe("CG");
  });
});
