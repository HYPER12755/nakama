/** The choices Ludo offers in the shared preferences panel. */

import type { GamePreferences } from "@moongames/game-ui";

export interface TokenSet {
  id: string;
  label: string;
  color: string;
}

export const TOKEN_SETS: TokenSet[] = [
  { id: "marble", label: "Polished marble", color: "#ef5b5b" },
  { id: "brass", label: "Engraved brass", color: "#d98a66" },
  { id: "onyx", label: "Onyx glow", color: "#5b9cff" },
];

export const BOARD_THEMES = [
  { id: "classic", label: "Classic table" },
  { id: "midnight", label: "Midnight table" },
  { id: "warm", label: "Warm table" },
];

export const SOUND_SETS = [
  { id: "ludo", label: "Recorded table" },
  { id: "soft", label: "Soft table" },
];

export const LUDO_FEATURES = {
  replay: true,
} as const;

export function audibleVolume(preferences: GamePreferences, base: number): number {
  if (!preferences.soundEnabled) return 0;
  return Math.max(0, Math.min(1, base * preferences.soundVolume));
}
