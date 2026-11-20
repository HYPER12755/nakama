/**
 * Plays the real Ludo sounds through the shared SDK asset loader, using the
 * same decode/cache pattern as Carrom's audio module.
 */

import { loadAsset } from "@moongames/game-sdk";
import { EVENT_GAIN, SOUND_PROFILES, soundsFor, type LudoSound } from "./soundCatalog";

let context: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const nextIndex = new Map<LudoSound, number>();
let enabled = true;
let volume = 0.8;
let set = "ludo";

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

export function configureSound(options: { enabled?: boolean; volume?: number; set?: string } = {}): void {
  if (options.enabled !== undefined) enabled = options.enabled;
  if (options.volume !== undefined) volume = Math.max(0, Math.min(1, options.volume));
  if (options.set !== undefined) set = options.set;
}

export function setMuted(value: boolean): void {
  configureSound({ enabled: !value });
}

export function isMuted(): boolean {
  return !enabled;
}

function load(file: string): Promise<AudioBuffer | null> {
  const key = `sounds/ludo/${file}`;
  const cached = buffers.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = loading.get(key);
  if (pending) return pending;
  const ctx = audio();
  if (!ctx) return Promise.resolve(null);
  const promise = loadAsset(key)
    .then((data) => ctx.decodeAudioData(data as ArrayBuffer))
    .then((buffer) => {
      buffers.set(key, buffer);
      loading.delete(key);
      return buffer;
    })
    .catch(() => {
      buffers.set(key, null);
      loading.delete(key);
      return null;
    });
  loading.set(key, promise);
  return promise;
}

/** Warm an event so the first roll does not wait for the network. */
export function preloadEvent(event: LudoSound): void {
  for (const file of soundsFor(event)) void load(file);
}

export function playEvent(event: LudoSound): void {
  if (!enabled) return;
  const files = soundsFor(event);
  if (files.length === 0) return;
  const index = nextIndex.get(event) ?? 0;
  nextIndex.set(event, (index + 1) % files.length);
  const file = files[index % files.length]!;
  void load(file).then((buffer) => {
    const ctx = audio();
    if (!buffer || !ctx) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const profile = SOUND_PROFILES[set] ?? SOUND_PROFILES.ludo!;
    source.buffer = buffer;
    source.playbackRate.value = profile.rate;
    gain.gain.value = volume * EVENT_GAIN[event] * profile.gain;
    source.connect(gain).connect(ctx.destination);
    source.start();
  });
}

/** Kept for callers that still speak in terms of "roll" and "move". */
export function playLudoSound(event: LudoSound): void {
  playEvent(event);
}
