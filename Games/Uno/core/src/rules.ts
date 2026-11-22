import { buildDeck, isActionCard, shuffle } from "./deck";
import { nextSeed, normalizeSeed, randomInt } from "./rng";
import { JUMP_WINDOW_MS, UNO_ERROR, UNO_MODE, normalizeMode } from "./protocol";
import {
  COLORS,
  DEFAULT_RULES,
  type Action,
  type Card,
  type Color,
  type GameMode,
  type GameState,
  type LegalMoves,
  type MoveResult,
  type PendingStack,
  type Player,
  type StartingRule,
  type UnoErrorCode,
} from "./types";

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1];
}

function pressLauncher(state: GameState): number {
  const amount = randomInt(state.seed, 4);
  state.seed = nextSeed(state.seed);
  return amount;
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.turn];
}

export function canPlay(state: GameState, card: Card): boolean {
  if (card.kind === "wild" || card.kind === "wild4" || card.kind === "wildAttack") {
    return true;
  }
  const top = topCard(state);
  if (card.color === state.currentColor) {
    return true;
  }
  if (card.kind === "number" && top.kind === "number") {
    return card.value === top.value;
  }
  return card.kind === top.kind;
}

export function legalMoves(state: GameState, playerId: string, now = 0): LegalMoves {
  const empty: LegalMoves = { cards: [], canDraw: false };
  if (state.finished) {
    return empty;
  }
  const window = state.mode === UNO_MODE.JUMP_IN ? state.jumpWindow : null;
  if (window !== null && now < window.expiresAt) {
    if (playerId === window.ownerId) {
      return empty;
    }
    const viewer = state.players.find((candidate) => candidate.id === playerId);
    const windowCard = topCard(state);
    if (viewer === undefined || windowCard.id !== window.cardId || windowCard.kind !== "number") {
      return empty;
    }
    const cards = viewer.hand
      .filter((card) => card.kind === "number" && card.color === windowCard.color
        && card.value === windowCard.value)
      .map((card) => card.id);
    return { cards, canDraw: false };
  }
  if (state.pendingHit !== null) {
    if (state.pendingHit.targetId !== playerId) {
      return empty;
    }
    const target = state.players.find((candidate) => candidate.id === playerId);
    if (target === undefined) {
      return empty;
    }
    const cards = target.hand
      .filter((card) => card.kind === "hit1" || card.kind === "hit2" || card.kind === "wildAttack")
      .map((card) => card.id);
    return { cards, canDraw: true };
  }
  if (state.pendingStack !== null) {
    if (state.pendingStack.targetId !== playerId) {
      return empty;
    }
    const stackPlayer = state.players.find((candidate) => candidate.id === playerId);
    if (stackPlayer === undefined) {
      return empty;
    }
    const cards = stackPlayer.hand
      .filter((card) => card.kind === state.pendingStack?.kind)
      .map((card) => card.id);
    return { cards, canDraw: true };
  }
  if (state.pendingChallenge !== null) {
    return empty;
  }
  const player = currentPlayer(state);
  if (player.id !== playerId) {
    return empty;
  }
  const playable = (card: Card): boolean => canPlayCard(state, player, card);
  const cards = state.mode === UNO_MODE.ATTACK || state.drawnCardId === null
    ? player.hand.filter(playable).map((card) => card.id)
    : player.hand.filter((card) => card.id === state.drawnCardId && playable(card)).map((card) => card.id);
  return {
    cards,
    canDraw: state.mode === UNO_MODE.ATTACK || state.drawnCardId === null,
  };
}

export function clearJumpWindow(state: GameState, now: number): GameState {
  if (state.jumpWindow === null || now < state.jumpWindow.expiresAt) {
    return state;
  }
  const next = cloneState(state);
  next.jumpWindow = null;
  return next;
}

