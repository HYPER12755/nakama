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
  faces?: boolean;
}

export const DICE_SETS: DiceSet[] = [
  { id: "classic", label: "Classic die" },
  { id: "lk1", label: "King · Board 1", texture: "dice/bpacksnl1/texture.png", color: "#b77a3e" },
  { id: "lk2", label: "King · Board 2", texture: "dice/bpacksnl2/texture.png", color: "#b77a3e" },
  { id: "lk3", label: "King · Board 3", texture: "dice/bpacksnl3/texture.png", color: "#b77a3e" },
  { id: "lk4", label: "King · Board 4", texture: "dice/bpacksnl4/texture.png", color: "#b77a3e" },
  { id: "lk5", label: "King · Board 5", texture: "dice/bpacksnl5/texture.png", color: "#b77a3e" },
  { id: "lk6", label: "King · Board 6", texture: "dice/bpacksnl6/texture.png", color: "#b77a3e" },
  { id: "lk7", label: "King · Board 7", texture: "dice/bpacksnl7/texture.png", color: "#b77a3e" },
  { id: "dicepack1_0", label: "APK · Toy", texture: "dice/dicepack1_0/texture.png", faces: true },
  { id: "dicepack1_1", label: "APK · Neon", texture: "dice/dicepack1_1/texture.png", faces: true },
  { id: "dicepack1_2", label: "APK · Marble", texture: "dice/dicepack1_2/texture.png", faces: true },
  { id: "dicepack1_3", label: "APK · Candy", texture: "dice/dicepack1_3/texture.png", faces: true },
  { id: "dicepack1_4", label: "APK · Gold", texture: "dice/dicepack1_4/texture.png", faces: true },
  { id: "dicepack1_5", label: "APK · Spooky", texture: "dice/dicepack1_5/texture.png", faces: true },
  { id: "dicepack2", label: "APK · Royal", texture: "dice/dicepack2/texture.png", faces: true },
  { id: "dicepack3", label: "APK · Nature", texture: "dice/dicepack3/texture.png", faces: true },
  { id: "dicepack4", label: "APK · Luxury", texture: "dice/dicepack4/texture.png", faces: true },
  { id: "dicepack5_0", label: "APK · Pearl", texture: "dice/dicepack5_0/texture.png", faces: true },
  { id: "dicepack5_1", label: "APK · Coral", texture: "dice/dicepack5_1/texture.png", faces: true },
  { id: "dicepack5_2", label: "APK · Amber", texture: "dice/dicepack5_2/texture.png", faces: true },
  { id: "dicepack5_3", label: "APK · Mint", texture: "dice/dicepack5_3/texture.png", faces: true },
  { id: "dicepack5_4", label: "APK · Slate", texture: "dice/dicepack5_4/texture.png", faces: true },
  { id: "dicepack5_5", label: "APK · Violet", texture: "dice/dicepack5_5/texture.png", faces: true },
  { id: "dicepack6", label: "APK · Pack6", texture: "dice/dicepack6/texture.png", faces: true },
  { id: "dicepack8", label: "APK · Pack8", texture: "dice/dicepack8/texture.png", faces: true },
  { id: "dicepack9", label: "APK · Pack9", texture: "dice/dicepack9/texture.png", faces: true },
  { id: "dicepack10", label: "APK · Pack10", texture: "dice/dicepack10/texture.png", faces: true },
  { id: "dicepack11", label: "APK · Pack11", texture: "dice/dicepack11/texture.png", faces: true },
  { id: "dicepack12", label: "APK · Pack12", texture: "dice/dicepack12/texture.png", faces: true },
  { id: "dicepack13", label: "APK · Pack13", texture: "dice/dicepack13/texture.png", faces: true },
  { id: "dicepack14", label: "APK · Pack14", texture: "dice/dicepack14/texture.png", faces: true },
  { id: "dicepack15", label: "APK · Pack15", texture: "dice/dicepack15/texture.png", faces: true },
  { id: "dicepack16", label: "APK · Pack16", texture: "dice/dicepack16/texture.png", faces: true },
  { id: "dicepack17", label: "APK · Pack17", texture: "dice/dicepack17/texture.png", faces: true },
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
  { id: "ludo-original", label: "Ludo Original" },
  { id: "ludo-apk", label: "Ludo Board Pack 1" },
  { id: "ludo-board-2", label: "Ludo Board Pack 2" },
  { id: "ludo-board-3", label: "Ludo Board Pack 3" },
  { id: "ludo-board-4", label: "Ludo Board Pack 4" },
  { id: "ludo-board-5", label: "Ludo Board Pack 5" },
  { id: "ludo-board-6", label: "Ludo Board Pack 6" },
  { id: "ludo-board-7", label: "Ludo Board Pack 7" },
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
