/**
 * Real recorded Ludo sounds. Each set keeps its own directory and file list.
 * Board packs 1-7 are the complete set shipped inside the supplied APK.
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

export type LudoSoundSetId =
  | "ludo"
  | "ludo-original"
  | "ludo-apk"
  | "ludo-board-2"
  | "ludo-board-3"
  | "ludo-board-4"
  | "ludo-board-5"
  | "ludo-board-6"
  | "ludo-board-7";

interface SoundSetDefinition {
  directory: string;
  files: Record<LudoSound, string[]>;
  gain: number;
  rate: number;
}

function boardSet(directory: string): SoundSetDefinition {
  return {
    directory,
    gain: 0.85,
    rate: 1,
    files: {
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
  };
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
  "ludo-original": {
    directory: "ludo-original",
    gain: 0.85,
    rate: 1,
    files: {
      roll: ["dice.ogg"],
      move: ["cursor_move.ogg"],
      capture: ["sword.ogg"],
      home: ["goal.ogg"],
      safe: ["safe_block.ogg"],
      foul: ["net_time.ogg"],
      turn: ["turn.ogg"],
      start: ["start_game.ogg"],
      win: ["cheers.ogg"],
      join: ["net_join.ogg"],
      chat: ["chat-pop.ogg"],
      clock: ["net_time.ogg"],
    },
  },
  "ludo-apk": boardSet("ludo-apk"),
  "ludo-board-2": boardSet("ludo-board-2"),
  "ludo-board-3": boardSet("ludo-board-3"),
  "ludo-board-4": boardSet("ludo-board-4"),
  "ludo-board-5": boardSet("ludo-board-5"),
  "ludo-board-6": boardSet("ludo-board-6"),
  "ludo-board-7": boardSet("ludo-board-7"),
};

/** Background music from each APK sound bank. */
export const MUSIC_FILES: Partial<Record<LudoSoundSetId, string[]>> = {
  "ludo-original": ["title_bgm.ogg"],
  "ludo-apk": ["clip_bg.ogg"],
  "ludo-board-2": ["clip_bg.ogg"],
  "ludo-board-3": ["clip_bg.ogg"],
  "ludo-board-4": ["clip_bg.ogg"],
  "ludo-board-5": ["clip_bg.ogg"],
  "ludo-board-6": ["clip_bg.ogg"],
  "ludo-board-7": ["clip_bg.ogg"],
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