export function createGame(
  seed: number | string,
  players: Array<{ id: string; name: string }>,
  now = 0,
  mode: GameMode = UNO_MODE.CLASSIC,
): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Uno needs two to four players");
  }
  const rulesMode = normalizeMode(mode);
  let state_seed = normalizeSeed(seed);
  const shuffled = shuffle(state_seed, buildDeck(rulesMode));
  const deck = shuffled.cards;
  state_seed = shuffled.seed;

  const dealt: Player[] = players.map((player) => ({
    id: player.id,
    name: player.name,
    hand: deck.splice(0, DEFAULT_RULES.handSize),
  }));

  let starter = deck.pop();
  if (starter === undefined) {
    throw new Error("the deck is empty");
  }
  while (starter.kind === "wild4") {
    deck.unshift(starter);
    state_seed = nextSeed(state_seed);
    const next = deck.pop();
    if (next === undefined) {
      throw new Error("the deck is empty");
    }
    starter = next;
  }

  if (starter.kind === "wild" || starter.kind === "wildAttack") {
    starter.color = mostCommonColor(dealt[0].hand);
  }
  const color = starter.color;
  if (color === null) {
    throw new Error("the starting card has no colour");
  }

  const startingRule: StartingRule = {
    kind: starter.kind,
    color,
    turn: 0,
    direction: 1,
    drewCards: [],
  };
  if (starter.kind === "wild") {
    startingRule.turn = 0;
  }
  if (starter.kind === "skip") {
    startingRule.turn = 1 % dealt.length;
  } else if (starter.kind === "reverse") {
    startingRule.turn = dealt.length - 1;
    startingRule.direction = -1;
  } else if (starter.kind === "draw2") {
    const target = dealt[0];
    for (let index = 0; index < DEFAULT_RULES.drawTwoAmount; index += 1) {
      const card = deck.pop();
      if (card === undefined) break;
      target.hand.push(card);
      startingRule.drewCards.push(card.id);
    }
    startingRule.turn = 1 % dealt.length;
  }

  return {
    version: 2,
    mode: rulesMode,
    seed: state_seed,
    drawPile: deck,
    discard: [starter],
    players: dealt,
    turn: startingRule.turn,
    direction: startingRule.direction,
    currentColor: color,
    drawnCardId: null,
    pendingChallenge: null,
    pendingStack: null,
    pendingHit: null,
    jumpWindow: null,
    startingRule,
    started: true,
    finished: false,
    winner: null,
    events: [{ type: "game_start", at: now }],
    replay: [],
    createdAt: now,
  };
}

function recycleDrawPile(state: GameState): void {
  if (state.drawPile.length > 0 || state.discard.length < 2) {
    return;
  }
  const top = state.discard.pop();
  const returned = state.discard.slice();
  state.discard = top === undefined ? [] : [top];
  const shuffled = shuffle(state.seed, returned);
  state.drawPile = shuffled.cards;
  state.seed = shuffled.seed;
}

function drawCards(state: GameState, player: Player, count: number): void {
  for (let index = 0; index < count; index += 1) {
    recycleDrawPile(state);
    const card = state.drawPile.pop();
    if (card === undefined) {
      return;
    }
    player.hand.push(card);
  }
}

function advance(state: GameState, steps: number): void {
  const count = state.players.length;
  for (let step = 0; step < steps; step += 1) {
    state.turn = (state.turn + state.direction + count * 4) % count;
  }
}

function targetIndex(state: GameState): number {
  const count = state.players.length;
  return (state.turn + state.direction + count * 4) % count;
}

function fail(state: GameState, error: UnoErrorCode): MoveResult {
  return { state, ok: false, error };
}

function hasColorMatch(state: GameState, player: Player): boolean {
  return player.hand.some((card) => card.color === state.currentColor);
}

function canPlayCard(state: GameState, _player: Player, card: Card): boolean {
  return canPlay(state, card);
}

function finishIfEmpty(state: GameState, actor: Player): void {
  if (actor.hand.length === 0) {
    state.finished = true;
    state.winner = actor.id;
  }
}

function finishDeferredWinner(state: GameState, pendingWinnerId: string | undefined): void {
  if (pendingWinnerId === undefined) {
    return;
  }
  const winner = state.players.find((player) => player.id === pendingWinnerId);
  if (winner !== undefined && winner.hand.length === 0) {
    state.finished = true;
    state.winner = winner.id;
  }
}

function stackAmount(kind: PendingStack["kind"]): number {
  return kind === "draw2" ? DEFAULT_RULES.drawTwoAmount : DEFAULT_RULES.wildFourAmount;
}

