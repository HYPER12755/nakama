/**
 * The choices a carrom table offers, built on the preferences every game
 * shares. The panel and the stored values come from the shared game UI kit;
 * this module says which choices apply to a carrom table and how they change
 * the way the table looks and sounds.
 */
import { AnimationSpeed, type GamePreferences } from "@moongames/game-ui";

export interface SoundSet {
  id: string;
  label: string;
}

/** The sound sets are the folders under `public/sounds/`. */
export const SOUND_SETS: SoundSet[] = [
  { id: "standard", label: "Table click" },
  { id: "soft", label: "Soft pads" },
  { id: "bright", label: "Bright carrom" },
];

export function soundSet(id: string): SoundSet {
  return SOUND_SETS.find((set) => set.id === id) ?? SOUND_SETS[0]!;
}

/** The playback scale of a chosen animation speed. */
export function playbackSpeed(speed: AnimationSpeed): number {
  switch (speed) {
    case AnimationSpeed.None:
      return 0;
    case AnimationSpeed.Fast:
      return 0.55;
    case AnimationSpeed.Slow:
      return 1.4;
    default:
      return 1;
  }
}

/** The choices the shared panel should offer at a carrom table. */
export const CARROM_FEATURES = {
  replay: true,
  keyboardMoves: true,
} as const;

/** Apply the volume and enable choice to a base loudness. */
export function audibleVolume(preferences: GamePreferences, base: number): number {
  if (!preferences.soundEnabled) {
    return 0;
  }
  return Math.max(0, Math.min(1, base * preferences.soundVolume));
}
