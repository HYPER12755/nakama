/**
 * A tiny deterministic 32-bit PRNG. The seed lives in the game state so the
 * server, the client and a replay can reproduce the exact same dice sequence.
 */

export const DEFAULT_SEED = 0x9e3779b9;

export function normalizeSeed(seed: number | undefined): number {
  const value = (seed ?? DEFAULT_SEED) >>> 0;
  return value === 0 ? DEFAULT_SEED : value;
}

/** xorshift32: fast, deterministic, and identical in TypeScript and Lua. */
export function nextSeed(seed: number): number {
  let x = seed >>> 0;
  if (x === 0) x = DEFAULT_SEED;
  x ^= (x << 13) >>> 0;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= (x << 5) >>> 0;
  x >>>= 0;
  return x >>> 0;
}

export interface RollResult {
  value: number;
  seed: number;
}

/** Produces a die in 1..6 from the next seed. */
export function rollFromSeed(seed: number, sides = 6): RollResult {
  const next = nextSeed(seed);
  return { value: (next % sides) + 1, seed: next };
}

/** A second, derived stream so AI choices cannot disturb the dice seed. */
export function aiSeed(seed: number, seat: number, action: number): number {
  return nextSeed((seed ^ ((seat + 1) * 0x45d9f3b) ^ (action * 0x27d4eb2d)) >>> 0);
}