function applyStackResolution(state: GameState, stack: PendingStack, accept: boolean | undefined): void {
  const pendingWinnerId = stack.pendingWinnerId;
  const pending = state.pendingChallenge;
  const target = state.players.find((player) => player.id === stack.targetId);
  const owner = pending === null ? undefined : state.players.find((player) => player.id === pending.ownerId);
  state.pendingStack = null;
  state.pendingChallenge = null;
  if (stack.kind === "wild4" && accept !== undefined && owner !== undefined && target !== undefined) {
    if (accept) {
      if (pending?.legal === true) {
        drawCards(state, target, stack.amount + 2);
      } else {
        drawCards(state, owner, stack.amount);
      }
    } else {
      drawCards(state, target, stack.amount);
    }
    advance(state, 2);
    state.events.push({ type: "challenge", playerId: target.id, at: state.events.length });
    state.replay.push({ playerId: target.id, action: `challenge:${accept}` });
  } else if (target !== undefined) {
    drawCards(state, target, stack.amount);
    advance(state, stack.kind === "draw2" ? 1 : 2);
    state.events.push({ type: "draw", playerId: target.id, at: state.events.length });
    state.replay.push({ playerId: target.id, action: "draw" });
  }
  finishDeferredWinner(state, pendingWinnerId);
}

