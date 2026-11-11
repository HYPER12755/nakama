import type {
  ChessState,
  Color,
  MoveRecord,
} from "@moongames/chess-core";

/** Wire opcodes shared with Games/Chess/server/chess_protocol.lua. */
export const ONLINE_OP = {
  STATE: 1,
  CLOCK: 2,
  MOVE: 3,
  GAME_OVER: 4,
  DRAW_OFFER: 5,
  DRAW_DECLINED: 6,
  ERROR: 7,
  PLAYER_JOINED: 8,
  PLAYER_LEFT: 9,
  MATCH_STARTED: 10,
  PONG: 11,
  SPECTATOR_JOINED: 12,
  SPECTATOR_LEFT: 13,
  MOVE_REQUEST: 101,
  RESIGN: 102,
  DRAW_OFFER_REQUEST: 103,
  DRAW_ACCEPT: 104,
  DRAW_DECLINE: 105,
  REQUEST_STATE: 106,
  PING: 107,
} as const;

export type OnlineConnectionStatus =
  | "offline"
  | "connecting"
  | "connected"
  | "error";

export interface OnlineTimeControl {
  initialMs: number;
  incrementMs: number;
}

export interface OnlinePlayer {
  userId: string;
  username: string;
  color: Color;
  connected: boolean;
  remainingMs: number;
}

export interface OnlineSpectator {
  userId: string;
  username: string;
}

export interface OnlineClock {
  whiteMs: number;
  blackMs: number;
  turn: Color;
  runningSince?: number | null;
  serverTime?: number;
}

export interface OnlineMatchInfo {
  id: string;
  mode: "quick" | "private";
  rated: boolean;
  started: boolean;
  open: boolean;
  timeControl: OnlineTimeControl;
}

export interface OnlineResult {
  status: string;
  winnerColor?: Color | null;
  winnerUserId?: string | null;
  reason: string;
  endedAt: number;
}

export interface OnlineDrawOffer {
  by: Color;
  userId: string;
  expiresAt: number;
}

export interface OnlineStatePayload {
  state: ChessState;
  match: OnlineMatchInfo;
  players: OnlinePlayer[];
  spectators: OnlineSpectator[];
  clock: OnlineClock;
  result?: OnlineResult | null;
  drawOffer?: OnlineDrawOffer | null;
  serverTime: number;
  move?: MoveRecord;
}

export interface OnlineRpcError {
  code: string;
  message: string;
}

export interface OnlineRpcResponse {
  ok: boolean;
  matchId?: string;
  mode?: "quick" | "private";
  timeControl?: OnlineTimeControl;
  error?: OnlineRpcError;
}

export interface OnlineProfile {
  username: string;
  rating: number;
  peakRating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  ratedGames: number;
  casualGames: number;
  updatedAt: number;
}

export interface OnlineHistoryEntry {
  matchId: string;
  mode: "quick" | "private";
  rated: boolean;
  color: Color;
  outcome: "win" | "loss" | "draw" | "abandoned";
  status: string;
  reason: string;
  winnerColor?: Color | null;
  opponent: {
    userId: string;
    username: string;
  };
  moves: number;
  sans?: string[];
  pgn: string;
  finalFen?: string;
  timeControl: OnlineTimeControl;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  endedAt: number;
}

export interface OnlineLeaderboardMetadata {
  wins?: number;
  losses?: number;
  draws?: number;
  games?: number;
  rated?: boolean;
  mode?: "quick" | "private";
}

export interface OnlineLeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  rating: number;
  metadata?: OnlineLeaderboardMetadata;
}

export interface OnlineProfilePayload {
  ok: boolean;
  profile?: OnlineProfile;
  history?: OnlineHistoryEntry[];
  error?: OnlineRpcError;
}

export interface OnlineLeaderboardPayload {
  ok: boolean;
  entries?: OnlineLeaderboardEntry[];
  me?: OnlineLeaderboardEntry | null;
  total?: number;
  error?: OnlineRpcError;
}

