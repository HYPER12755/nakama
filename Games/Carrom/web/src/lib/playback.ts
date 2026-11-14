/**
 * How a shot is played back.
 *
 * The physics runs in the time the pieces really take, but the striker
 * crosses a board in a quarter of a second, which is too fast to follow. A
 * shot is therefore played back a little slower, and never faster than the
 * shortest readable shot, so a player can see what happened.
 */

/** The slowest a shot is played, in seconds. */
export const SHOT_MIN_SECONDS = 1.9;

/** Shots are played a little slower than they happen. */
export const SHOT_TIME_SCALE = 0.85;

/**
 * How long a shot of this length is played for, in seconds. The board and
 * the sounds use the same number, so a pocket is heard when the piece
 * reaches the pocket.
 */
export function shotPlaybackSeconds(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return SHOT_MIN_SECONDS;
  }
  return Math.max(duration * SHOT_TIME_SCALE, SHOT_MIN_SECONDS);
}

/** The moment in the playback, in seconds, when the shot happened at `time`. */
export function playbackTime(time: number, duration: number): number {
  const total = shotPlaybackSeconds(duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return time;
  }
  return time * (total / duration);
}
