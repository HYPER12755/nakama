/**
 * Shared game contracts.
 *
 * Every MoonGames title describes its profile, its history, its leaderboard,
 * its account, and its chat with these shapes, so one launcher, one profile
 * panel, and one account drawer work for all of them.
 */

export type GameAccountKind = "guest" | "email" | "host";

export interface GameAccount {
  kind: GameAccountKind;
  username: string;
  userId: string;
}

export interface GameOpponent {
  userId: string;
  username: string;
}

export type GameOutcome = "win" | "loss" | "draw" | "abandoned";

export interface GameTimeControl {
  initialMs: number;
  incrementMs: number;
}

/** The profile every title stores for a player. */
export interface GameProfile {
  username: string;
  rating: number;
  peakRating: number;
  /**
   * How far the rating may be from the truth. A player who has played
   * little has a wide one, and their rating moves more.
   */
  ratingDeviation?: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  ratedGames: number;
  casualGames: number;
  updatedAt: number;
  /** Game specific counters, for example pieces pocketed or queens covered. */
  stats?: Record<string, number>;
}

/**
 * One finished game. `steps` holds the replay: SAN for Chess, the shot list
 * for Carrom, and whatever a future title needs.
 */
export interface GameHistoryEntry {
  matchId: string;
  gameId?: string;
  mode: "quick" | "private";
  rated: boolean;
  outcome: GameOutcome;
  status: string;
  reason: string;
  opponent: GameOpponent;
  ratingBefore?: number;
  ratingAfter?: number;
  ratingDelta: number;
  endedAt: number;
  /** The replay steps, one label per position. */
  steps?: string[];
  /** A short line describing the game. */
  summary?: string;
  /** The final board state, for a board renderer. */
  finalFen?: string;
  /** An exported notation of the game, when the title has one. */
  pgn?: string;
  metadata?: Record<string, unknown>;
}

export interface GameLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  metadata?: Record<string, unknown>;
}

export interface GameChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: number;
  spectator?: boolean;
}
