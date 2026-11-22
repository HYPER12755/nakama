import { UNO_MODE } from "./protocol";
import { canPlay, legalMoves, mostCommonColor } from "./rules";
import type { Action, Card, Color, GameState, Player } from "./types";

function cardScore(state: GameState, card: Card): number {
  if (card.kind === "discardAll") return 120;
  if (card.kind === "wildAttack") return 110;
  if (card.kind === "hit2") return 106;
  if (card.kind === "hit1") return 105;
  if (card.kind === "wild4") return 100;
  if (card.kind === "wild") return 90;
  if (card.kind === "draw2") return 80;
  if (card.kind === "skip" || card.kind === "reverse") return 70;
  if (card.color === state.currentColor) return 50 + (card.value ?? 0);
  return 40 + (card.value ?? 0);
}

function pickTarget(state: GameState, playerId: string): string | null {
  let best: Player | null = null;
  for (const player of state.players) {
    if (player.id === playerId) {
      continue;
    }
    if (best === null || player.hand.length > best.hand.length) {
      best = player;
    }
  }
  return best === null ? null : best.id;
}

export function chooseAction(state: GameState, playerId: string, now = 0): Action | null {
  if (state.mode === UNO_MODE.JUMP_IN && state.jumpWindow !== null && now < state.jumpWindow.expiresAt) {
    const window = state.jumpWindow;
    if (playerId === window.ownerId) {
      return null;
    }
    const player = state.players.find((candidate) => candidate.id === playerId);
    const windowCard = state.discard[state.discard.length - 1];
    if (player === undefined || windowCard === undefined || windowCard.id !== window.cardId
      || windowCard.kind !== "number") {
      return null;
    }
    const matching = player.hand.find((card) => card.kind === "number" && card.color === windowCard.color
      && card.value === windowCard.value);
    if (matching === undefined) {
      return null;
    }
    return { type: "play", playerId, cardId: matching.id, jump: true };
  }
  if (state.pendingHit !== null) {
    if (state.pendingHit.targetId !== playerId) {
      return null;
    }
    const target = state.players.find((candidate) => candidate.id === playerId);
    if (target === undefined) {
      return null;
    }
    const deflection = target.hand.find((card) => (
      card.kind === "hit1" || card.kind === "hit2" || card.kind === "wildAttack"
    ));
    if (deflection === undefined) {
      return { type: "draw", playerId };
    }
    if (deflection.kind !== "wildAttack") {
      return { type: "play", playerId, cardId: deflection.id };
    }
    const redirect = pickTarget(state, playerId);
    return {
      type: "play",
      playerId,
      cardId: deflection.id,
      chosenColor: mostCommonColor(target.hand),
      ...(redirect === null ? {} : { targetId: redirect }),
    };
  }
  if (state.pendingStack !== null) {
    if (state.pendingStack.targetId !== playerId) {
      return null;
    }
    const stackPlayer = state.players.find((candidate) => candidate.id === playerId);
    if (stackPlayer === undefined) {
      return null;
    }
    const matching = stackPlayer.hand.find((card) => card.kind === state.pendingStack?.kind);
    if (matching !== undefined) {
      const chosenColor: Color | undefined = matching.kind === "wild4"
        ? mostCommonColor(stackPlayer.hand)
        : undefined;
      return {
        type: "play",
        playerId,
        cardId: matching.id,
        ...(chosenColor === undefined ? {} : { chosenColor }),
      };
    }
    if (state.pendingStack.kind === "wild4" && state.pendingChallenge !== null) {
      return { type: "challenge", playerId, accept: !state.pendingChallenge.legal };
    }
    return { type: "draw", playerId };
  }
  if (state.pendingChallenge !== null) {
    if (state.pendingChallenge.targetId !== playerId) {
      return null;
    }
    return { type: "challenge", playerId, accept: !state.pendingChallenge.legal };
  }
  const moves = legalMoves(state, playerId, now);
  if (moves.cards.length === 0) {
    return moves.canDraw ? { type: "draw", playerId } : null;
  }
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player === undefined) {
    return null;
  }
  const ranked: Card[] = [];
  for (const id of moves.cards) {
    const card = player.hand.find((candidate) => candidate.id === id);
    if (card !== undefined) {
      ranked.push(card);
    }
  }
  ranked.sort((left, right) => cardScore(state, right) - cardScore(state, left));
  let best: Card | null = null;
  let targetId: string | undefined;
  for (const card of ranked) {
    let needsTarget = false;
    if (state.mode === UNO_MODE.SEVEN_O && card.kind === "number" && card.value === 7) {
      needsTarget = true;
    } else if (card.kind === "wildAttack") {
      needsTarget = true;
    }
    if (needsTarget) {
      const target = pickTarget(state, playerId);
      if (target === null) {
        continue;
      }
      targetId = target;
    }
    best = card;
    break;
  }
  if (best === null) {
    return moves.canDraw ? { type: "draw", playerId } : null;
  }
  const chosenColor: Color | undefined =
    best.kind === "wild" || best.kind === "wild4" || best.kind === "wildAttack"
      ? mostCommonColor(player.hand)
      : undefined;
  return {
    type: "play",
    playerId,
    cardId: best.id,
    ...(chosenColor === undefined ? {} : { chosenColor }),
    ...(targetId === undefined ? {} : { targetId }),
  };
}

export function canRespondToChallenge(state: GameState, playerId: string): boolean {
  return state.pendingStack?.targetId === playerId || state.pendingChallenge?.targetId === playerId;
}

export function colorAlreadyChosen(state: GameState, card: Card): boolean {
  return canPlay(state, card);
}
