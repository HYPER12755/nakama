/** Small procedural sound set for Ludo events. No external audio files. */

export type LudoSound =
  | "roll"
  | "move"
  | "capture"
  | "home"
  | "win"
  | "foul";

let context: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
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

export function setMuted(value: boolean): void {
  muted = value;
}

export function isMuted(): boolean {
  return muted;
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.12,
  delay = 0,
): void {
  const ctx = audio();
  if (!ctx) return;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function noise(duration: number, volume = 0.09): void {
  const ctx = audio();
  if (!ctx) return;
  const frames = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1700;
  gain.gain.value = volume;
  source.buffer = buffer;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

/** Play one event. The sounds are deliberately short so a fast AI is calm. */
export function playLudoSound(event: LudoSound): void {
  switch (event) {
    case "roll":
      noise(0.13, 0.08);
      tone(210, 0.07, "triangle", 0.05);
      break;
    case "move":
      tone(430, 0.07, "sine", 0.08);
      tone(560, 0.05, "sine", 0.05, 0.05);
      break;
    case "capture":
      tone(190, 0.16, "sawtooth", 0.1);
      tone(120, 0.2, "triangle", 0.08, 0.04);
      break;
    case "home":
      [523, 659, 784].forEach((frequency, index) => tone(frequency, 0.16, "sine", 0.09, index * 0.07));
      break;
    case "win":
      [523, 659, 784, 1046].forEach((frequency, index) => tone(frequency, 0.28, "sine", 0.1, index * 0.11));
      break;
    case "foul":
      tone(150, 0.22, "square", 0.06);
      break;
  }
}
