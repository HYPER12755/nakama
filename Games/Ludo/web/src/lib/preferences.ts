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

/** Rule presets a player can pick before a race. */
export const GAME_MODES = [
  { id: "classic", label: "Classic", hint: "Standard rules, safe stars and walls" },
  { id: "safe", label: "Safe play", hint: "Stars and starts only, no walls" },
  { id: "swift", label: "Swift", hint: "Overshoot finishes, no six penalty" },
  { id: "custom", label: "Custom", hint: "Use your own rule switches" },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

export const MODE_RULES: Record<Exclude<GameModeId, "custom">, Partial<import("@moongames/ludo-core").LudoRules>> = {
  classic: {
    safeSquares: true, blocks: true, sixExtra: true,
    captureExtra: true, exactFinish: true, threeSixesFoul: true,
  },
  safe: {
    safeSquares: true, blocks: false, sixExtra: true,
    captureExtra: false, exactFinish: true, threeSixesFoul: true,
  },
  swift: {
    safeSquares: true, blocks: false, sixExtra: true,
    captureExtra: true, exactFinish: false, threeSixesFoul: false,
  },
};

/** Turn clocks offered on a table, in seconds. Zero means no clock. */
export const TURN_CLOCKS = [0, 15, 30, 60] as const;

export function audibleVolume(preferences: GamePreferences, base: number): number {
  if (!preferences.soundEnabled) return 0;
  return Math.max(0, Math.min(1, base * preferences.soundVolume));
}
