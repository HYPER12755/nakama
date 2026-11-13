let audioContext: AudioContext | null = null;

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

function resume(ctx: AudioContext): void {
  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }
}

function tone(
  frequency: number,
  endFrequency: number,
  duration: number,
  type: OscillatorType,
  volume: number,
  delay = 0,
): void {
  const ctx = context();
  if (ctx === null) {
    return;
  }
  resume(ctx);
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.frequency.exponentialRampToValueAtTime(
    Math.max(20, endFrequency),
    start + duration,
  );
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playStrike(): void {
  tone(185, 72, 0.12, "triangle", 0.09);
  tone(420, 160, 0.045, "square", 0.025);
}

export function playPocket(queen = false): void {
  tone(queen ? 260 : 150, 58, queen ? 0.22 : 0.16, "sine", 0.11);
  if (queen) {
    tone(520, 390, 0.16, "triangle", 0.045, 0.04);
  }
}

export function playFoul(): void {
  tone(170, 82, 0.28, "sawtooth", 0.055);
}

export function playWin(): void {
  tone(392, 392, 0.16, "triangle", 0.06);
  tone(523.25, 523.25, 0.16, "triangle", 0.055, 0.12);
  tone(659.25, 659.25, 0.3, "triangle", 0.06, 0.24);
}
