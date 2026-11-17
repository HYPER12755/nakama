import type { CarromPlayer, GameVariant } from "@moongames/carrom-core";
import { gameStorageKey } from "./storage";

export interface LocalRatingChange {
  before: number;
  after: number;
}

export interface LocalGameRecord {
  id: string;
  at: number;
  seats: CarromPlayer[];
  variant: GameVariant;
  winner: CarromPlayer | null;
  winnerTeam?: "A" | "B" | null;
  shots: number;
  ratings: Partial<Record<CarromPlayer, LocalRatingChange>>;
}

export interface LocalProgress {
  ratings: Partial<Record<CarromPlayer, LocalRatingChange>>;
  history: LocalGameRecord[];
}

const KEY = gameStorageKey("local-progress");

/** The small part of localStorage the record needs. */
export interface ProgressStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): ProgressStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

const DEFAULT_RATING = 1200;
const K_FACTOR = 32;
const HISTORY_LIMIT = 10;

function emptyProgress(): LocalProgress {
  return { ratings: {}, history: [] };
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value: number): number {
  return Math.floor(value + 0.5);
}

function expected(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

function score(outcome: "win" | "loss" | "draw"): number {
  return outcome === "win" ? 1 : outcome === "loss" ? 0 : 0.5;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readLocalProgress(
  storage: ProgressStorage | null = browserStorage(),
): LocalProgress {
  try {
    const raw = storage?.getItem(KEY) ?? null;
    if (raw === null) {
      return emptyProgress();
    }
    const parsed = JSON.parse(raw) as Partial<LocalProgress> | null;
    if (parsed === null || typeof parsed !== "object") {
      return emptyProgress();
    }
    return {
      ratings: (parsed.ratings ?? {}) as LocalProgress["ratings"],
      history: list(parsed.history) as LocalGameRecord[],
    };
  } catch {
    return emptyProgress();
  }
}

/**
 * Write the result of a local table to the device.
 *
 * A four player table is rated against the average of the other seats, the
 * same way the server rates one. The record keeps each seat's change so the
 * history can show what the game did.
 */
export function recordLocalGame(
  input: {
    seats: CarromPlayer[];
    variant: GameVariant;
    winner: CarromPlayer | null;
    winnerTeam?: "A" | "B" | null;
    shots: number;
    at?: number;
  },
  storage: ProgressStorage | null = browserStorage(),
): LocalProgress {
  const progress = readLocalProgress(storage);
  const ratings: LocalProgress["ratings"] = { ...progress.ratings };
  const changes: LocalGameRecord["ratings"] = {};

  for (const seat of input.seats) {
    const opponents = input.seats.filter((other) => other !== seat);
    const average =
      opponents.length === 0
        ? DEFAULT_RATING
        : opponents.reduce(
            (total, other) =>
              total + numberOr(ratings[other]?.after, DEFAULT_RATING),
            0,
          ) / opponents.length;
    const before = numberOr(ratings[seat]?.after, DEFAULT_RATING);
    const side = seat === "white" || seat === "black" ? "A" : "B";
    const outcome =
      input.winnerTeam !== undefined && input.winnerTeam !== null
        ? input.winnerTeam === side
          ? "win"
          : "loss"
        : input.winner === null
          ? "draw"
          : input.winner === seat
            ? "win"
            : "loss";
    const delta = round(K_FACTOR * (score(outcome) - expected(before, average)));
    const after = Math.max(100, before + delta);
    ratings[seat] = { before, after };
    changes[seat] = { before, after };
  }

  const record: LocalGameRecord = {
    id: `${input.at ?? Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: input.at ?? Date.now(),
    seats: [...input.seats],
    variant: input.variant,
    winner: input.winner,
    winnerTeam: input.winnerTeam ?? null,
    shots: input.shots,
    ratings: changes,
  };
  const history = [record, ...progress.history].slice(0, HISTORY_LIMIT);
  const next = { ratings, history };
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full or blocked store must not stop the game from finishing.
  }
  return next;
}

export function clearLocalProgress(
  storage: ProgressStorage | null = browserStorage(),
): void {
  try {
    storage?.removeItem(KEY);
  } catch {
    // Nothing to clear when the store is unavailable.
  }
}
