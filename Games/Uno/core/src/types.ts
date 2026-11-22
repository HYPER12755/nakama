export type Color = "red" | "yellow" | "green" | "blue";

export type CardKind = "number" | "skip" | "reverse" | "draw2" | "wild" | "wild4";

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
  | "missing_color";

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
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
}

export interface PendingChallenge {
  ownerId: string;
  targetId: string;
  legal: boolean;
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
  seed: number;
  drawPile: Card[];
  discard: Card[];
  players: Player[];
  turn: number;
  direction: 1 | -1;
  currentColor: Color;
  drawnCardId: string | null;
  pendingChallenge: PendingChallenge | null;
  startingRule: StartingRule | null;
  started: boolean;
  finished: boolean;
  winner: string | null;
  events: GameEvent[];
  replay: ReplayStep[];
  createdAt: number;
}

export type Action =
  | { type: "play"; playerId: string; cardId: string; chosenColor?: Color }
  | { type: "draw"; playerId: string }
  | { type: "challenge"; playerId: string; accept: boolean };

export interface MoveResult {
  state: GameState;
  ok: boolean;
  error?: UnoErrorCode;
}

export interface LegalMoves {
  cards: string[];
  canDraw: boolean;
}

export const COLORS: Color[] = ["red", "yellow", "green", "blue"];

export const DEFAULT_RULES = {
  handSize: 7,
  startingScore: 0,
  winningScore: 500,
  drawTwoAmount: 2,
  wildFourAmount: 4,
  challengePenalty: 6,
} as const;
