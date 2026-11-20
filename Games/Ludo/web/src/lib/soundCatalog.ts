/**
 * Real recorded sounds for Ludo events. Every file is bundled in
 * public/sounds/ludo and loaded through the shared SDK asset loader.
 */

export type LudoSound =
  | "roll"
  | "move"
  | "capture"
  | "home"
  | "foul"
  | "turn"
  | "start"
  | "win";

export const LUDO_SOUNDS: Record<LudoSound, string[]> = {
  roll: ["dice-roll.ogg", "dice-roll.mp3"],
  move: ["move.ogg"],
  capture: ["capture.ogg"],
  home: ["home.ogg"],
  foul: ["foul.ogg"],
  turn: ["turn.ogg"],
  start: ["start.ogg"],
  win: ["win.ogg"],
};

export const EVENT_GAIN: Record<LudoSound, number> = {
  roll: 0.9,
  move: 0.5,
  capture: 0.85,
  home: 0.7,
  foul: 0.7,
  turn: 0.55,
  start: 0.6,
  win: 0.9,
};

/** Selectable sound characters. All files are the real recorded Ludo clips. */
export const SOUND_PROFILES: Record<string, { gain: number; rate: number }> = {
  ludo: { gain: 1, rate: 1 },
};

export function soundsFor(event: LudoSound): string[] {
  return LUDO_SOUNDS[event];
}
