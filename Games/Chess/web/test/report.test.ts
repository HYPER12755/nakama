import { describe, expect, it } from "vitest";
import { glyphForLoss, GLYPH_THRESHOLDS } from "../src/lib/engine/report";

/**
 * The marks the report puts on the moves, which are the marks lichess puts
 * on them.
 */

describe("the mark on a move", () => {
  it("is the biggest one the move earns", () => {
    // A move that gave away a quarter of the chances is a mistake.
    expect(glyphForLoss(0.25)).toBe("?");
    // A move that gave away half of them is a blunder.
    expect(glyphForLoss(0.5)).toBe("??");
    // A small loss is only worth noticing.
    expect(glyphForLoss(0.15)).toBe("?! ");
  });

  it("is nothing when the move gave nothing away", () => {
    expect(glyphForLoss(0)).toBeNull();
    expect(glyphForLoss(0.05)).toBeNull();
    expect(glyphForLoss(0.1)).toBeNull();
  });

  it("uses the lines lichess uses", () => {
    expect(GLYPH_THRESHOLDS).toEqual([
      { glyph: "??", loss: 0.3 },
      { glyph: "?", loss: 0.2 },
      { glyph: "?! ", loss: 0.1 },
    ]);
  });
});
