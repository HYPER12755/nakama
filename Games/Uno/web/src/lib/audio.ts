import { loadAsset } from "@moongames/game-sdk";

export type UnoSound =
  | "music"
  | "button"
  | "deal"
  | "draw"
  | "flip"
  | "shuffle"
  | "action"
  | "color"
  | "colorPick"
  | "call"
  | "target"
  | "freeze"
  | "eliminated"
  | "point"
  | "result"
  | "round"
  | "warning"
  | "alert"
  | "winner"
  | "direction"
  | "reverse";

type SoundSetId = "vertical" | "classic";

type SoundFiles = Record<UnoSound, string>;

const VERTICAL_FILES: SoundFiles = {
  music: "music_game.mp3",
  button: "sound_click.mp3",
  deal: "sound_card_deal.mp3",
  draw: "sound_card_draw.mp3",
  flip: "sound_card_flip.mp3",
  shuffle: "sound_card_shuffle.mp3",
  action: "sound_action.mp3",
  color: "sound_color.mp3",
  colorPick: "sound_color_pick.mp3",
  call: "sound_call.mp3",
  target: "sound_target.mp3",
  freeze: "sound_freeze.mp3",
  eliminated: "sound_eliminated.mp3",
  point: "sound_point.mp3",
  result: "sound_result.mp3",
  round: "sound_round.mp3",
  warning: "sound_warning.mp3",
  alert: "sound_alert.mp3",
  winner: "sound_winner.mp3",
  direction: "sound_direction.mp3",
  reverse: "sound_direction_reverse.mp3",
};

const CLASSIC_FILES: SoundFiles = {
  music: "soundtrack.ogg",
  button: "click.ogg",
  deal: "card_dealing.ogg",
  draw: "card.ogg",
  flip: "card.ogg",
  shuffle: "card_dealing.ogg",
  action: "special_card.ogg",
  color: "change_color.ogg",
  colorPick: "change_color.ogg",
  call: "snap.ogg",
  target: "click.ogg",
  freeze: "special_card.ogg",
  eliminated: "game_over.ogg",
  point: "special_card.ogg",
  result: "game_over.ogg",
  round: "card_dealing.ogg",
  warning: "special_card.ogg",
  alert: "click.ogg",
  winner: "game_over.ogg",
  direction: "card.ogg",
  reverse: "special_card.ogg",
};

const SOUND_FILES: Record<SoundSetId, SoundFiles> = {
  vertical: VERTICAL_FILES,
  classic: CLASSIC_FILES,
};

const SOUND_VOLUME: Record<UnoSound, number> = {
  music: 0.28,
  button: 0.45,
  deal: 0.55,
  draw: 0.55,
  flip: 0.5,
  shuffle: 0.6,
  action: 0.7,
  color: 0.65,
  colorPick: 0.55,
  call: 0.85,
  target: 0.5,
  freeze: 0.7,
  eliminated: 0.7,
  point: 0.55,
  result: 0.8,
  round: 0.7,
  warning: 0.75,
  alert: 0.6,
  winner: 0.9,
  direction: 0.45,
  reverse: 0.6,
};

export interface UnoSoundSettings {
  set?: string;
  volume?: number;
  enabled?: boolean;
  musicEnabled?: boolean;
}

export const UNO_SOUND_SETS = [
  { id: "vertical", label: "Vertical Uno" },
  { id: "classic", label: "Classic Uno" },
] as const;

export const DEFAULT_UNO_SOUND_SET = "vertical";

export function isUnoSoundSet(id: string): id is SoundSetId {
  return id === "vertical" || id === "classic";
}

export const ALL_UNO_SOUNDS = Object.keys(VERTICAL_FILES) as UnoSound[];

let currentSet: SoundSetId = "vertical";
let currentVolume = 0.8;
let currentEnabled = true;
let currentMusicEnabled = false;
let musicSource: AudioBufferSourceNode | null = null;
let audioContext: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();

export function configureSound(settings: UnoSoundSettings): void {
  if (settings.set !== undefined && isUnoSoundSet(settings.set) && settings.set !== currentSet) {
    currentSet = settings.set;
    buffers.clear();
    loading.clear();
    stopMusic();
  }
  if (settings.volume !== undefined) currentVolume = Math.min(1, Math.max(0, settings.volume));
  if (settings.enabled !== undefined) currentEnabled = settings.enabled;
  if (settings.musicEnabled !== undefined) {
    currentMusicEnabled = settings.musicEnabled;
    if (!currentMusicEnabled) stopMusic();
  }
}

type AudioContextConstructor = typeof AudioContext;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioContext !== null) return audioContext;
  const Candidate = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (Candidate === undefined) return null;
  try {
    audioContext = new Candidate();
  } catch {
    return null;
  }
  return audioContext;
}

function cacheKey(sound: UnoSound): string {
  return `${currentSet}:${sound}`;
}

function load(sound: UnoSound): Promise<AudioBuffer | null> {
  const key = cacheKey(sound);
  const existing = buffers.get(key);
  if (existing !== undefined) return Promise.resolve(existing);
  const pending = loading.get(key);
  if (pending !== undefined) return pending;
  const ctx = context();
  if (ctx === null) return Promise.resolve(null);
  const path = `sounds/${currentSet}/${SOUND_FILES[currentSet][sound]}`;
  const promise = loadAsset(path)
    .then((data) => ctx.decodeAudioData(data as ArrayBuffer))
    .then((buffer) => {
      buffers.set(key, buffer);
      loading.delete(key);
      return buffer;
    })
    .catch(() => {
      loading.delete(key);
      return null;
    });
  loading.set(key, promise);
  return promise;
}

export function playSound(sound: UnoSound): void {
  if (!currentEnabled || currentVolume <= 0) return;
  const ctx = context();
  if (ctx === null) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  void load(sound).then((buffer) => {
    if (buffer === null || ctx.state === "closed") return;
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = SOUND_VOLUME[sound] * currentVolume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      return;
    }
  });
}

export function startMusic(): void {
  if (!currentEnabled || !currentMusicEnabled || currentVolume <= 0) return;
  const ctx = context();
  if (ctx === null || musicSource !== null) return;
  if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
  void load("music").then((buffer) => {
    if (buffer === null || musicSource !== null || !currentMusicEnabled || !currentEnabled) return;
    try {
      musicSource = ctx.createBufferSource();
      musicSource.buffer = buffer;
      musicSource.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = SOUND_VOLUME.music * currentVolume;
      musicSource.connect(gain);
      gain.connect(ctx.destination);
      musicSource.start();
    } catch {
      musicSource = null;
    }
  });
}

export function stopMusic(): void {
  if (musicSource !== null) {
    try {
      musicSource.stop();
    } catch {
      return;
    }
    try {
      musicSource.disconnect();
    } catch {
      return;
    }
    musicSource = null;
  }
}

let previewIndex = 0;

export function previewSound(): void {
  const sound = ALL_UNO_SOUNDS[previewIndex % ALL_UNO_SOUNDS.length];
  previewIndex += 1;
  if (sound !== undefined) playSound(sound);
}

export function soundAssetPaths(): string[] {
  const paths: string[] = [];
  for (const set of Object.keys(SOUND_FILES) as SoundSetId[]) {
    for (const sound of ALL_UNO_SOUNDS) {
      paths.push(`sounds/${set}/${SOUND_FILES[set][sound]}`);
    }
  }
  return Array.from(new Set(paths));
}
