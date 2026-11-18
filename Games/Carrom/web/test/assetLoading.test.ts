import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { SOUND_CATALOGS, MUSIC_FILES, soundsFor, type BoardEvent } from "../src/lib/soundCatalog";
import { COSMETIC_GROUPS } from "../src/lib/cosmetics";
import { ART_GROUPS } from "../src/lib/artCatalog.generated";

const PUBLIC = new URL("../public/", import.meta.url).pathname;

function exists(relative: string): boolean {
  try {
    return statSync(join(PUBLIC, relative)).isFile();
  } catch {
    return false;
  }
}

describe("every cosmetic the picker offers can be loaded", () => {
  it("every ripped art file exists and is a real image", () => {
    for (const group of ART_GROUPS) {
      for (const file of group.files) {
        expect(exists(file), `${file} is missing`).toBe(true);
        const bytes = readFileSync(join(PUBLIC, file));
        const png = bytes.toString("ascii", 1, 4) === "PNG";
        const webp =
          bytes.toString("ascii", 0, 4) === "RIFF" &&
          bytes.toString("ascii", 8, 12) === "WEBP";
        expect(png || webp, `${file} is not an image`).toBe(true);
        expect(bytes.length, `${file} is empty`).toBeGreaterThan(100);
      }
    }
  }, 30000);

  it("every built-in cosmetic resolves", () => {
    for (const group of COSMETIC_GROUPS) {
      expect(group.options.length).toBeGreaterThan(0);
      for (const option of group.options) {
        if (option.id.startsWith("builtin:")) {
          expect(option.label.length).toBeGreaterThan(0);
        } else {
          expect(exists(option.id), `${option.id} is missing`).toBe(true);
        }
      }
    }
  });
});

describe("every sound the panel can play exists", () => {
  const events = Object.keys(SOUND_CATALOGS.standard) as BoardEvent[];
  for (const [set, catalog] of Object.entries(SOUND_CATALOGS)) {
    it(`${set} resolves all of its event files`, () => {
      for (const event of events) {
        const files = catalog[event] ?? [];
        for (const file of files) {
          const path = `sounds/${set}/${file}.mp3`;
          expect(exists(path), `${path} is missing`).toBe(true);
          const bytes = readFileSync(join(PUBLIC, path));
          expect(bytes.length, `${path} is empty`).toBeGreaterThan(100);
        }
      }
      for (const music of MUSIC_FILES[set] ?? []) {
        expect(exists(`sounds/${set}/${music}.mp3`)).toBe(true);
      }
    });
  }

  it("playing a sound resolves a real file in every set", () => {
    for (const set of Object.keys(SOUND_CATALOGS)) {
      for (const event of ["strike", "puck", "pot", "queenCover", "foul"] as BoardEvent[]) {
        const files = soundsFor(set, event);
        expect(files.length, `${set}/${event}`).toBeGreaterThan(0);
      }
    }
  });
});
