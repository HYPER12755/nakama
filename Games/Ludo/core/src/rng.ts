/**
 * A tiny deterministic 32-bit PRNG. The seed lives in the game state so the
 * server, the client and a replay can reproduce the exact same dice sequence.
 */

export const DEFAULT_SEED = 0x9e3779b9;

export function normalizeSeed(seed: number | undefined): number {
  const value = (seed ?? DEFAULT_SEED) >>> 0;
  return value === 0 ? DEFAULT_SEED : value;
}

const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;

/**
 * A linear congruential generator. Its multiply and add stay inside exact
 * double precision, so plain Lua and TypeScript produce identical sequences
 * without relying on bitwise operators that some runtimes do not provide.
 */
export function nextSeed(seed: number): number {
  let x = seed >>> 0;
  if (x === 0) x = DEFAULT_SEED;
  return (Math.imul(x, MULTIPLIER) + INCREMENT) >>> 0;
}

export interface RollResult {
  value: number;
  seed: number;
}

const TWO_32 = 0x1_0000_0000;

/**
 * Produces a die in 1..6 from the next seed. The high bits are used because
 * an LCG's low bits repeat in short cycles; alternating players would never
 * see some faces if the roll were taken from `seed % 6`.
 */
export function rollFromSeed(seed: number, sides = 6): RollResult {
  const next = nextSeed(seed);
  return { value: Math.floor((next / TWO_32) * sides) + 1, seed: next };
}

/** A second, derived stream so AI choices cannot disturb the dice seed. */
export function aiSeed(seed: number, seat: number, action: number): number {
  return nextSeed((seed ^ ((seat + 1) * 0x45d9f3b) ^ (action * 0x27d4eb2d)) >>> 0);
}