export function mostCommonColor(hand: Card[]): Color {
  const counts = new Map<Color, number>();
  for (const color of COLORS) {
    counts.set(color, 0);
  }
  for (const card of hand) {
    if (card.color !== null) {
      counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
    }
  }
  let best: Color = COLORS[0];
  let bestCount = -1;
  for (const color of COLORS) {
    const count = counts.get(color) ?? 0;
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

export function applyAction(previous: GameState, action: Action, now = 0): MoveResult {
  if (previous.finished) {
    return fail(previous, UNO_ERROR.GAME_OVER as "game_over");
  }
  const state = cloneState(previous);
  const actor = state.players.find((player) => player.id === action.playerId);
  const window = state.mode === UNO_MODE.JUMP_IN ? state.jumpWindow : null;

  if (window !== null && now < window.expiresAt) {
    if (actor === undefined || actor.id === window.ownerId) {
      return fail(previous, UNO_ERROR.JUMP_WINDOW_OPEN as "jump_window_open");
    }
    if (action.type !== "play" || action.jump !== true) {
      return fail(previous, UNO_ERROR.JUMP_WINDOW_OPEN as "jump_window_open");
    }
    const windowCard = topCard(state);
    const jumpCard = actor.hand.find((card) => card.id === action.cardId);
    if (jumpCard === undefined || windowCard.id !== window.cardId || windowCard.kind !== "number"
      || jumpCard.kind !== "number" || jumpCard.color === null
      || jumpCard.color !== windowCard.color || jumpCard.value !== windowCard.value) {
      return fail(previous, UNO_ERROR.BAD_JUMP as "bad_jump");
    }
    actor.hand.splice(actor.hand.findIndex((card) => card.id === jumpCard.id), 1);
    state.discard.push(jumpCard);
    state.drawnCardId = null;
    state.events.push({ type: "jump", playerId: actor.id, cardId: jumpCard.id, at: state.events.length });
    state.replay.push({ playerId: actor.id, action: "jump", cardId: jumpCard.id });
    state.turn = state.players.findIndex((player) => player.id === actor.id);
    advance(state, 1);
    state.jumpWindow = { cardId: jumpCard.id, ownerId: actor.id, expiresAt: now + JUMP_WINDOW_MS };
    finishIfEmpty(state, actor);
    if (state.finished) {
      state.jumpWindow = null;
    }
    return { state, ok: true };
  }
  if (window !== null) {
    state.jumpWindow = null;
  }
  if (state.mode === UNO_MODE.JUMP_IN && action.type === "play" && action.jump === true) {
    return fail(previous, UNO_ERROR.BAD_JUMP as "bad_jump");
  }

  if (state.pendingHit !== null) {
    const hit = state.pendingHit;
    if (actor === undefined || hit.targetId !== actor.id) {
      return fail(previous, UNO_ERROR.NOT_YOUR_TURN as "not_your_turn");
    }
    if (action.type === "draw") {
      for (let index = 0; index < hit.amount; index += 1) {
        drawCards(state, actor, pressLauncher(state));
      }
      state.pendingHit = null;
      advance(state, 1);
      const owner = state.players.find((player) => player.id === hit.ownerId);
      if (owner !== undefined && owner.hand.length === 0) {
        state.finished = true;
        state.winner = owner.id;
      }
      state.events.push({ type: "launcher", playerId: actor.id, at: state.events.length });
      state.replay.push({ playerId: actor.id, action: "launcher" });
      return { state, ok: true };
    }
    if (action.type !== "play") {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    const hitIndex = actor.hand.findIndex((card) => card.id === action.cardId);
    if (hitIndex < 0) {
      return fail(previous, UNO_ERROR.UNKNOWN_CARD as "unknown_card");
    }
    const hitCard = actor.hand[hitIndex];
    if (hitCard.kind !== "hit1" && hitCard.kind !== "hit2" && hitCard.kind !== "wildAttack") {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    if (hitCard.kind === "wildAttack" && action.chosenColor === undefined) {
      return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
    }
    const actorIndex = state.players.findIndex((player) => player.id === actor.id);
    const count = state.players.length;
    let hitTargetId = state.players[(actorIndex + state.direction + count * 4) % count].id;
    if (hitCard.kind === "wildAttack") {
      const requested = action.targetId ?? action.target_id;
      if (requested !== undefined && requested !== "") {
        const chosen = state.players.find((player) => player.id === requested && player.id !== actor.id);
        if (chosen === undefined) {
          return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
        }
        hitTargetId = chosen.id;
      }
    }
    actor.hand.splice(hitIndex, 1);
    state.discard.push(hitCard);
    state.drawnCardId = null;
    if (hitCard.kind === "wildAttack" && action.chosenColor !== undefined) {
      state.currentColor = action.chosenColor;
    } else if (hitCard.color !== null) {
      state.currentColor = hitCard.color;
    }
    state.events.push({
      type: "play",
      playerId: actor.id,
      cardId: hitCard.id,
      text: action.chosenColor,
      at: state.events.length,
    });
    state.replay.push({
      playerId: actor.id,
      action: "play",
      cardId: hitCard.id,
      color: action.chosenColor,
    });
    state.pendingHit = {
      amount: hit.amount + (hitCard.kind === "hit1" ? 1 : 2),
      ownerId: actor.id,
      targetId: hitTargetId,
    };
    state.turn = state.players.findIndex((player) => player.id === hitTargetId);
    return { state, ok: true };
  }

  if (state.pendingStack !== null) {
    const stack = state.pendingStack;
    if (actor === undefined || stack.targetId !== actor.id) {
      return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
    }
    if (action.type === "challenge") {
      if (stack.kind !== "wild4" || state.pendingChallenge === null
        || state.pendingChallenge.targetId !== actor.id) {
        return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
      }
      applyStackResolution(state, stack, action.accept);
      return { state, ok: true };
    }
    if (action.type === "draw") {
      applyStackResolution(state, stack, undefined);
      return { state, ok: true };
    }
    if (action.type !== "play") {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    const stackIndex = actor.hand.findIndex((card) => card.id === action.cardId);
    if (stackIndex < 0) {
      return fail(previous, UNO_ERROR.UNKNOWN_CARD as "unknown_card");
    }
    const stackCard = actor.hand[stackIndex];
    if (stackCard.kind !== stack.kind) {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    if (state.drawnCardId !== null && state.drawnCardId !== stackCard.id) {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    if (stackCard.kind === "wild4" && action.chosenColor === undefined) {
      return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
    }
    const stackLegal = stackCard.kind === "wild4" && !hasColorMatch(state, actor);
    const actorIndex = state.players.findIndex((player) => player.id === actor.id);
    actor.hand.splice(stackIndex, 1);
    state.discard.push(stackCard);
    state.drawnCardId = null;
    if (action.chosenColor !== undefined) {
      state.currentColor = action.chosenColor;
    }
    state.events.push({
      type: "play",
      playerId: actor.id,
      cardId: stackCard.id,
      text: action.chosenColor,
      at: state.events.length,
    });
    state.replay.push({
      playerId: actor.id,
      action: "play",
      cardId: stackCard.id,
      color: action.chosenColor,
    });
    if (stackCard.kind === "wild4") {
      state.turn = actorIndex;
    }
    const count = state.players.length;
    const nextIndex = (state.turn + state.direction + count * 4) % count;
    stack.amount += stackAmount(stack.kind);
    stack.ownerId = actor.id;
    stack.targetId = state.players[nextIndex].id;
    if (stackCard.kind === "wild4") {
      stack.legal = stackLegal;
      stack.color = action.chosenColor;
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: stack.targetId,
        legal: stackLegal,
      };
    } else {
      advance(state, 1);
    }
    if (actor.hand.length === 0 && stack.pendingWinnerId === undefined) {
      stack.pendingWinnerId = actor.id;
    }
    return { state, ok: true };
  }

  if (state.pendingChallenge !== null) {
    if (actor === undefined || action.type !== "challenge" || state.pendingChallenge.targetId !== action.playerId) {
      return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
    }
    const pending = state.pendingChallenge;
    const owner = state.players.find((player) => player.id === pending.ownerId);
    const target = state.players.find((player) => player.id === pending.targetId);
    if (owner === undefined || target === undefined) {
      return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
    }
    state.pendingChallenge = null;
    if (action.accept) {
      if (pending.legal) {
        drawCards(state, target, DEFAULT_RULES.challengePenalty);
      } else {
        drawCards(state, owner, DEFAULT_RULES.wildFourAmount);
      }
      advance(state, 2);
    } else {
      drawCards(state, target, DEFAULT_RULES.wildFourAmount);
      advance(state, 2);
    }
    state.events.push({ type: "challenge", playerId: action.playerId, at: state.events.length });
    state.replay.push({ playerId: action.playerId, action: `challenge:${action.accept}` });
    finishIfEmpty(state, owner);
    return { state, ok: true };
  }

  if (actor === undefined || currentPlayer(state).id !== actor.id) {
    return fail(previous, UNO_ERROR.NOT_YOUR_TURN as "not_your_turn");
  }

  if (action.type === "draw") {
    if (state.mode === UNO_MODE.ATTACK) {
      const launcherCount = pressLauncher(state);
      for (let index = 0; index < launcherCount; index += 1) {
        drawCards(state, actor, 1);
      }
      state.drawnCardId = null;
      advance(state, 1);
      state.events.push({ type: "launcher", playerId: actor.id, at: state.events.length });
      state.replay.push({ playerId: actor.id, action: "launcher" });
      return { state, ok: true };
    }
    if (state.drawnCardId !== null) {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }

    drawCards(state, actor, 1);
    const drawn = actor.hand[actor.hand.length - 1];
    state.drawnCardId = drawn === undefined ? null : drawn.id;
    if (drawn !== undefined && !canPlayCard(state, actor, drawn)) {
      state.drawnCardId = null;
      advance(state, 1);
    }
    state.events.push({ type: "draw", playerId: actor.id, at: state.events.length });
    state.replay.push({ playerId: actor.id, action: "draw" });
    return { state, ok: true };
  }

  if (action.type !== "play") {
    return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
  }

  const index = actor.hand.findIndex((card) => card.id === action.cardId);
  if (index < 0) {
    return fail(previous, UNO_ERROR.UNKNOWN_CARD as "unknown_card");
  }
  const card = actor.hand[index];
  if (!canPlay(state, card)) {
    return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
  }
  if (state.drawnCardId !== null && state.drawnCardId !== card.id) {
    return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
  }
  if ((card.kind === "wild" || card.kind === "wild4" || card.kind === "wildAttack")
    && action.chosenColor === undefined) {
    return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
  }
  const wildFourLegal = card.kind === "wild4" && !hasColorMatch(state, actor);

  let attackTargetId: string | undefined;
  if (state.mode === UNO_MODE.ATTACK && card.kind === "wildAttack") {
    const requested = action.targetId ?? action.target_id;
    if (requested === undefined || requested === "") {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    const chosen = state.players.find((player) => player.id === requested && player.id !== actor.id);
    if (chosen === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    attackTargetId = chosen.id;
  }

  let swapTarget: Player | undefined;
  if (state.mode === UNO_MODE.SEVEN_O && card.kind === "number" && card.value === 7) {
    const targetId = action.targetId ?? action.target_id;
    if (targetId === undefined || targetId === "") {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    swapTarget = state.players.find((player) => player.id === targetId && player.id !== actor.id);
    if (swapTarget === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
  }

  actor.hand.splice(index, 1);
  state.discard.push(card);
  state.drawnCardId = null;
  if (action.chosenColor !== undefined) {
    state.currentColor = action.chosenColor;
  } else if (state.mode === UNO_MODE.ATTACK && card.color !== null) {
    state.currentColor = card.color;
  }
  if (state.mode === UNO_MODE.ATTACK && card.kind === "discardAll" && card.color !== null) {
    const discarded = actor.hand.filter((held) => held.color === card.color);
    actor.hand = actor.hand.filter((held) => held.color !== card.color);
    state.discard.push(...discarded);
  }
  state.events.push({
    type: "play",
    playerId: actor.id,
    cardId: card.id,
    text: action.chosenColor,
    at: state.events.length,
  });
  state.replay.push({
    playerId: actor.id,
    action: "play",
    cardId: card.id,
    color: action.chosenColor,
  });

  if (state.mode === UNO_MODE.SEVEN_O && card.kind === "number") {
    if (card.value === 7 && swapTarget !== undefined) {
      const actorHand = actor.hand;
      actor.hand = swapTarget.hand;
      swapTarget.hand = actorHand;
    } else if (card.value === 0) {
      const original = state.players.map((player) => player.hand);
      const count = state.players.length;
      for (let playerIndex = 0; playerIndex < count; playerIndex += 1) {
        const from = (playerIndex - state.direction + count * 4) % count;
        state.players[playerIndex].hand = original[from];
      }
    }
  }

  const next = state.players[targetIndex(state)];
  switch (card.kind) {
    case "skip":
      advance(state, 2);
      break;
    case "reverse":
      if (state.players.length === 2) {
        advance(state, 2);
      } else {
        state.direction = state.direction === 1 ? -1 : 1;
        advance(state, 1);
      }
      break;
    case "draw2":
      if (state.mode === UNO_MODE.PROGRESSIVE) {
        state.pendingStack = {
          kind: "draw2",
          amount: DEFAULT_RULES.drawTwoAmount,
          ownerId: actor.id,
          targetId: next.id,
          ...(actor.hand.length === 0 ? { pendingWinnerId: actor.id } : {}),
        };
        advance(state, 1);
      } else {
        drawCards(state, next, DEFAULT_RULES.drawTwoAmount);
        advance(state, 2);
        finishIfEmpty(state, actor);
      }
      break;
    case "hit1":
    case "hit2":
    case "wildAttack":
      if (state.mode === UNO_MODE.ATTACK) {
        const targetId = attackTargetId ?? next.id;
        state.pendingHit = {
          amount: card.kind === "hit1" ? 1 : 2,
          ownerId: actor.id,
          targetId,
        };
        state.turn = state.players.findIndex((player) => player.id === targetId);
      } else {
        advance(state, 1);
      }
      break;
    case "discardAll":
      advance(state, 1);
      break;
    case "wild":
      advance(state, 1);
      break;
    case "wild4":
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: next.id,
        legal: wildFourLegal,
      };
      if (state.mode === UNO_MODE.PROGRESSIVE) {
        state.pendingStack = {
          kind: "wild4",
          amount: DEFAULT_RULES.wildFourAmount,
          ownerId: actor.id,
          targetId: next.id,
          legal: wildFourLegal,
          color: action.chosenColor,
          ...(actor.hand.length === 0 ? { pendingWinnerId: actor.id } : {}),
        };
      }
      break;
    default:
      advance(state, 1);
      break;
  }
  if (state.pendingChallenge === null && state.pendingStack === null && state.pendingHit === null) {
    finishIfEmpty(state, actor);
  }
  if (state.mode === UNO_MODE.JUMP_IN && card.kind === "number" && !state.finished) {
    state.jumpWindow = { cardId: card.id, ownerId: actor.id, expiresAt: now + JUMP_WINDOW_MS };
  }

  return { state, ok: true };
}

export function scoreHand(hand: Card[]): number {
  let total = 0;
  for (const card of hand) {
    if (card.kind === "number") {
      total += card.value ?? 0;
    } else if (card.kind === "wild" || card.kind === "wild4" || card.kind === "wildAttack") {
      total += 50;
    } else {
      total += 20;
    }
  }
  return total;
}
