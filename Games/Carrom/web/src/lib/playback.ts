/**
 * How a shot is played back.
 *
 * The physics runs in the time the pieces really take, but the striker
 * crosses a board in a quarter of a second, which is too fast to follow. A
 * shot is therefore played back a little slower, and never faster than the
 * shortest readable shot, so a player can see what happened.
 */

/** The slowest a shot is played, in seconds. */
export const SHOT_MIN_SECONDS = 3.2;

/** Shots are played slower than they happen, so the eye can follow them. */
export const SHOT_TIME_SCALE = 1.35;

let speedScale = 1;

/** Set how fast shots are played; zero means no animation at all. */
export function setPlaybackSpeed(scale: number): void {
  speedScale = Math.max(0, Number.isFinite(scale) ? scale : 1);
}

export function shotPlaybackSeconds(duration: number): number {
  if (speedScale === 0) {
    return 0;
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    return SHOT_MIN_SECONDS * speedScale;
  }
  return Math.max(duration * SHOT_TIME_SCALE, SHOT_MIN_SECONDS) * speedScale;
}

/** The moment in the playback, in seconds, when the shot happened at `time`. */
export function playbackTime(time: number, duration: number): number {
  if (speedScale === 0) {
    // No animation: events still need their own timing so the sounds do not
    // all land at once. Use the real physics timing, not the scaled one.
    return Number.isFinite(duration) && duration > 0 ? time : 0;
  }
  const total = shotPlaybackSeconds(duration);
  if (!Number.isFinite(duration) || duration <= 0) {
    return time;
  }
  return time * (total / duration);
}
