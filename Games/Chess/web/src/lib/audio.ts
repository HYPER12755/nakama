/**
 * The sounds of a chess table.
 *
 * The sounds are real recordings of a board, downloaded with the game, so
 * they sound like a table and not like a machine. Each file is fetched the
 * first time it is needed and then kept, so the table is never silent and
 * the game never waits for a sound.
 *
 * The sounds come from the lichess sound set, which is released under the
 * MIT licence. The table sounds come from the standard theme and the loud
 * moments from the futuristic theme.
 */

export type ChessSound =
  | "move"
  | "capture"
  | "check"
  | "checkmate"
  | "win"
  | "lose"
  | "draw"
  | "error"
  | "notify"
  | "lowtime"
  | "start"
  | "select";

const SOUND_FILES: Record<ChessSound, string> = {
  move: "move.mp3",
  capture: "capture.mp3",
  check: "check.mp3",
  checkmate: "checkmate.mp3",
  win: "win.mp3",
  lose: "lose.mp3",
  draw: "draw.mp3",
  error: "error.mp3",
  notify: "notify.mp3",
  lowtime: "lowtime.mp3",
  start: "start.mp3",
  select: "select.mp3",
};

/** How loud each sound is. A move is quiet, the end of a game is not. */
const SOUND_VOLUME: Record<ChessSound, number> = {
  move: 0.5,
  capture: 0.7,
  check: 0.7,
  checkmate: 0.9,
  win: 0.9,
  lose: 0.8,
  draw: 0.8,
  error: 0.6,
  notify: 0.6,
  lowtime: 0.7,
  start: 0.7,
  select: 0.35,
};

let audioContext: AudioContext | null = null;
const buffers = new Map<ChessSound, AudioBuffer>();
const loading = new Map<ChessSound, Promise<AudioBuffer | null>>();

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

function soundUrl(file: string): string {
  // The sounds sit beside the game, so the path is relative to the page.
  const base = document.baseURI;
  return new URL(`sounds/${file}`, base).toString();
}

function load(
  sound: ChessSound,
): Promise<AudioBuffer | null> {
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
  const promise = fetch(soundUrl(SOUND_FILES[sound]))
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

/** Warm a sound up, so it is ready when the event happens. */
export function preloadSound(sound: ChessSound): void {
  void load(sound);
}

/**
 * Play a sound. A sound that cannot be played is ignored, because a missing
 * sound must never stop the game.
 */
export function playSound(sound: ChessSound): void {
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
      gain.gain.value = SOUND_VOLUME[sound];
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // The table plays on without the sound.
    }
  });
}

/** A piece is put down on the board. */
export function playMove(): void {
  playSound("move");
}

/** A piece is taken off the board. */
export function playCapture(): void {
  playSound("capture");
}

/** A piece is picked up. */
export function playSelect(): void {
  playSound("select");
}

/** The king is in check. */
export function playCheck(): void {
  playSound("check");
}

/** The game is over. */
export function playCheckmate(): void {
  playSound("checkmate");
}

/** The player won. */
export function playWin(): void {
  playSound("win");
}

/** The player lost. */
export function playLose(): void {
  playSound("lose");
}

/** The game is a draw. */
export function playDraw(): void {
  playSound("draw");
}

/** The game has started. */
export function playGameStart(): void {
  playSound("start");
}

/** The other player left the table. */
export function playOpponentLeft(): void {
  playSound("notify");
}

/** The table is running out of time. */
export function playLowTime(): void {
  playSound("lowtime");
}

/** A move was refused. */
export function playRefused(): void {
  playSound("error");
}
