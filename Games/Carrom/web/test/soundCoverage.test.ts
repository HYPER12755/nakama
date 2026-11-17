import { describe, expect, it } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import {
  CARROM_POOL_MUSIC,
  MUSIC_FILES,
  SOUND_CATALOGS,
} from "../src/lib/soundCatalog";

describe("every recorded sound is used", () => {
  const sets = Object.keys(SOUND_CATALOGS);

  for (const set of sets) {
    it(`${set} references every file in its folder`, () => {
      const referenced = new Set(
        Object.values(SOUND_CATALOGS[set]!).flat(),
      );
      for (const music of MUSIC_FILES[set] ?? []) {
        referenced.add(music);
      }
      const dir = new URL(`../public/sounds/${set}/`, import.meta.url);
      const files = readdirSync(dir)
        .filter((name) => name.endsWith(".mp3") || name.endsWith(".ogg"))
        .map((name) => name.replace(/\.(mp3|ogg)$/, ""));
      const unused = files.filter((file) => !referenced.has(file));
      expect(unused, `unreferenced sounds in ${set}`).toEqual([]);
    });
  }

  it("the music files are real", () => {
    expect(CARROM_POOL_MUSIC.length).toBeGreaterThan(0);
    for (const file of CARROM_POOL_MUSIC) {
      expect(
        existsSync(
          new URL(`../public/sounds/carrompool/${file}.mp3`, import.meta.url),
        ),
      ).toBe(true);
    }
  });
});
