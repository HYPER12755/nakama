import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cardsDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../public/cards");

describe("Uno card assets", () => {
  it("ships one SVG per card plus a back in both sets", () => {
    for (const set of ["cards", "cards-neon"]) {
      const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), `../public/${set}`);
      const files = readdirSync(dir).filter((name) => name.endsWith(".svg"));
      expect(files, `${set} count`).toHaveLength(109);
      expect(files, `${set} back`).toContain("card-back.svg");
      expect(files, `${set} number`).toContain("red-0-0.svg");
      expect(files, `${set} action`).toContain("blue-draw2-1.svg");
      expect(files, `${set} wild`).toContain("wild-3.svg");
      expect(files, `${set} wild4`).toContain("wild4-0.svg");
    }
  });

  it("ships a real SVG document for every card", () => {
    const files = readdirSync(cardsDir).filter((name) => name.endsWith(".svg"));
    for (const file of files) {
      const target = path.join(cardsDir, file);
      expect(existsSync(target)).toBe(true);
      const svg = readFileSync(target, "utf8");
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");
    }
  });
});
