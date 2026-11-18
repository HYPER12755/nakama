import type { LudoColor, LudoState } from "@moongames/ludo-core";
import { gameStorageKey } from "./storage";

export interface LocalGameRecord {
  id: string;
  at: number;
  seats: number;
  winner: LudoColor | null;
  moves: number;
  steps: { color: LudoColor; token: number; to: number }[];
}

export interface LocalProgress {
  games: number;
  wins: number;
  byColor: Partial<Record<LudoColor, { games: number; wins: number }>>;
  history: LocalGameRecord[];
}

const KEY = gameStorageKey("local-progress");
const HISTORY_LIMIT = 10;

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

export function emptyProgress(): LocalProgress {
  return { games: 0, wins: 0, byColor: {}, history: [] };
}

export function readLocalProgress(storage: ProgressStorage | null = browserStorage()): LocalProgress {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Partial<LocalProgress>;
    return {
      games: Number(parsed.games) || 0,
      wins: Number(parsed.wins) || 0,
      byColor: parsed.byColor ?? {},
      history: Array.isArray(parsed.history) ? parsed.history.slice(0, HISTORY_LIMIT) : [],
    };
  } catch {
    return emptyProgress();
  }
}

export function recordLocalGame(
  state: LudoState,
  steps: LocalGameRecord["steps"] = [],
  storage: ProgressStorage | null = browserStorage(),
): LocalProgress {
  const progress = readLocalProgress(storage);
  const winner = state.winner === null
    ? null
    : state.players[state.winner]?.color ?? null;
  progress.games += 1;
  if (winner) progress.wins += 1;
  for (const player of state.players) {
    const previous = progress.byColor[player.color] ?? { games: 0, wins: 0 };
    progress.byColor[player.color] = {
      games: previous.games + 1,
      wins: previous.wins + (player.seat === state.winner ? 1 : 0),
    };
  }
  progress.history = [
    {
      id: `${Date.now()}-${state.action}`,
      at: Date.now(),
      seats: state.playerCount,
      winner,
      moves: state.action,
      steps: steps.slice(-40),
    },
    ...progress.history,
  ].slice(0, HISTORY_LIMIT);
  storage?.setItem(KEY, JSON.stringify(progress));
  return progress;
}

export function clearLocalProgress(storage: ProgressStorage | null = browserStorage()): void {
  storage?.removeItem(KEY);
}
