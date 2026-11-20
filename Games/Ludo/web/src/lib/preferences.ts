/** The choices Ludo offers in the shared preferences panel. */

import type { GamePreferences } from "@moongames/game-ui";

export interface TokenSet {
  id: string;
  label: string;
  color: string;
  kind?: "svg" | "copied";
}

/** Each set has four token designs, one per seating colour. */
export const TOKEN_SETS: TokenSet[] = [
  { id: "regalia", label: "Regalia", color: "#c8434a", kind: "svg" },
  { id: "celestial", label: "Celestial", color: "#5b9cff", kind: "svg" },
  { id: "lk1", label: "King · Blue", color: "#30b6ed", kind: "copied" },
  { id: "lk2", label: "King · Wood", color: "#a86b35", kind: "copied" },
  { id: "lk3", label: "King · Stone", color: "#88939c", kind: "copied" },
  { id: "lk4", label: "King · Gold", color: "#c99a2e", kind: "copied" },
  { id: "lk5", label: "King · Ivory", color: "#eee2c8", kind: "copied" },
  { id: "lk6", label: "King · Jade", color: "#45a777", kind: "copied" },
  { id: "lk7", label: "King · Ruby", color: "#c8434a", kind: "copied" },
];

export interface DiceSet {
  id: string;
  label: string;
  texture?: string;
  color?: string;
}

export const DICE_SETS: DiceSet[] = [
  { id: "classic", label: "Classic die" },
  { id: "lk1", label: "King · Wood", texture: "dice/bpacksnl1/texture.png", color: "#b77a3e" },
  { id: "lk2", label: "King · Dark wood", texture: "dice/bpacksnl2/texture.png", color: "#7c4d2a" },
  { id: "lk3", label: "King · Sand", texture: "dice/bpacksnl3/texture.png", color: "#c7a26d" },
  { id: "lk4", label: "King · Clay", texture: "dice/bpacksnl4/texture.png", color: "#a4563c" },
  { id: "lk5", label: "King · Slate", texture: "dice/bpacksnl5/texture.png", color: "#66727c" },
  { id: "lk6", label: "King · Cream", texture: "dice/bpacksnl6/texture.png", color: "#d8c49b" },
  { id: "lk7", label: "King · Red wood", texture: "dice/bpacksnl7/texture.png", color: "#9b4a3a" },
];

/** The supplied board art is the only board; ornaments are an SVG edge layer. */
export const BOARD_THEMES = [
  { id: "classic", label: "Classic table", texture: "boards/ludo-classic.jpg" },
];

/** Pace of computer turns and token hops. */
export const TABLE_SPEEDS = [
  { id: "relaxed", label: "Relaxed", aiDelay: 1150, stepMs: 180 },
  { id: "normal", label: "Normal", aiDelay: 850, stepMs: 135 },
  { id: "quick", label: "Quick", aiDelay: 560, stepMs: 90 },
] as const;

export type TableSpeedId = (typeof TABLE_SPEEDS)[number]["id"];

export const SOUND_SETS = [
  { id: "ludo", label: "Recorded table" },
];

export const LUDO_FEATURES = {
  replay: true,
  showLegalMoves: true,
} as const;

/** Rule presets a player can pick before a race. */
export const GAME_MODES = [
  { id: "classic", label: "Classic", hint: "Standard rules, safe stars and walls" },
  { id: "safe", label: "Safe play", hint: "Stars and starts only, no walls" },
  { id: "swift", label: "Swift", hint: "Overshoot finishes, no six penalty" },
  { id: "rush", label: "Rush", hint: "Move again after every legal move" },
  { id: "custom", label: "Custom", hint: "Use your own rule switches" },
] as const;

export type GameModeId = (typeof GAME_MODES)[number]["id"];

export const MODE_RULES: Record<Exclude<GameModeId, "custom">, Partial<import("@moongames/ludo-core").LudoRules>> = {
  classic: {
    safeSquares: true, blocks: true, sixExtra: true,
    captureExtra: true, exactFinish: true, threeSixesFoul: true,
    sixToStart: true, turnOrder: "normal",
  },
  safe: {
    safeSquares: true, blocks: false, sixExtra: true,
    captureExtra: false, exactFinish: true, threeSixesFoul: true,
    sixToStart: true, turnOrder: "normal",
  },
  swift: {
    safeSquares: true, blocks: false, sixExtra: true,
    captureExtra: true, exactFinish: false, threeSixesFoul: false,
    sixToStart: false, turnOrder: "normal", rushMode: false,
  },
  rush: {
    safeSquares: true, blocks: false, sixExtra: true,
    captureExtra: true, exactFinish: false, threeSixesFoul: false,
    sixToStart: false, turnOrder: "normal", rushMode: true,
  },
};

/** How the first turn and the turn order are chosen. */
export const START_MODES = [
  { id: "normal", label: "Normal", hint: "Turns pass in seat order" },
  { id: "reverse", label: "Reverse", hint: "Turns pass back through the seats" },
  { id: "random", label: "Random", hint: "A fresh starting seat each race" },
] as const;

export type StartModeId = (typeof START_MODES)[number]["id"];

/** Turn clocks offered on a table, in seconds. Zero means no clock. */
export const TURN_CLOCKS = [0, 15, 30, 60] as const;

export function audibleVolume(preferences: GamePreferences, base: number): number {
  if (!preferences.soundEnabled) return 0;
  return Math.max(0, Math.min(1, base * preferences.soundVolume));
}
