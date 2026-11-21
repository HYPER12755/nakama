import { canPlay, legalMoves, mostCommonColor } from "./rules";
import type { Action, Card, Color, GameState } from "./types";

function cardScore(state: GameState, card: Card): number {
  if (card.kind === "wild4") return 100;
  if (card.kind === "wild") return 90;
  if (card.kind === "draw2") return 80;
  if (card.kind === "skip" || card.kind === "reverse") return 70;
  if (card.color === state.currentColor) return 50 + (card.value ?? 0);
  return 40 + (card.value ?? 0);
}

export function chooseAction(state: GameState, playerId: string): Action | null {
  if (state.pendingChallenge !== null) {
    if (state.pendingChallenge.targetId !== playerId) {
      return null;
    }
    return { type: "challenge", playerId, accept: !state.pendingChallenge.legal };
  }
  const moves = legalMoves(state, playerId);
  if (moves.cards.length === 0) {
    return moves.canDraw ? { type: "draw", playerId } : null;
  }
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    return null;
  }
  let best: Card | null = null;
  let bestScore = -1;
  for (const id of moves.cards) {
    const card = player.hand.find((candidate) => candidate.id === id);
    if (card === undefined) continue;
    const score = cardScore(state, card);
    if (score > bestScore) {
      best = card;
      bestScore = score;
    }
  }
  if (best === null) {
    return { type: "draw", playerId };
  }
  const chosenColor: Color | undefined =
    best.kind === "wild" || best.kind === "wild4" ? mostCommonColor(player.hand) : undefined;
  return {
    type: "play",
    playerId,
    cardId: best.id,
    ...(chosenColor === undefined ? {} : { chosenColor }),
  };
}

export function canRespondToChallenge(state: GameState, playerId: string): boolean {
  return state.pendingChallenge?.targetId === playerId;
}

export function colorAlreadyChosen(state: GameState, card: Card): boolean {
  return canPlay(state, card);
}
