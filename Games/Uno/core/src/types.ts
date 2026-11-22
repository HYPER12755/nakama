export type Color =
  | "red"
  | "yellow"
  | "green"
  | "blue"
  | "pink"
  | "teal"
  | "orange"
  | "purple";

export type FlipSide = "light" | "dark";

export type GameMode =
  | "classic"
  | "sevenO"
  | "progressive"
  | "jumpIn"
  | "attack"
  | "noMercy"
  | "flip"
  | "swapPack"
  | "reversePack";

export type CardKind =
  | "number"
  | "skip"
  | "reverse"
  | "draw2"
  | "wild"
  | "wild4"
  | "hit1"
  | "hit2"
  | "discardAll"
  | "wildAttack"
  | "draw4"
  | "skipEveryone"
  | "wildDraw6"
  | "wildDraw10"
  | "wildReverse4"
  | "wildRoulette"
  | "draw1"
  | "flip"
  | "draw5"
  | "wildDraw2"
  | "wildDrawColor"
  | "swap1"
  | "refreshHand"
  | "wildForceTrade"
  | "wildPassHands"
  | "reverseDraw2"
  | "reverseSkip"
  | "wildPowerReverse"
  | "wildNoU";

export interface Card {
  id: string;
  color: Color | null;
  kind: CardKind;
  value?: number;
}

export type UnoErrorCode =
  | "not_your_turn"
  | "illegal_card"
  | "bad_challenge"
  | "game_over"
  | "unknown_card"
  | "missing_color"
  | "missing_target"
  | "jump_window_open"
  | "bad_jump";

export interface GameEvent {
  type: string;
  playerId?: string;
  cardId?: string;
  text?: string;
  at: number;
}

export interface ReplayStep {
  playerId: string;
  action: string;
  cardId?: string;
  color?: Color;
  targetId?: string;
  giveCardId?: string;
  tradeWithId?: string;
  receivedCardId?: string;
  count?: number;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  out: boolean;
}

export interface PendingChallenge {
  ownerId: string;
  targetId: string;
  legal: boolean;
  kind?: CardKind;
  amount?: number;
  color?: Color;
}

export type StackKind = "draw2" | "wild4" | "draw4" | "wildReverse4" | "wildDraw6" | "wildDraw10";

export interface PendingStack {
  kind: StackKind;
  amount: number;
  value?: number;
  ownerId: string;
  targetId: string;
  legal?: boolean;
  color?: Color;
  pendingWinnerId?: string;
}

export interface PendingHit {
  amount: number;
  ownerId: string;
  targetId: string;
}

export interface PendingRoulette {
  chooserId: string;
  ownerId: string;
}

export interface JumpWindow {
  cardId: string;
  ownerId: string;
  expiresAt: number;
}

export interface StartingRule {
  kind: CardKind;
  color?: Color;
  turn: number;
  direction: 1 | -1;
  drewCards: string[];
}

export interface GameState {
  version: number;
  mode: GameMode;
  seed: number;
  drawPile: Card[];
  discard: Card[];
  players: Player[];
  turn: number;
  direction: 1 | -1;
  currentColor: Color;
  flipSide: FlipSide;
  drawnCardId: string | null;
  pendingChallenge: PendingChallenge | null;
  pendingStack: PendingStack | null;
  pendingHit: PendingHit | null;
  pendingRoulette: PendingRoulette | null;
  jumpWindow: JumpWindow | null;
  startingRule: StartingRule | null;
  started: boolean;
  finished: boolean;
  winner: string | null;
  events: GameEvent[];
  replay: ReplayStep[];
  createdAt: number;
}

export type Action =
  | {
      type: "play";
      playerId: string;
      cardId: string;
      chosenColor?: Color;
      targetId?: string;
      target_id?: string;
      giveCardId?: string;
      give_card_id?: string;
      tradeWithId?: string;
      trade_with_id?: string;
      jump?: boolean;
    }
  | { type: "draw"; playerId: string }
  | { type: "challenge"; playerId: string; accept: boolean }
  | { type: "chooseColour" | "chooseColor"; playerId: string; color?: Color; colour?: Color; chosenColor?: Color };

export interface MoveResult {
  state: GameState;
  ok: boolean;
  error?: UnoErrorCode;
}

export interface LegalMoves {
  cards: string[];
  canDraw: boolean;
}

export const LIGHT_COLORS: Color[] = ["red", "yellow", "green", "blue"];
export const DARK_COLORS: Color[] = ["pink", "teal", "orange", "purple"];
export const ALL_COLORS: Color[] = [...LIGHT_COLORS, ...DARK_COLORS];
export const COLORS: Color[] = LIGHT_COLORS;

const FLIP_COLOR_MAP: Record<string, Color> = {
  red: "pink",
  pink: "red",
  yellow: "orange",
  orange: "yellow",
  green: "teal",
  teal: "green",
  blue: "purple",
  purple: "blue",
};

export function flipColor(color: Color): Color {
  return FLIP_COLOR_MAP[color] ?? color;
}

export function colorsForSide(side: FlipSide): readonly Color[] {
  return side === "dark" ? DARK_COLORS : LIGHT_COLORS;
}

export const DEFAULT_RULES = {
  handSize: 7,
  startingScore: 0,
  winningScore: 500,
  drawTwoAmount: 2,
  wildFourAmount: 4,
  challengePenalty: 6,
  mercyLimit: 25,
  drawFourAmount: 4,
  wildDrawSixAmount: 6,
  wildDrawTenAmount: 10,
  wildReverseFourAmount: 4,
} as const;
