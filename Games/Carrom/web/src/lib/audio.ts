/**
 * The carrom table speaks with real recordings, one folder per sound set.
 *
 * Every recording of an event is kept in a catalog and played in turn, so a
 * file is never skipped and none is left unused. The small sets and the big
 * Carrom Pool set share this one player.
 */

import { loadAsset } from "@moongames/game-sdk";
import { EVENT_GAIN, soundsFor, type BoardEvent } from "./soundCatalog";
import {
  playSynthStrike,
  playSynthPocket,
  playSynthFoul,
  playSynthWin,
} from "./synth";

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

/**
 * The synth set is the first carrom synth, restored note for note. Only the
 * four sounds that set ever had are played; the other events stay quiet,
 * exactly as they were before the recorded sets were added.
 */
function playSynth(event: BoardEvent): void {
  if (event === "strike" || event === "break") {
    playSynthStrike();
  } else if (event === "puck" || event === "pot" || event === "puckScore") {
    playSynthPocket(event === "pot");
  } else if (event === "foul" || event === "queenFail") {
    playSynthFoul();
  } else if (event === "win") {
    playSynthWin();
  }
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

export function preloadEvent(event: BoardEvent): void {
  if (!currentEnabled || currentSet === "synth") {
    return;
  }
  for (const file of soundsFor(currentSet, event)) {
    void load(`sounds/${currentSet}/${file}.mp3`);
  }
}

export function playSound(sound: CarromSound): void {
  playEvent(EVENT[sound]);
}

export function preloadSound(sound: CarromSound): void {
  preloadEvent(EVENT[sound]);
}
