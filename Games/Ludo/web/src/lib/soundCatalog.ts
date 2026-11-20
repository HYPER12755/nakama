/**
 * Real recorded Ludo sounds. Each set keeps its own directory and file list.
 * The APK set is mapped 1:1 to the original game's named AudioSources.
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

export type LudoSoundSetId = "ludo" | "ludo-apk";

interface SoundSetDefinition {
  directory: string;
  files: Record<LudoSound, string[]>;
  gain: number;
  rate: number;
}

export const SOUND_SET_DEFINITIONS: Record<LudoSoundSetId, SoundSetDefinition> = {
  ludo: {
    directory: "ludo",
    gain: 1,
    rate: 1,
    files: {
      roll: ["dice-roll.ogg", "dice-roll.mp3"],
      move: ["move.ogg"],
      capture: ["capture.ogg"],
      home: ["home.ogg"],
      foul: ["foul.ogg"],
      turn: ["turn.ogg"],
      start: ["start.ogg"],
      win: ["win.ogg"],
    },
  },
  "ludo-apk": {
    directory: "ludo-apk",
    gain: 0.85,
    rate: 1,
    files: {
      // Original AudioSource -> extracted clip:
      // diceSound -> dice, CurserMove -> cursor_move, SwordSound -> sword,
      // safePoints -> safe_block, clocktick -> net_time, turnChange -> turn,
      // startGame -> start_game, cheersSound -> cheers.
      roll: ["roll.ogg"],
      move: ["move.ogg"],
      capture: ["capture.ogg"],
      home: ["home.ogg"],
      foul: ["foul.ogg"],
      turn: ["turn.ogg"],
      start: ["start.ogg"],
      win: ["win.ogg"],
    },
  },
};

/** Background music loops, from the original game's InGameMusic/IntroMusic. */
export const MUSIC_FILES: Partial<Record<LudoSoundSetId, string[]>> = {
  "ludo-apk": ["music-ingame.ogg", "music-intro.ogg"],
};

export const LUDO_SOUNDS: Record<LudoSound, string[]> =
  SOUND_SET_DEFINITIONS.ludo.files;

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

export const SOUND_PROFILES: Record<string, { gain: number; rate: number }> =
  Object.fromEntries(
    Object.entries(SOUND_SET_DEFINITIONS).map(([id, definition]) => [
      id,
      { gain: definition.gain, rate: definition.rate },
    ]),
  );

export function soundDirectory(setId: string): string {
  const known = setId as LudoSoundSetId;
  return (SOUND_SET_DEFINITIONS[known] ?? SOUND_SET_DEFINITIONS.ludo).directory;
}

export function soundsFor(event: LudoSound, setId = "ludo"): string[] {
  const known = setId as LudoSoundSetId;
  const definition = SOUND_SET_DEFINITIONS[known] ?? SOUND_SET_DEFINITIONS.ludo;
  return definition.files[event];
}