export interface OnlineSessionInfo {
  userId: string;
  username: string;
}

export interface ServerAddress {
  host: string;
  port: string;
  useSSL: boolean;
  label: string;
}

export const TIME_CONTROLS: Array<{
  id: string;
  label: string;
  initialMs: number;
  incrementMs: number;
}> = [
  { id: "3+2", label: "3 + 2", initialMs: 180000, incrementMs: 2000 },
  { id: "5+0", label: "5 + 0", initialMs: 300000, incrementMs: 0 },
  { id: "10+0", label: "10 + 0", initialMs: 600000, incrementMs: 0 },
  { id: "15+10", label: "15 + 10", initialMs: 900000, incrementMs: 10000 },
];

export function defaultServerAddress(): string {
  const configuredHost = import.meta.env.VITE_NAKAMA_HOST as
    | string
    | undefined;
  const configuredPort = import.meta.env.VITE_NAKAMA_PORT as
    | string
    | undefined;
  const configuredSSL = import.meta.env.VITE_NAKAMA_SSL as
    | string
    | undefined;

  const host =
    configuredHost ||
    (typeof window !== "undefined" ? window.location.hostname : "") ||
    "127.0.0.1";
  const port = configuredPort || "7350";
  const useSSL = configuredSSL === "true";

  return `${useSSL ? "https" : "http"}://${host}:${port}`;
}

export function parseServerAddress(input: string): ServerAddress {
  const trimmed = input.trim() || defaultServerAddress();
  const withProtocol = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  const url = new URL(withProtocol);
  const useSSL = url.protocol === "https:";
  const port = url.port || (useSSL ? "443" : "80");
  const host = url.hostname;

  return {
    host,
    port,
    useSSL,
    label: `${useSSL ? "https" : "http"}://${host}:${port}`,
  };
}

export function normalizeChessState(
  raw: Partial<ChessState> & {
    history?: MoveRecord[];
    board?: ChessState["board"];
    legalMoves?: ChessState["legalMoves"];
  },
): ChessState {
  return {
    fen: raw.fen ?? "",
    turn: raw.turn ?? "w",
    status: raw.status ?? "active",
    winner: raw.winner ?? null,
    inCheck: raw.inCheck ?? false,
    moveNumber: raw.moveNumber ?? 1,
    history: Array.isArray(raw.history) ? raw.history : [],
    lastMove: raw.lastMove ?? null,
    board: Array.isArray(raw.board) ? raw.board : [],
    legalMoves:
      raw.legalMoves !== null && typeof raw.legalMoves === "object"
        ? raw.legalMoves
        : {},
  };
}

export function normalizedOnlineState(
  payload: OnlineStatePayload,
): OnlineStatePayload {
  return {
    ...payload,
    state: normalizeChessState(payload.state),
    players: Array.isArray(payload.players) ? payload.players : [],
    spectators: Array.isArray(payload.spectators) ? payload.spectators : [],
    drawOffer: payload.drawOffer ?? null,
    result: payload.result ?? null,
  };
}

export function pgnFromHistory(history: MoveRecord[]): string {
  const parts: string[] = [];

  history.forEach((move, index) => {
    if (index % 2 === 0) {
      parts.push(`${index / 2 + 1}.`);
    }
    parts.push(move.san);
  });

  return parts.join(" ");
}

export function formatClock(ms: number): string {
  const safe = Math.max(0, Math.floor(ms));
  const totalSeconds = Math.ceil(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function clockForColor(
  clock: OnlineClock,
  color: Color,
  serverNow: number,
): number {
  const base = color === "w" ? clock.whiteMs : clock.blackMs;
  if (
    clock.turn !== color ||
    clock.runningSince === null ||
    clock.runningSince === undefined ||
    clock.serverTime === undefined
  ) {
    return base;
  }

  const elapsed = Math.max(0, serverNow - clock.serverTime);
  return Math.max(0, base - elapsed);
}
