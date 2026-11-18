import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { ART_GROUPS, ART_TOTAL, artFiles } from "../src/lib/artCatalog.generated";

describe("the real game artwork", () => {
  it("catalogs every asset family", () => {
    expect(ART_GROUPS.map((group) => group.id)).toEqual([
      "boards", "sliders", "strikers", "pucks", "trails", "pockets", "shine", "frames", "buff",
    ]);
    expect(ART_TOTAL).toBeGreaterThan(1000);
  });

  it("lists files that actually exist on disk", () => {
    for (const group of ART_GROUPS) {
      expect(group.files.length).toBeGreaterThan(0);
      expect(artFiles(group.id)).toEqual(group.files);
    }
    const root = new URL("../public/", import.meta.url);
    for (const group of ART_GROUPS) {
      for (const file of group.files.slice(0, 5)) {
        expect(existsSync(new URL(file.replace(/^art\//, ""), new URL("art/", root)))).toBe(true);
      }
    }
  });
});
