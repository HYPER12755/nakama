export const DEFAULT_SEED = 123456789;

const MULTIPLIER = 1664525;
const INCREMENT = 1013904223;
const MODULUS = 4294967296;

export function normalizeSeed(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? DEFAULT_SEED);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SEED;
  }
  return Math.floor(Math.abs(parsed)) % MODULUS;
}

export function nextSeed(seed: number): number {
  return (Math.imul(MULTIPLIER, normalizeSeed(seed)) + INCREMENT) >>> 0;
}

export function randomInt(seed: number, bound: number): number {
  if (bound <= 0) {
    return 0;
  }
  return Math.floor((nextSeed(seed) / MODULUS) * bound);
}
