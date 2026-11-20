/**
 * Plays the real Ludo sounds through the shared SDK asset loader, using the
 * same decode/cache pattern as Carrom's audio module.
 *
 * Move sounds fire once per hop, so the player is protected from rapid bursts
 * here: one sound per event can play at a time, events have a short cooldown,
 * and every sound goes through a gentle limiter.
 */

import { loadAsset } from "@moongames/game-sdk";
import {
  EVENT_GAIN,
  SOUND_PROFILES,
  soundDirectory,
  soundsFor,
  type LudoSound,
} from "./soundCatalog";

let context: AudioContext | null = null;
let limiter: DynamicsCompressorNode | null = null;
const buffers = new Map<string, AudioBuffer | null>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const nextIndex = new Map<LudoSound, number>();
const active = new Map<LudoSound, AudioBufferSourceNode>();
const lastPlayed = new Map<LudoSound, number>();
let enabled = true;
let volume = 0.8;
let set = "ludo";

/** Shortest gap between two sounds of the same kind. */
const MIN_GAP_MS: Record<LudoSound, number> = {
  roll: 260,
  move: 80,
  capture: 220,
  home: 220,
  foul: 260,
  turn: 300,
  start: 400,
  win: 500,
};

function audio(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext
        ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
      limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.knee.value = 18;
      limiter.ratio.value = 8;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.18;
      limiter.connect(context.destination);
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

function stopActive(): void {
  for (const source of active.values()) {
    try {
      source.onended = null;
      source.stop();
    } catch {
      // The sound may already have ended.
    }
  }
  active.clear();
}

export function configureSound(options: { enabled?: boolean; volume?: number; set?: string } = {}): void {
  if (options.enabled !== undefined) enabled = options.enabled;
  if (options.volume !== undefined) volume = Math.max(0, Math.min(1, options.volume));
  if (options.set !== undefined && options.set !== set) {
    stopActive();
    nextIndex.clear();
    lastPlayed.clear();
    set = options.set;
  }
}

export function setMuted(value: boolean): void {
  configureSound({ enabled: !value });
}

export function isMuted(): boolean {
  return !enabled;
}

function load(file: string): Promise<AudioBuffer | null> {
  const key = `sounds/${soundDirectory(set)}/${file}`;
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
  for (const file of soundsFor(event, set)) void load(file);
}

export function playEvent(event: LudoSound): void {
  if (!enabled || volume <= 0) return;
  const files = soundsFor(event, set);
  if (files.length === 0) return;

  const now = Date.now();
  if (now - (lastPlayed.get(event) ?? 0) < MIN_GAP_MS[event]) {
    return;
  }
  lastPlayed.set(event, now);

  const index = nextIndex.get(event) ?? 0;
  nextIndex.set(event, (index + 1) % files.length);
  const file = files[index % files.length]!;
  void load(file).then((buffer) => {
    const ctx = audio();
    if (!buffer || !ctx) return;

    const previous = active.get(event);
    if (previous !== undefined) {
      previous.onended = null;
      try {
        previous.stop();
      } catch {
        // The old sound may already have ended.
      }
    }

    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const profile = SOUND_PROFILES[set] ?? SOUND_PROFILES.ludo!;
    const target = volume * EVENT_GAIN[event] * profile.gain;
    source.buffer = buffer;
    source.playbackRate.value = profile.rate;

    const start = ctx.currentTime;
    const duration = buffer.duration / profile.rate;
    const attack = Math.min(0.008, duration / 4);
    const releaseStart = Math.max(attack, duration - Math.min(0.03, duration / 4));
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(target, start + attack);
    gain.gain.setValueAtTime(target, start + releaseStart);
    gain.gain.linearRampToValueAtTime(0, start + duration);

    source.connect(gain).connect(limiter ?? ctx.destination);
    source.onended = () => {
      if (active.get(event) === source) active.delete(event);
    };
    active.set(event, source);
    source.start(start);
  });
}

/** Kept for callers that still speak in terms of "roll" and "move". */
export function playLudoSound(event: LudoSound): void {
  playEvent(event);
}
