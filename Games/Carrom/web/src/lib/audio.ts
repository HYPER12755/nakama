/**
 * The carrom table speaks with real sound files, one folder per set. The
 * sounds are fetched once and played at the moment the event happens. A
 * missing sound never stops the game.
 */

export type CarromSound =
  | "strike"
  | "pocket"
  | "queen"
  | "foul"
  | "win"
  | "turn"
  | "start";

let audioContext: AudioContext | null = null;
const buffers = new Map<CarromSound, AudioBuffer>();
const loading = new Map<CarromSound, Promise<AudioBuffer | null>>();

let currentSet = "standard";
let currentVolume = 0.8;
let currentEnabled = true;

type AudioContextConstructor = typeof AudioContext;

function context(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }
  if (audioContext !== null) {
    return audioContext;
  }
  const Candidate =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: AudioContextConstructor })
      .webkitAudioContext;
  if (Candidate === undefined) {
    return null;
  }
  try {
    audioContext = new Candidate();
  } catch {
    return null;
  }
  return audioContext;
}

export interface SoundSettings {
  set?: string;
  volume?: number;
  enabled?: boolean;
}

export function configureSound(settings: SoundSettings): void {
  if (settings.set !== undefined && settings.set !== currentSet) {
    currentSet = settings.set;
    buffers.clear();
    loading.clear();
  }
  if (settings.volume !== undefined) {
    currentVolume = Math.max(0, Math.min(1, settings.volume));
  }
  if (settings.enabled !== undefined) {
    currentEnabled = settings.enabled;
  }
}

export function soundSet(): string {
  return currentSet;
}

function soundUrl(file: string): string {
  const base = document.baseURI;
  return new URL(`sounds/${currentSet}/${file}.ogg`, base).toString();
}

function load(sound: CarromSound): Promise<AudioBuffer | null> {
  const existing = buffers.get(sound);
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }
  const pending = loading.get(sound);
  if (pending !== undefined) {
    return pending;
  }
  const ctx = context();
  if (ctx === null) {
    return Promise.resolve(null);
  }
  const promise = fetch(soundUrl(sound))
    .then((response) => (response.ok ? response.arrayBuffer() : null))
    .then((data) => (data === null ? null : ctx.decodeAudioData(data)))
    .then((buffer) => {
      loading.delete(sound);
      if (buffer !== null) {
        buffers.set(sound, buffer);
      }
      return buffer;
    })
    .catch(() => {
      loading.delete(sound);
      return null;
    });
  loading.set(sound, promise);
  return promise;
}

/** Fetch a sound ahead of time so it is ready when the event happens. */
export function preloadSound(sound: CarromSound): void {
  if (!currentEnabled) {
    return;
  }
  void load(sound);
}

/** Play a sound. A missing or blocked file is ignored. */
export function playSound(sound: CarromSound): void {
  if (!currentEnabled || currentVolume <= 0) {
    return;
  }
  const ctx = context();
  if (ctx === null) {
    return;
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  void load(sound).then((buffer) => {
    if (buffer === null || ctx.state === "closed") {
      return;
    }
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = currentVolume;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // The table plays on without the sound.
    }
  });
}
