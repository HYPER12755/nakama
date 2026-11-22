import {
  legalMoves,
  normalizeMode,
  UNO_MODES,
  type Card,
  type Color,
  type GameMode,
  type GameState,
} from "@moongames/uno-core";

export type RulesMode = GameMode;

const PROGRESSIVE_MODE = "progressive" as unknown as RulesMode;

export const RULES_MODES: RulesMode[] = (() => {
  const modes = [...UNO_MODES] as RulesMode[];
  if (!modes.includes(PROGRESSIVE_MODE)) {
    modes.push(PROGRESSIVE_MODE);
  }
  return modes;
})();

export function rulesModeLabel(mode: RulesMode | undefined): string {
  if ((mode as string | undefined) === PROGRESSIVE_MODE) {
    return "Progressive";
  }
  return mode === "sevenO" ? "Seven-O" : "Classic";
}

export function normalizeRulesMode(value: unknown): RulesMode {
  const normalized = normalizeMode(value);
  if (normalized === ("classic" as RulesMode) && value === PROGRESSIVE_MODE) {
    return PROGRESSIVE_MODE;
  }
  return normalized;
}

export interface PendingStack {
  ownerId: string;
  targetId: string;
  kind: "draw2" | "wild4";
  count: number;
}

export function normalizePendingStack(value: unknown): PendingStack | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const rawKind = String(source.kind ?? source.stackKind ?? source.type ?? "draw2");
  const kind: PendingStack["kind"] = rawKind === "wild4" || rawKind === "wild_four"
    ? "wild4"
    : "draw2";
  const rawCount = source.count ?? source.amount ?? source.value ?? source.size
    ?? (Array.isArray(source.cards) ? source.cards.length : undefined);
  const count = Number(rawCount ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  return {
    ownerId: String(source.ownerId ?? source.owner_id ?? ""),
    targetId: String(source.targetId ?? source.target_id ?? ""),
    kind,
    count: Math.trunc(count),
  };
}

export interface BoardPlayer {
  seat: number;
  userId: string;
  username: string;
  connected: boolean;
  count: number;
  hand?: Card[];
}

export interface BoardChat {
  id: string;
  userId: string;
  username: string;
  text: string;
  at: number;
  sentAt: number;
}

export interface BoardView {
  players: BoardPlayer[];
  spectators: BoardPlayer[];
  chat: BoardChat[];
  topCard: Card | null;
  currentColor: Color | null;
  turn: number;
  direction: 1 | -1;
  deckCount: number;
  pendingChallenge: { ownerId: string; targetId: string; legal: boolean } | null;
  pendingStack?: PendingStack | null;
  legalCards: string[];
  canDraw: boolean;
  result: { status: string; winnerUserId: string | null; reason?: string } | null;
  myUserId: string | null;
  started: boolean;
  mode?: GameMode;
}

export function viewFromCore(state: GameState | null, myUserId: string | null): BoardView {
  if (state === null) {
    return {
      players: [], spectators: [], chat: [], topCard: null, currentColor: null,
      turn: 0, direction: 1, deckCount: 0, pendingChallenge: null,
      pendingStack: null, legalCards: [], canDraw: false, result: null,
      myUserId, started: false, mode: "classic",
    };
  }
  const rawState = state as unknown as Record<string, unknown>;
  return {
    players: state.players.map((player, index) => ({
      seat: index,
      userId: player.id,
      username: player.name,
      connected: true,
      count: player.hand.length,
      hand: player.id === myUserId ? player.hand : undefined,
    })),
    spectators: [],
    chat: [],
    topCard: state.discard[state.discard.length - 1] ?? null,
    currentColor: state.currentColor,
    turn: state.turn,
    direction: state.direction,
    deckCount: state.drawPile.length,
    pendingChallenge: state.pendingChallenge === null ? null : {
      ownerId: state.pendingChallenge.ownerId,
      targetId: state.pendingChallenge.targetId,
      legal: state.pendingChallenge.legal,
    },
    pendingStack: normalizePendingStack(rawState.pendingStack ?? rawState.pending_stack),
    legalCards: myUserId === null ? [] : legalMoves(state, myUserId).cards,
    canDraw: myUserId !== null && legalMoves(state, myUserId).canDraw,
    result: state.finished
      ? { status: "finished", winnerUserId: state.winner }
      : null,
    myUserId,
    started: state.started,
    mode: normalizeRulesMode(state.mode),
  };
}

export function normalizeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
