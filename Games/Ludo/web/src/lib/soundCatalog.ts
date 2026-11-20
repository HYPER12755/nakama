/**
 * Real recorded Ludo sounds. Each set keeps its own directory and file list.
 * The APK set uses the original clip names from the game's board pack.
 */

export type LudoSound =
  | "roll"
  | "move"
  | "capture"
  | "home"
  | "safe"
  | "foul"
  | "turn"
  | "start"
  | "win"
  | "join"
  | "chat"
  | "clock";

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
      safe: ["home.ogg"],
      foul: ["foul.ogg"],
      turn: ["turn.ogg"],
      start: ["start.ogg"],
      win: ["win.ogg"],
      join: ["turn.ogg"],
      chat: ["turn.ogg"],
      clock: ["foul.ogg"],
    },
  },
  "ludo-apk": {
    directory: "ludo-apk",
    gain: 0.85,
    rate: 1,
    files: {
      // Exact board-pack / SoundManager clip roles.
      roll: ["clip_roll.ogg"],
      move: ["clip_move.ogg"],
      capture: ["clip_kill.ogg"],
      home: ["clip_home.ogg"],
      safe: ["clip_safe.ogg"],
      foul: ["clip_die.ogg"],
      turn: ["rullet_active.ogg"],
      start: ["start_game.ogg"],
      win: ["goal.ogg"],
      join: ["net_join.ogg"],
      chat: ["chat-pop.ogg"],
      clock: ["net_time.ogg"],
    },
  },
};

/** The genuine in-game music clip from the board pack. */
export const MUSIC_FILES: Partial<Record<LudoSoundSetId, string[]>> = {
  "ludo-apk": ["clip_bg.ogg"],
};

export const LUDO_SOUNDS: Record<LudoSound, string[]> =
  SOUND_SET_DEFINITIONS.ludo.files;

export const EVENT_GAIN: Record<LudoSound, number> = {
  roll: 0.9,
  move: 0.5,
  capture: 0.85,
  home: 0.7,
  safe: 0.65,
  foul: 0.7,
  turn: 0.5,
  start: 0.6,
  win: 0.9,
  join: 0.45,
  chat: 0.4,
  clock: 0.45,
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
