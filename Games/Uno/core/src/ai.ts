import { UNO_MODE } from "./protocol";
import { canPlay, drawCardValue, legalMoves, mostCommonColor } from "./rules";
import { colorsForSide, type Action, type Card, type Color, type GameState, type Player } from "./types";

const WILD_KINDS: Card["kind"][] = [
  "wild", "wild4", "wildAttack", "wildDraw6", "wildDraw10", "wildReverse4",
  "wildDraw2", "wildDrawColor", "wildForceTrade", "wildPassHands",
  "wildPowerReverse", "wildNoU", "wildStack3", "wildStackNumber",
];

function preferredColor(state: GameState, hand: Card[]): Color {
  const side = state.mode === "flip" ? state.flipSide : "light";
  return mostCommonColor(hand, colorsForSide(side));
}

function cardScore(state: GameState, card: Card): number {
  if (card.kind === "discardAll") return 120;
  if (card.kind === "wildAttack") return 110;
  if (card.kind === "wildDraw10") return 108;
  if (card.kind === "hit2") return 106;
  if (card.kind === "hit1") return 105;
  if (card.kind === "wildDraw6") return 104;
  if (card.kind === "wild4") return 100;
  if (card.kind === "wildReverse4") return 98;
  if (card.kind === "wildRoulette") return 96;
  if (card.kind === "wildDrawColor") return 94;
  if (card.kind === "wildDraw2") return 92;
  if (card.kind === "wildForceTrade") return 115;
  if (card.kind === "refreshHand") return 112;
  if (card.kind === "swap1") return 95;
  if (card.kind === "wildPassHands") return 60;
  if (card.kind === "wildPowerReverse") return 108;
  if (card.kind === "wildNoU") return 118;
  if (card.kind === "wildStackNumber") return 116;
  if (card.kind === "wildStack3") return 114;
  if (card.kind === "stack2") return 96;
  if (card.kind === "stack1") return 94;
  if (card.kind === "wildDoubleSpeed") return 120;
  if (card.kind === "speedUp") return 110;
  if (card.kind === "reverseDraw2") return 84;
  if (card.kind === "reverseSkip") return 74;
  if (card.kind === "wild") return 90;
  if (card.kind === "flip") return 10;
  if (card.kind === "skipEveryone") return 88;
  if (card.kind === "draw4") return 85;
  if (card.kind === "draw2") return 80;
  if (card.kind === "skip" || card.kind === "reverse") return 70;
  if (card.color === state.currentColor) return 50 + (card.value ?? 0);
  return 40 + (card.value ?? 0);
}

function pickTarget(state: GameState, playerId: string): string | null {
  let best: Player | null = null;
  for (const player of state.players) {
    if (player.id === playerId || player.out) {
      continue;
    }
    if (best === null || player.hand.length > best.hand.length) {
      best = player;
    }
  }
  return best === null ? null : best.id;
}

function pickGiveCard(state: GameState, hand: Card[], playedId: string): string | undefined {
  let worst: Card | undefined;
  for (const card of hand) {
    if (card.id === playedId) {
      continue;
    }
    if (worst === undefined || cardScore(state, card) < cardScore(state, worst)) {
      worst = card;
    }
  }
  return worst?.id;
}

