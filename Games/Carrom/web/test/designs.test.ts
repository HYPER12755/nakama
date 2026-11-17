import { describe, expect, it } from "vitest";
import {
  BOARD_DESIGNS,
  PIECE_SETS,
  STRIKER_DESIGNS,
  boardDesign,
  pieceSet,
  strikerDesign,
  tableVisuals,
} from "../src/lib/designs";
import {
  audibleVolume,
  playbackSpeed,
  soundSet,
  SOUND_SETS,
} from "../src/lib/preferences";
import {
  AnimationSpeed,
  DEFAULT_PREFERENCES,
} from "@moongames/game-ui";
import { setPlaybackSpeed, shotPlaybackSeconds } from "../src/lib/playback";

describe("the designs of a carrom table", () => {
  it("offers ten boards, ten strikers and ten piece sets", () => {
    expect(BOARD_DESIGNS).toHaveLength(10);
    expect(STRIKER_DESIGNS).toHaveLength(10);
    expect(PIECE_SETS).toHaveLength(10);
  });

  it("gives every design a different id and a label", () => {
    for (const list of [BOARD_DESIGNS, STRIKER_DESIGNS, PIECE_SETS]) {
      expect(new Set(list.map((entry) => entry.id)).size).toBe(list.length);
      for (const entry of list) {
        expect(entry.label.length).toBeGreaterThan(0);
      }
    }
    for (const set of PIECE_SETS) {
      expect(set.pieces).toHaveLength(5);
    }
  });

  it("falls back to a real design for an unknown id", () => {
    expect(boardDesign("missing").id).toBe(BOARD_DESIGNS[0]?.id);
    expect(strikerDesign("missing").id).toBe(STRIKER_DESIGNS[0]?.id);
    expect(pieceSet("missing").id).toBe(PIECE_SETS[0]?.id);
  });

  it("bundles the three chosen designs", () => {
    const visuals = tableVisuals("rosewood", "steel", "neon");
    expect(visuals.board.id).toBe("rosewood");
    expect(visuals.striker.id).toBe("steel");
    expect(visuals.pieces.id).toBe("neon");
  });
});

describe("the looks and sounds a player can choose", () => {
  it("offers real sound sets", () => {
    expect(SOUND_SETS.length).toBeGreaterThanOrEqual(5);
    expect(soundSet("synth").label).toBe("Synth");
    expect(soundSet("soft").label).toBe("Soft pads");
    expect(soundSet("missing").id).toBe("standard");
  });

  it("keeps the three small sets distinct from one another", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { createHash } = require("node:crypto") as typeof import("node:crypto");
    const hash = (set: string, file: string) =>
      createHash("md5")
        .update(readFileSync(new URL(`../public/sounds/${set}/${file}.mp3`, import.meta.url)))
        .digest("hex");
    // The three sets ship genuinely different recordings behind the same
    // event names, so choosing a set changes what the table sounds like.
    for (const file of ["strike1", "pocket1", "turn1", "win1"]) {
      const hashes = ["standard", "soft", "bright"].map((set) => hash(set, file));
      expect(new Set(hashes).size).toBe(3);
    }
  });

  it("maps the shared animation speed to a playback scale", () => {
    expect(playbackSpeed(AnimationSpeed.None)).toBe(0);
    expect(playbackSpeed(AnimationSpeed.Fast)).toBeLessThan(1);
    expect(playbackSpeed(AnimationSpeed.Slow)).toBeGreaterThan(1);
  });

  it("scales the shot playback by the chosen speed", () => {
    const normal = shotPlaybackSeconds(3);
    setPlaybackSpeed(2);
    expect(shotPlaybackSeconds(3)).toBeCloseTo(normal * 2);
    setPlaybackSpeed(0);
    expect(shotPlaybackSeconds(3)).toBe(0);
    setPlaybackSpeed(1);
  });

  it("obeys the volume and the mute switch", () => {
    expect(
      audibleVolume({ ...DEFAULT_PREFERENCES, soundVolume: 0.5 }, 1),
    ).toBeCloseTo(0.5);
    expect(
      audibleVolume({ ...DEFAULT_PREFERENCES, soundEnabled: false }, 1),
    ).toBe(0);
  });
});
