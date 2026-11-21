import { legalMoves, type Card, type Color, type GameState } from "@moongames/uno-core";

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
  pendingChallenge: { targetId: string; legal: boolean } | null;
  legalCards: string[];
  canDraw: boolean;
  result: { status: string; winnerUserId: string | null; reason?: string } | null;
  myUserId: string | null;
  started: boolean;
}

export function viewFromCore(state: GameState | null, myUserId: string | null): BoardView {
  if (state === null) {
    return {
      players: [], spectators: [], chat: [], topCard: null, currentColor: null,
      turn: 0, direction: 1, deckCount: 0, pendingChallenge: null,
      legalCards: [], canDraw: false, result: null, myUserId, started: false,
    };
  }
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
      targetId: state.pendingChallenge.targetId,
      legal: state.pendingChallenge.legal,
    },
    legalCards: myUserId === null ? [] : legalMoves(state, myUserId).cards,
    canDraw: myUserId !== null && legalMoves(state, myUserId).canDraw,
    result: state.finished
      ? { status: "finished", winnerUserId: state.winner }
      : null,
    myUserId,
    started: state.started,
  };
}

export function normalizeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