export function chooseAction(state: GameState, playerId: string, now = 0): Action | null {
  const actor = state.players.find((candidate) => candidate.id === playerId);
  if (actor === undefined || actor.out) {
    return null;
  }
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
  if (state.pendingRoulette !== null) {
    if (state.pendingRoulette.chooserId !== playerId) {
      return null;
    }
    return { type: "chooseColour", playerId, color: preferredColor(state, actor.hand) };
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
      chosenColor: preferredColor(state, target.hand),
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
    const stack = state.pendingStack;
    if (state.mode === UNO_MODE.STACK_PACK) {
      const stackable = stackPlayer.hand
        .filter((card) => (card.kind === "wildStack3" || card.kind === "wildStackNumber"
          || (card.kind === "stack1" || card.kind === "stack2")
            && (stack.kind === "stack1" || stack.kind === "stack2"
              || stack.kind === "wildStack3" || stack.kind === "wildStackNumber"
              || card.color === stack.color)))
        .sort((left, right) => cardScore(state, right) - cardScore(state, left));
      const matching = stackable[0];
      if (matching !== undefined) {
        return {
          type: "play",
          playerId,
          cardId: matching.id,
          ...(WILD_KINDS.includes(matching.kind)
            ? { chosenColor: preferredColor(state, stackPlayer.hand) }
            : {}),
        };
      }
      return { type: "draw", playerId };
    }
    if (state.mode === UNO_MODE.REVERSE_PACK) {
      const noU = stackPlayer.hand.find((card) => card.kind === "wildNoU");
      if (noU !== undefined) {
        return { type: "play", playerId, cardId: noU.id, chosenColor: preferredColor(state, stackPlayer.hand) };
      }
      return { type: "draw", playerId };
    }
    if (state.mode === UNO_MODE.NO_MERCY) {
      if (stack.ownerId !== playerId) {
        const usable = stackPlayer.hand
          .filter((card) => drawCardValue(card.kind) >= (stack.value ?? 0))
          .sort((left, right) => drawCardValue(left.kind) - drawCardValue(right.kind));
        const matching = usable.find((card) => card.kind !== "wildReverse4");
        if (matching !== undefined) {
          return {
            type: "play",
            playerId,
            cardId: matching.id,
            ...(WILD_KINDS.includes(matching.kind) ? { chosenColor: preferredColor(state, stackPlayer.hand) } : {}),
          };
        }
      }
      return { type: "draw", playerId };
    }
    const matching = stackPlayer.hand.find((card) => card.kind === stack.kind);
    if (matching !== undefined) {
      const chosenColor: Color | undefined = matching.kind === "wild4"
        ? preferredColor(state, stackPlayer.hand)
        : undefined;
      return {
        type: "play",
        playerId,
        cardId: matching.id,
        ...(chosenColor === undefined ? {} : { chosenColor }),
      };
    }
    if (stack.kind === "wild4" && state.pendingChallenge !== null) {
      return { type: "challenge", playerId, accept: !state.pendingChallenge.legal };
    }
    return { type: "draw", playerId };
  }
  if (state.pendingChallenge !== null) {
    if (state.pendingChallenge.targetId !== playerId) {
      return null;
    }
    if (state.mode === UNO_MODE.REVERSE_PACK && actor !== undefined) {
      const noU = actor.hand.find((card) => card.kind === "wildNoU");
      if (noU !== undefined) {
        return { type: "play", playerId, cardId: noU.id, chosenColor: preferredColor(state, actor.hand) };
      }
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
  let giveCardId: string | undefined;
  let tradeWithId: string | undefined;
  for (const card of ranked) {
    let usable = true;
    if ((state.mode === UNO_MODE.SEVEN_O || state.mode === UNO_MODE.NO_MERCY)
      && card.kind === "number" && card.value === 7) {
      const target = pickTarget(state, playerId);
      if (target === null) {
        usable = false;
      } else {
        targetId = target;
      }
    } else if (card.kind === "wildAttack") {
      const target = pickTarget(state, playerId);
      if (target === null) {
        usable = false;
      } else {
        targetId = target;
      }
    } else if (card.kind === "swap1") {
      const target = pickTarget(state, playerId);
      const give = target === null ? undefined : pickGiveCard(state, player.hand, card.id);
      if (target === null || give === undefined) {
        usable = false;
      } else {
        targetId = target;
        giveCardId = give;
      }
    } else if (card.kind === "wildForceTrade") {
      const partner = pickTarget(state, playerId);
      if (partner === null) {
        usable = false;
      } else {
        targetId = playerId;
        tradeWithId = partner;
      }
    }
    if (!usable) {
      continue;
    }
    best = card;
    break;
  }
  if (best === null) {
    return moves.canDraw ? { type: "draw", playerId } : null;
  }
  const chosenColor: Color | undefined = WILD_KINDS.includes(best.kind)
    ? preferredColor(state, player.hand)
    : undefined;
  return {
    type: "play",
    playerId,
    cardId: best.id,
    ...(chosenColor === undefined ? {} : { chosenColor }),
    ...(targetId === undefined ? {} : { targetId }),
    ...(giveCardId === undefined ? {} : { giveCardId }),
    ...(tradeWithId === undefined ? {} : { tradeWithId }),
  };
}

export function canRespondToChallenge(state: GameState, playerId: string): boolean {
  return state.pendingStack?.targetId === playerId || state.pendingChallenge?.targetId === playerId;
}

export function colorAlreadyChosen(state: GameState, card: Card): boolean {
  return canPlay(state, card);
}
