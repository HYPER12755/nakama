import {
  legalMoves,
  normalizeMode,
  UNO_MODE,
  UNO_MODES,
  type Card,
  type Color,
  type GameMode,
  type GameState,
} from "@moongames/uno-core";

export type RulesMode = GameMode;

const PROGRESSIVE_MODE: RulesMode = "progressive";
export const JUMP_IN_MODE: RulesMode = "jumpIn";
const ATTACK_MODE: RulesMode = UNO_MODE.ATTACK;

const JUMP_IN_ALIASES = ["jumpIn", "jump_in", "jump-in", "jumpin"];

export const RULES_MODES: RulesMode[] = (() => {
  const modes = [...UNO_MODES] as RulesMode[];
  for (const extra of [PROGRESSIVE_MODE, JUMP_IN_MODE, ATTACK_MODE]) {
    if (!modes.includes(extra)) {
      modes.push(extra);
    }
  }
  return modes;
})();

function isJumpInValue(value: unknown): boolean {
  return typeof value === "string" && JUMP_IN_ALIASES.includes(value);
}

export function rulesModeLabel(mode: RulesMode | undefined): string {
  if (isJumpInValue(mode)) {
    return "Jump-In";
  }
  if ((mode as string | undefined) === PROGRESSIVE_MODE) {
    return "Progressive";
  }
  if (mode === ATTACK_MODE) {
    return "Attack";
  }
  return mode === "sevenO" ? "Seven-O" : "Classic";
}

export function normalizeRulesMode(value: unknown): RulesMode {
  if (isJumpInValue(value)) {
    return JUMP_IN_MODE;
  }
  const normalized = normalizeMode(value);
  if (normalized === ("classic" as RulesMode) && value === PROGRESSIVE_MODE) {
    return PROGRESSIVE_MODE;
  }
  return normalized;
}

export interface JumpWindow {
  cardId: string;
  ownerId: string;
  expiresAt: number;
}

export function normalizeJumpWindow(value: unknown): JumpWindow | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const cardId = String(source.cardId ?? source.card_id ?? "");
  const ownerId = String(source.ownerId ?? source.owner_id ?? "");
  const expiresAt = Number(source.expiresAt ?? source.expires_at ?? source.expires ?? 0);
  if (cardId === "" || !Number.isFinite(expiresAt) || expiresAt <= 0) {
    return null;
  }
  return { cardId, ownerId, expiresAt: Math.trunc(expiresAt) };
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

export interface PendingHit {
  amount: number;
  ownerId: string;
  targetId: string;
}

export function normalizePendingHit(value: unknown): PendingHit | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const amount = Number(source.amount ?? source.value ?? source.count ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return {
    amount: Math.trunc(amount),
    ownerId: String(source.ownerId ?? source.owner_id ?? ""),
    targetId: String(source.targetId ?? source.target_id ?? ""),
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
  pendingHit?: PendingHit | null;
  jumpWindow?: JumpWindow | null;
  legalCards: string[];
  canDraw: boolean;
  result: { status: string; winnerUserId: string | null; reason?: string } | null;
  myUserId: string | null;
  started: boolean;
  mode?: GameMode;
}

export function isJumpCandidate(view: BoardView, cardId: string): boolean {
  const jumpWindow = view.jumpWindow ?? null;
  if (jumpWindow === null || jumpWindow.ownerId === view.myUserId) {
    return false;
  }
  if (!view.legalCards.includes(cardId)) {
    return false;
  }
  const topCard = view.topCard;
  if (topCard === null || topCard.id !== jumpWindow.cardId) {
    return true;
  }
  const card = view.players
    .find((player) => player.userId === view.myUserId)
    ?.hand?.find((entry) => entry.id === cardId);
  if (card === undefined) {
    return true;
  }
  return card.kind === "number" && topCard.kind === "number"
    && card.color === topCard.color && card.value === topCard.value;
}

export function viewFromCore(state: GameState | null, myUserId: string | null): BoardView {
  if (state === null) {
    return {
      players: [], spectators: [], chat: [], topCard: null, currentColor: null,
      turn: 0, direction: 1, deckCount: 0, pendingChallenge: null,
      pendingStack: null, pendingHit: null, jumpWindow: null, legalCards: [], canDraw: false, result: null,
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
    pendingHit: normalizePendingHit(rawState.pendingHit ?? rawState.pending_hit),
    jumpWindow: normalizeJumpWindow(rawState.jumpWindow ?? rawState.jump_window),
    legalCards: myUserId === null ? [] : legalMoves(state, myUserId, Date.now()).cards,
    canDraw: myUserId !== null && legalMoves(state, myUserId, Date.now()).canDraw,
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
