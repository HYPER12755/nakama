import {
  ALL_COLORS,
  legalMoves,
  normalizeMode,
  UNO_MODE,
  UNO_MODES,
  type Card,
  type CardKind,
  type Color,
  type FlipSide,
  type GameMode,
  type GameState,
} from "@moongames/uno-core";

export type RulesMode = GameMode;

const PROGRESSIVE_MODE: RulesMode = "progressive";
export const JUMP_IN_MODE: RulesMode = "jumpIn";
export const NO_MERCY_MODE: RulesMode = UNO_MODE.NO_MERCY;
const ATTACK_MODE: RulesMode = UNO_MODE.ATTACK;
export const SWAP_PACK_MODE: RulesMode = UNO_MODE.SWAP_PACK;
export const REVERSE_PACK_MODE: RulesMode = UNO_MODE.REVERSE_PACK;
export const STACK_PACK_MODE: RulesMode = UNO_MODE.STACK_PACK;

const JUMP_IN_ALIASES = ["jumpIn", "jump_in", "jump-in", "jumpin"];
const NO_MERCY_ALIASES = ["noMercy", "no_mercy", "no-mercy", "nomercy"];

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
  const value = String(mode ?? "");
  if (NO_MERCY_ALIASES.includes(value)) {
    return "No Mercy";
  }
  if (isJumpInValue(value)) {
    return "Jump-In";
  }
  if (value === PROGRESSIVE_MODE) {
    return "Progressive";
  }
  if (value === ATTACK_MODE) {
    return "Attack";
  }
  if (value === UNO_MODE.FLIP) {
    return "Flip";
  }
  if (value === SWAP_PACK_MODE) {
    return "Swap Pack";
  }
  if (value === REVERSE_PACK_MODE) {
    return "Reverse Pack";
  }
  if (value === STACK_PACK_MODE) {
    return "Stack Pack";
  }
  return value === "sevenO" ? "Seven-O" : "Classic";
}

export function normalizeRulesMode(value: unknown): RulesMode {
  if (isJumpInValue(value)) {
    return JUMP_IN_MODE;
  }
  if (typeof value === "string" && NO_MERCY_ALIASES.includes(value)) {
    return NO_MERCY_MODE;
  }
  const normalized = normalizeMode(value);
  if (normalized === ("classic" as RulesMode) && value === PROGRESSIVE_MODE) {
    return PROGRESSIVE_MODE;
  }
  return normalized;
}

export function normalizeFlipSide(value: unknown): FlipSide {
  return value === "dark" ? "dark" : "light";
}

export interface PendingChallenge {
  ownerId: string;
  targetId: string;
  legal: boolean;
  kind?: CardKind;
  amount?: number;
  color?: Color;
}

export function normalizePendingChallenge(value: unknown): PendingChallenge | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const result: PendingChallenge = {
    ownerId: String(source.ownerId ?? source.owner_id ?? ""),
    targetId: String(source.targetId ?? source.target_id ?? ""),
    legal: source.legal === true,
  };
  const kind = source.kind ?? source.cardKind ?? source.card_kind;
  if (typeof kind === "string" && kind !== "") {
    result.kind = kind as CardKind;
  }
  const amount = Number(source.amount ?? source.count ?? 0);
  if (Number.isFinite(amount) && amount > 0) {
    result.amount = Math.trunc(amount);
  }
  const color = source.color ?? source.colour ?? source.chosenColor ?? source.chosen_color;
  if (typeof color === "string" && ALL_COLORS.includes(color as Color)) {
    result.color = color as Color;
  }
  return result;
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

export type PendingStackKind =
  | "draw2" | "wild4" | "draw4" | "wildDraw6" | "wildDraw10" | "wildReverse4"
  | "stack1" | "stack2" | "wildStack3" | "wildStackNumber";

export interface PendingStack {
  ownerId: string;
  targetId: string;
  kind: PendingStackKind;
  count: number;
  value?: number;
}

