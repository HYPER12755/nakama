import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { ART_GROUPS } from "../src/lib/artCatalog.generated";

describe("every extracted art asset is offered", () => {
  it("catalogs every file in the game art folder", () => {
    const dir = new URL("../public/art/game/", import.meta.url);
    const files = readdirSync(dir)
      .filter((name) => /\.(png|webp)$/.test(name))
      .sort();
    const catalogued = ART_GROUPS.flatMap((group) => group.files)
      .map((file) => file.split("/").pop() ?? file)
      .sort();
    expect(catalogued).toEqual(files);
  });
});
