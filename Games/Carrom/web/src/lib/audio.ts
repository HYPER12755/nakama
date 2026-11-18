/**
 * The carrom table speaks with real recordings, one folder per sound set.
 *
 * Every recording of an event is kept in a catalog and played in turn, so a
 * file is never skipped and none is left unused. The small sets and the big
 * Carrom Pool set share this one player.
 */

import { loadAsset } from "@moongames/game-sdk";
import { EVENT_GAIN, soundsFor, type BoardEvent } from "./soundCatalog";

export type CarromSound =
  | "strike" | "pocket" | "queen" | "foul" | "win" | "turn" | "start";

/** Map the old sound names to the events they stand for. */
const EVENT: Record<CarromSound, BoardEvent> = {
  strike: "strike",
  pocket: "pot",
  queen: "queenCover",
  foul: "foul",
  win: "win",
  turn: "turn",
  start: "break",
};

let audioContext: AudioContext | null = null;
const buffers = new Map<string, AudioBuffer>();
const loading = new Map<string, Promise<AudioBuffer | null>>();
const nextIndex = new Map<string, number>();

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
    nextIndex.clear();
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

/** Play one real recording of a board event, in round-robin order. */
export function playEvent(event: BoardEvent): void {
  if (!currentEnabled || currentVolume <= 0) {
    return;
  }
  if (currentSet === "synth") {
    playSynth(event);
    return;
  }
  const files = soundsFor(currentSet, event);
  if (files.length === 0) {
    return;
  }
  const slot = `${currentSet}:${event}`;
  const index = nextIndex.get(slot) ?? 0;
  nextIndex.set(slot, (index + 1) % files.length);
  const file = files[index]!;
  void load(`sounds/${currentSet}/${file}.mp3`).then((buffer) => {
    const ctx = context();
    if (buffer === null || ctx === null || ctx.state === "closed") {
      return;
    }
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = currentVolume * EVENT_GAIN[event];
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // A missing sound must never stop the table.
    }
  });
}

/** The generated set: short tones mapped to the events, like the old table. */
function playSynth(event: BoardEvent): void {
  const ctx = context();
  if (ctx === null) {
    return;
  }
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
  const notes: Record<BoardEvent, { from: number; to: number; type: OscillatorType; length: number }> = {
    strike: { from: 185, to: 72, type: "triangle", length: 0.12 },
    hitPuck: { from: 420, to: 160, type: "square", length: 0.05 },
    puckHit: { from: 320, to: 120, type: "triangle", length: 0.06 },
    hitEdge: { from: 140, to: 60, type: "sine", length: 0.08 },
    pot: { from: 150, to: 58, type: "sine", length: 0.16 },
    break: { from: 220, to: 80, type: "triangle", length: 0.18 },
    queenCover: { from: 520, to: 390, type: "triangle", length: 0.16 },
    queenFail: { from: 170, to: 82, type: "sawtooth", length: 0.28 },
    queenScore: { from: 440, to: 330, type: "triangle", length: 0.12 },
    puckScore: { from: 300, to: 220, type: "sine", length: 0.1 },
    puckBack: { from: 200, to: 120, type: "sine", length: 0.1 },
    foul: { from: 170, to: 82, type: "sawtooth", length: 0.28 },
    turn: { from: 520, to: 520, type: "triangle", length: 0.08 },
    start: { from: 392, to: 392, type: "triangle", length: 0.1 },
    win: { from: 523, to: 659, type: "triangle", length: 0.3 },
    lose: { from: 300, to: 180, type: "sawtooth", length: 0.3 },
    rematch: { from: 392, to: 523, type: "triangle", length: 0.2 },
    clock: { from: 880, to: 880, type: "square", length: 0.04 },
    move: { from: 90, to: 70, type: "sine", length: 0.08 },
    aim: { from: 60, to: 55, type: "sine", length: 0.05 },
    place: { from: 300, to: 200, type: "triangle", length: 0.05 },
  };
  const note = notes[event];
  const gainValue = currentVolume * EVENT_GAIN[event] * 0.5;
  const at = ctx.currentTime;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = note.type;
  oscillator.frequency.setValueAtTime(note.from, at);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, note.to), at + note.length);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + note.length);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(at);
  oscillator.stop(at + note.length + 0.02);
}

let musicNode: AudioBufferSourceNode | null = null;

/** Loop one of the game's music tracks, when the set has one. */
export function playMusic(file: string): void {
  const ctx = context();
  if (ctx === null || !currentEnabled || currentVolume <= 0) {
    return;
  }
  stopMusic();
  void load(`sounds/${currentSet}/${file}.mp3`).then((buffer) => {
    if (buffer === null || ctx.state === "closed") {
      return;
    }
    try {
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      source.loop = true;
      gain.gain.value = currentVolume * 0.25;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
      musicNode = source;
    } catch {
      // A missing track must never stop the table.
    }
  });
}

export function stopMusic(): void {
  if (musicNode !== null) {
    try {
      musicNode.stop();
    } catch {
      // Already stopped.
    }
    musicNode = null;
  }
}

function load(url: string): Promise<AudioBuffer | null> {
  const existing = buffers.get(url);
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }
  const pending = loading.get(url);
  if (pending !== undefined) {
    return pending;
  }
  const ctx = context();
  if (ctx === null) {
    return Promise.resolve(null);
  }
  const promise = loadAsset(url)
    .then((data) => ctx.decodeAudioData(data as ArrayBuffer))
    .then((buffer) => {
      loading.delete(url);
      if (buffer !== null) {
        buffers.set(url, buffer);
      }
      return buffer;
    })
    .catch(() => {
      loading.delete(url);
      return null;
    });
  loading.set(url, promise);
  return promise;
}

export function preloadSound(sound: CarromSound): void {
  if (!currentEnabled) {
    return;
  }
  const files = soundsFor(currentSet, EVENT[sound]);
  for (const file of files) {
    void load(`sounds/${currentSet}/${file}.mp3`);
  }
}

export function playSound(sound: CarromSound): void {
  playEvent(EVENT[sound]);
}