function normalizeStackKind(value: unknown): PendingStackKind {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "wild4" || raw === "wild_four") {
    return "wild4";
  }
  if (raw === "draw4" || raw === "draw_four") {
    return "draw4";
  }
  if (raw === "wilddraw6" || raw === "wild_draw6") {
    return "wildDraw6";
  }
  if (raw === "wilddraw10" || raw === "wild_draw10") {
    return "wildDraw10";
  }
  if (raw === "wildreverse4" || raw === "wild_reverse4") {
    return "wildReverse4";
  }
  if (raw === "stack1") return "stack1";
  if (raw === "stack2") return "stack2";
  if (raw === "wildstack3" || raw === "wild_stack3") return "wildStack3";
  if (raw === "wildstacknumber" || raw === "wild_stack_number") return "wildStackNumber";
  return "draw2";
}

export function normalizePendingStack(value: unknown): PendingStack | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const kind = normalizeStackKind(source.kind ?? source.stackKind ?? source.type);
  const rawCount = source.count ?? source.amount ?? source.value ?? source.size
    ?? (Array.isArray(source.cards) ? source.cards.length : undefined);
  const count = Number(rawCount ?? 0);
  if (!Number.isFinite(count) || count <= 0) {
    return null;
  }
  const rawValue = source.value ?? source.minimum ?? source.required ?? source.stackValue;
  const minimum = Number(rawValue ?? 0);
  return {
    ownerId: String(source.ownerId ?? source.owner_id ?? ""),
    targetId: String(source.targetId ?? source.target_id ?? ""),
    kind,
    count: Math.trunc(count),
    ...(Number.isFinite(minimum) && minimum > 0 ? { value: Math.trunc(minimum) } : {}),
  };
}

export interface PendingRoulette {
  chooserId: string;
  ownerId: string;
}

export function normalizePendingRoulette(value: unknown): PendingRoulette | null {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const chooserId = String(source.chooserId ?? source.chooser_id ?? "");
  const ownerId = String(source.ownerId ?? source.owner_id ?? "");
  if (chooserId === "" && ownerId === "") {
    return null;
  }
  return { chooserId, ownerId };
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
  out?: boolean;
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
  flipSide: FlipSide;
  turn: number;
  direction: 1 | -1;
  deckCount: number;
  pendingChallenge: PendingChallenge | null;
  pendingStack?: PendingStack | null;
  pendingHit?: PendingHit | null;
  pendingRoulette?: PendingRoulette | null;
  jumpWindow?: JumpWindow | null;
  legalCards: string[];
  canDraw: boolean;
  result: { status: string; winnerUserId: string | null; reason?: string } | null;
  myUserId: string | null;
  started: boolean;
  mode?: GameMode;
  rulesMode?: RulesMode;
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
      flipSide: "light", turn: 0, direction: 1, deckCount: 0, pendingChallenge: null,
      pendingStack: null, pendingHit: null, pendingRoulette: null, jumpWindow: null,
      legalCards: [], canDraw: false, result: null,
      myUserId, started: false, mode: "classic", rulesMode: "classic",
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
      out: player.out === true,
      hand: player.id === myUserId ? player.hand : undefined,
    })),
    spectators: [],
    chat: [],
    topCard: state.discard[state.discard.length - 1] ?? null,
    currentColor: state.currentColor,
    flipSide: normalizeFlipSide(state.flipSide ?? (rawState.flip_side as unknown)),
    turn: state.turn,
    direction: state.direction,
    deckCount: state.drawPile.length,
    pendingChallenge: normalizePendingChallenge(state.pendingChallenge ?? rawState.pending_challenge),
    pendingStack: normalizePendingStack(rawState.pendingStack ?? rawState.pending_stack),
    pendingHit: normalizePendingHit(rawState.pendingHit ?? rawState.pending_hit),
    pendingRoulette: normalizePendingRoulette(rawState.pendingRoulette ?? rawState.pending_roulette),
    jumpWindow: normalizeJumpWindow(rawState.jumpWindow ?? rawState.jump_window),
    legalCards: myUserId === null ? [] : legalMoves(state, myUserId, Date.now()).cards,
    canDraw: myUserId !== null && legalMoves(state, myUserId, Date.now()).canDraw,
    result: state.finished
      ? { status: "finished", winnerUserId: state.winner }
      : null,
    myUserId,
    started: state.started,
    mode: normalizeRulesMode(state.mode),
    rulesMode: normalizeRulesMode(state.mode),
  };
}

export function normalizeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
