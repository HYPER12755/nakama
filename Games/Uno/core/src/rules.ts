import { buildDeck, isActionCard, shuffle } from "./deck";
import { nextSeed, normalizeSeed } from "./rng";
import { UNO_ERROR } from "./protocol";
import {
  COLORS,
  DEFAULT_RULES,
  type Action,
  type Card,
  type Color,
  type GameState,
  type LegalMoves,
  type MoveResult,
  type Player,
} from "./types";

export function cloneState(state: GameState): GameState {
  return JSON.parse(JSON.stringify(state)) as GameState;
}

export function topCard(state: GameState): Card {
  return state.discard[state.discard.length - 1];
}

export function currentPlayer(state: GameState): Player {
  return state.players[state.turn];
}

export function canPlay(state: GameState, card: Card): boolean {
  if (card.kind === "wild" || card.kind === "wild4") {
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

export function legalMoves(state: GameState, playerId: string): LegalMoves {
  const empty: LegalMoves = { cards: [], canDraw: false };
  if (state.finished || state.pendingChallenge !== null) {
    return empty;
  }
  const player = currentPlayer(state);
  if (player.id !== playerId) {
    return empty;
  }
  const playable = (card: Card): boolean =>
    canPlay(state, card) && !(card.kind === "wild4" && hasColorMatch(state, player));
  const cards = state.drawnCardId === null
    ? player.hand.filter(playable).map((card) => card.id)
    : player.hand.filter((card) => card.id === state.drawnCardId && playable(card)).map((card) => card.id);
  return { cards, canDraw: true };
}

export function createGame(seed: number | string, players: Array<{ id: string; name: string }>, now = 0): GameState {
  if (players.length < 2 || players.length > 4) {
    throw new Error("Uno needs two to four players");
  }
  let state_seed = normalizeSeed(seed);
  const shuffled = shuffle(state_seed, buildDeck());
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
  while (isActionCard(starter)) {
    deck.unshift(starter);
    state_seed = nextSeed(state_seed);
    const next = deck.pop();
    if (next === undefined) {
      throw new Error("the deck is empty");
    }
    starter = next;
  }

  const color = starter.color;
  if (color === null) {
    throw new Error("the starting card has no colour");
  }

  return {
    version: 1,
    seed: state_seed,
    drawPile: deck,
    discard: [starter],
    players: dealt,
    turn: 0,
    direction: 1,
    currentColor: color,
    drawnCardId: null,
    pendingChallenge: null,
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

function fail(state: GameState, error: "not_your_turn" | "illegal_card" | "bad_challenge" | "game_over" | "unknown_card" | "missing_color"): MoveResult {
  return { state, ok: false, error };
}

function hasColorMatch(state: GameState, player: Player): boolean {
  return player.hand.some((card) =>
    card.kind === "wild" || card.kind === "wild4" || card.color === state.currentColor
  );
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

export function applyAction(previous: GameState, action: Action): MoveResult {
  if (previous.finished) {
    return fail(previous, UNO_ERROR.GAME_OVER as "game_over");
  }
  const state = cloneState(previous);
  const actor = state.players.find((player) => player.id === action.playerId);
  if (actor === undefined || currentPlayer(state).id !== actor.id) {
    return fail(previous, UNO_ERROR.NOT_YOUR_TURN as "not_your_turn");
  }

  if (state.pendingChallenge !== null) {
    if (action.type !== "challenge" || state.pendingChallenge.targetId !== action.playerId) {
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
      drawCards(state, target, DEFAULT_RULES.challengePenalty);
      if (!pending.legal) {
        drawCards(state, owner, DEFAULT_RULES.wildFourAmount);
      }
      advance(state, 2);
    } else {
      drawCards(state, target, DEFAULT_RULES.wildFourAmount);
      advance(state, 2);
    }
    state.events.push({ type: "challenge", playerId: action.playerId, at: state.events.length });
    state.replay.push({ playerId: action.playerId, action: `challenge:${action.accept}` });
    return { state, ok: true };
  }

  if (action.type === "draw") {
    drawCards(state, actor, 1);
    const drawn = actor.hand[actor.hand.length - 1];
    state.drawnCardId = drawn === undefined ? null : drawn.id;
    if (drawn !== undefined && !canPlay(state, drawn)) {
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
  if ((card.kind === "wild" || card.kind === "wild4") && action.chosenColor === undefined) {
    return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
  }
  const wildFourLegal = card.kind === "wild4" && !hasColorMatch(state, actor);
  if (card.kind === "wild4" && !wildFourLegal) {
    return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
  }

  actor.hand.splice(index, 1);
  state.discard.push(card);
  state.drawnCardId = null;
  if (action.chosenColor !== undefined) {
    state.currentColor = action.chosenColor;
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

  if (actor.hand.length === 0) {
    state.finished = true;
    state.winner = actor.id;
    return { state, ok: true };
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
      drawCards(state, next, DEFAULT_RULES.drawTwoAmount);
      advance(state, 2);
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
      break;
    default:
      advance(state, 1);
      break;
  }

  return { state, ok: true };
}

export function scoreHand(hand: Card[]): number {
  let total = 0;
  for (const card of hand) {
    if (card.kind === "number") {
      total += card.value ?? 0;
    } else if (card.kind === "wild" || card.kind === "wild4") {
      total += 50;
    } else {
      total += 20;
    }
  }
  return total;
}
