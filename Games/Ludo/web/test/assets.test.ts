import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_THEMES, DICE_SETS, SOUND_SETS, TOKEN_SETS } from "../src/lib/preferences";

const root = new URL("../public/", import.meta.url);

describe("Ludo's own art and sound", () => {
  it("ships the supplied board and every token set in all four colours", () => {
    expect(existsSync(new URL("boards/ludo-classic.jpg", root))).toBe(true);
    expect(existsSync(new URL("boards/ludo-ornaments.svg", root))).toBe(true);
    for (const set of TOKEN_SETS) {
      if (set.kind === "copied") {
        for (let token = 1; token <= 4; token += 1) {
          expect(existsSync(new URL(`tokens-copied/${set.id}/token-${token}.png`, root)), `${set.id}-${token}`).toBe(true);
        }
      } else {
        for (const color of ["red", "green", "yellow", "blue"]) {
          expect(existsSync(new URL(`tokens/${set.id}-${color}.svg`, root)), `${set.id}-${color}`).toBe(true);
        }
      }
    }
  });

  it("ships every selectable dice texture", () => {
    for (const set of DICE_SETS) {
      if (set.texture) expect(existsSync(new URL(set.texture, root)), set.id).toBe(true);
    }
  });

  it("ships the recorded sounds and their credits", () => {
    expect(existsSync(new URL("sounds/LICENSE.txt", root))).toBe(true);
    expect(SOUND_SETS.length).toBeGreaterThan(0);
    for (const file of [
      "dice-roll.mp3", "dice-roll.ogg", "move.ogg", "capture.ogg",
      "home.ogg", "foul.ogg", "turn.ogg", "start.ogg", "win.ogg",
    ]) {
      expect(existsSync(new URL(`sounds/ludo/${file}`, root)), file).toBe(true);
    }
  });

  it("has board themes the preferences panel can offer", () => {
    expect(BOARD_THEMES.map((theme) => theme.id)).toEqual(["classic"]);
    for (const set of TOKEN_SETS) {
      expect(TOKEN_SETS.filter((entry) => entry.id === set.id)).toHaveLength(1);
    }
  });
});
