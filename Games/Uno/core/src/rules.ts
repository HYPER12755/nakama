import { buildDeck, flipCard, isActionCard, shuffle } from "./deck";
import { nextSeed, normalizeSeed, randomInt } from "./rng";
import { JUMP_WINDOW_MS, UNO_ERROR, UNO_MODE, normalizeMode } from "./protocol";
import {
  ALL_COLORS,
  COLORS,
  DEFAULT_RULES,
  colorsForSide,
  type Action,
  type Card,
  type CardKind,
  type Color,
  type GameMode,
  type GameState,
  type LegalMoves,
  type MoveResult,
  type PendingStack,
  type Player,
  type PowerTower,
  type StartingRule,
  type UnoErrorCode,
} from "./types";

const NO_MERCY_WILD_KINDS: CardKind[] = [
  "wild", "wild4", "wildAttack", "wildDraw6", "wildDraw10", "wildReverse4", "wildRoulette",
  "wildDraw2", "wildDrawColor", "wildForceTrade", "wildPassHands", "wildPowerReverse", "wildNoU",
  "wildStack3", "wildStackNumber", "wildDoubleSpeed",
  "awWild", "awReverse", "awSkip", "awSkipTwo", "awDrawTwo", "awDrawFour",
  "awTargetDrawTwo", "awForcedSwap", "wildDare", "wildShowdown", "wildGrabTower", "modCard",
];

const WILD_COLOR_KINDS: CardKind[] = [
  "wild", "wild4", "wildAttack", "wildDraw6", "wildDraw10", "wildReverse4",
  "wildDraw2", "wildDrawColor", "wildForceTrade", "wildPassHands", "wildPowerReverse", "wildNoU",
  "wildStack3", "wildStackNumber", "wildDoubleSpeed", "wildDare", "wildShowdown", "wildGrabTower",
  "modCard",
];

const STACK_PACK_KINDS: CardKind[] = ["stack1", "stack2", "wildStack3", "wildStackNumber"];

export function drawCardValue(kind: CardKind): number {
  switch (kind) {
    case "draw2": return 2;
    case "draw4":
    case "wild4":
    case "wildReverse4": return DEFAULT_RULES.drawFourAmount;
    case "wildDraw6": return DEFAULT_RULES.wildDrawSixAmount;
    case "wildDraw10": return DEFAULT_RULES.wildDrawTenAmount;
    case "stack1": return 1;
    case "stack2": return 2;
    case "wildStack3": return 3;
    default: return 0;
  }
}

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
  if (NO_MERCY_WILD_KINDS.includes(card.kind)) {
    return true;
  }
  const top = topCard(state);
  if (state.mode === UNO_MODE.REVERSE_PACK) {
    if (card.kind === "reverseDraw2" && (top.kind === "reverse" || top.kind === "draw2" || top.kind === "reverseDraw2")) {
      return true;
    }
    if (card.kind === "reverseSkip" && (top.kind === "reverse" || top.kind === "skip" || top.kind === "reverseSkip")) {
      return true;
    }
    if ((card.kind === "reverse" || card.kind === "skip" || card.kind === "draw2")
      && (top.kind === "reverseDraw2" || top.kind === "reverseSkip")) {
      return true;
    }
  }
  if (card.color === state.currentColor) {
    return true;
  }
  if (card.kind === "number" && top.kind === "number") {
    return card.value === top.value;
  }
  if (state.mode === UNO_MODE.SHOWDOWN && card.kind === "showdownNumber") {
    if (top.kind === "showdownNumber" || top.kind === "number") {
      return card.value === top.value;
    }
  }
  if (state.mode === UNO_MODE.SHOWDOWN && top.kind === "showdownNumber" && card.kind === "number") {
    return card.value === top.value;
  }
  return card.kind === top.kind;
}

export function legalMoves(state: GameState, playerId: string, now = 0): LegalMoves {
  const empty: LegalMoves = { cards: [], canDraw: false };
  if (state.finished) {
    return empty;
  }
  const viewer = state.players.find((candidate) => candidate.id === playerId);
  if (viewer === undefined || viewer.out) {
    return empty;
  }
  if (state.pendingRoulette !== null) {
    if (state.pendingRoulette.chooserId !== playerId) {
      return empty;
    }
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
    const stack = state.pendingStack;
    const cards = stackPlayer.hand
      .filter((card) => state.mode === UNO_MODE.REVERSE_PACK
        ? card.kind === "wildNoU"
        : state.mode === UNO_MODE.STACK_PACK
          ? STACK_PACK_KINDS.includes(card.kind)
            && (WILD_COLOR_KINDS.includes(card.kind)
              || STACK_PACK_KINDS.includes(stack.kind)
              || card.color === stack.color)
        : state.mode === UNO_MODE.NO_MERCY
          ? drawCardValue(card.kind) >= (stack.value ?? 0)
          : card.kind === stack.kind)
      .map((card) => card.id);
    return { cards, canDraw: true };
  }
  if (state.pendingChallenge !== null) {
    if (state.mode === UNO_MODE.REVERSE_PACK && state.pendingChallenge.targetId === playerId) {
      const target = state.players.find((candidate) => candidate.id === playerId);
      return {
        cards: (target?.hand ?? []).filter((card) => card.kind === "wildNoU").map((card) => card.id),
        canDraw: true,
      };
    }
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
  const canDraw = state.mode === UNO_MODE.ATTACK || state.mode === UNO_MODE.SPEED_PACK
    || (state.drawnCardId === null
      && (cards.length === 0 || state.mode !== UNO_MODE.NO_MERCY));
  return { cards, canDraw };
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
    out: false,
  }));

  let starter = deck.pop();
  if (starter === undefined) {
    throw new Error("the deck is empty");
  }
  const unwantedStarter = (card: Card): boolean => rulesMode === UNO_MODE.NO_MERCY
    ? card.kind !== "number"
    : card.kind === "wild4";
  while (unwantedStarter(starter)) {
    deck.unshift(starter);
    state_seed = nextSeed(state_seed);
    const next = deck.pop();
    if (next === undefined) {
      throw new Error("the deck is empty");
    }
    starter = next;
  }

  if (starter.kind === "wild" || starter.kind === "wildAttack"
    || (rulesMode === UNO_MODE.FLIP && starter.kind.startsWith("wild"))
    || (rulesMode === UNO_MODE.SWAP_PACK
      && (starter.kind === "wildForceTrade" || starter.kind === "wildPassHands"))
    || (rulesMode === UNO_MODE.REVERSE_PACK
      && (starter.kind === "wildPowerReverse" || starter.kind === "wildNoU"))
    || (rulesMode === UNO_MODE.STACK_PACK
      && (starter.kind === "wildStack3" || starter.kind === "wildStackNumber"))
    || (rulesMode === UNO_MODE.SPEED_PACK && starter.kind === "wildDoubleSpeed")
    || (rulesMode === UNO_MODE.ALL_WILD && NO_MERCY_WILD_KINDS.includes(starter.kind))
    || (rulesMode === UNO_MODE.POWER_GRAB && starter.kind === "wildGrabTower")
    || (rulesMode === UNO_MODE.MOD && starter.kind === "modCard")
    || (rulesMode === UNO_MODE.DARE && starter.kind === "wildDare")
    || (rulesMode === UNO_MODE.SHOWDOWN && starter.kind === "wildShowdown")) {
    starter.color = mostCommonColor(dealt[0].hand, colorsForSide("light"));
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
    flipSide: "light",
    drawnCardId: null,
    pendingChallenge: null,
    pendingStack: null,
    pendingHit: null,
    pendingRoulette: null,
    jumpWindow: null,
    speedLevel: 1,
    speedPlayed: 0,
    speedTarget: 1,
    powerTowers: { U: null, N: null, O: null, "!": null },
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
      break;
    }
    player.hand.push(card);
  }
  checkMercy(state);
}

function drawUntilColor(state: GameState, player: Player, color: Color): void {
  let budget = state.drawPile.length + state.discard.length + 1;
  while (budget > 0) {
    budget -= 1;
    recycleDrawPile(state);
    const card = state.drawPile.pop();
    if (card === undefined) {
      break;
    }
    player.hand.push(card);
    if (card.color === color) {
      break;
    }
  }
  checkMercy(state);
}

function applyFlip(state: GameState, actor: Player, chosenColor?: Color): void {
  state.drawPile = state.drawPile.map(flipCard);
  state.discard = state.discard.map(flipCard);
  for (const player of state.players) {
    player.hand = player.hand.map(flipCard);
  }
  state.drawPile.reverse();
  state.discard.reverse();
  state.flipSide = state.flipSide === "light" ? "dark" : "light";
  const newTop = topCard(state);
  if (newTop === undefined) {
    return;
  }
  if (newTop.color !== null) {
    state.currentColor = newTop.color;
  } else {
    state.currentColor = chosenColor ?? mostCommonColor(actor.hand, colorsForSide(state.flipSide));
  }
}

export function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => !player.out);
}

function nextActiveIndex(state: GameState, from: number): number {
  const count = state.players.length;
  let index = (from + state.direction + count * 4) % count;
  for (let step = 0; step < count; step += 1) {
    if (!state.players[index].out) {
      return index;
    }
    index = (index + state.direction + count * 4) % count;
  }
  return from;
}

function advance(state: GameState, steps: number): void {
  if (state.finished) {
    return;
  }
  for (let step = 0; step < steps; step += 1) {
    state.turn = nextActiveIndex(state, state.turn);
  }
  if (state.mode === UNO_MODE.SPEED_PACK && !state.finished) {
    state.speedPlayed = 0;
    state.speedTarget = state.speedLevel;
  }
}

function targetIndex(state: GameState): number {
  return nextActiveIndex(state, state.turn);
}

export function checkMercy(state: GameState): void {
  if (state.mode !== UNO_MODE.NO_MERCY || state.finished) {
    return;
  }
  for (const player of state.players) {
    if (!player.out && player.hand.length >= DEFAULT_RULES.mercyLimit) {
      player.out = true;
    }
  }
  const active = activePlayers(state);
  if (active.length <= 1) {
    state.finished = true;
    state.winner = active.length === 1 ? active[0].id : state.winner;
    state.pendingChallenge = null;
    state.pendingStack = null;
    state.pendingHit = null;
    state.pendingRoulette = null;
    return;
  }
  if (state.players[state.turn]?.out) {
    state.turn = nextActiveIndex(state, state.turn);
  }
}

function reverseDrawTargetId(state: GameState, actorIndex: number): string {
  if (activePlayers(state).length === 2) {
    return state.players[actorIndex].id;
  }
  return state.players[nextActiveIndex(state, actorIndex)].id;
}

function startNoMercyStack(
  state: GameState,
  card: Card,
  owner: Player,
  targetId: string,
  color?: Color,
): void {
  const value = drawCardValue(card.kind);
  state.pendingStack = {
    kind: card.kind as PendingStack["kind"],
    amount: value,
    value,
    ownerId: owner.id,
    targetId,
    ...(color === undefined ? {} : { color }),
    ...(owner.hand.length === 0 ? { pendingWinnerId: owner.id } : {}),
  };
  state.turn = state.players.findIndex((player) => player.id === targetId);
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
  if (!state.finished && actor.hand.length === 0) {
    state.finished = true;
    state.winner = actor.id;
  }
}

function finishDeferredWinner(state: GameState, pendingWinnerId: string | undefined): void {
  if (state.finished || pendingWinnerId === undefined) {
    return;
  }
  const winner = state.players.find((player) => player.id === pendingWinnerId);
  if (winner !== undefined && winner.hand.length === 0) {
    state.finished = true;
    state.winner = winner.id;
  }
}

function stackAmount(kind: PendingStack["kind"]): number {
  if (kind === "draw2") return DEFAULT_RULES.drawTwoAmount;
  if (kind === "stack1") return 1;
  if (kind === "stack2") return DEFAULT_RULES.drawTwoAmount;
  if (kind === "wildStack3") return 3;
  return DEFAULT_RULES.wildFourAmount;
}

function revealStackNumber(state: GameState): number {
  const revealed: Card[] = [];
  let budget = state.drawPile.length + state.discard.length + 1;
  while (budget > 0) {
    budget -= 1;
    recycleDrawPile(state);
    const card = state.drawPile.pop();
    if (card === undefined) break;
    revealed.push(card);
    if (card.kind === "number" && card.value !== undefined) {
      state.discard = [...revealed, ...state.discard];
      return Math.max(1, card.value);
    }
  }
  if (revealed.length > 0) {
    state.discard = [...revealed, ...state.discard];
  }
  return 1;
}

function claimTower(state: GameState, tower: PowerTower, playerId: string): void {
  state.powerTowers[tower] = playerId;
  const owned = (Object.keys(state.powerTowers) as PowerTower[])
    .every((candidate) => state.powerTowers[candidate] === playerId);
  if (!owned) return;
  const player = state.players.find((candidate) => candidate.id === playerId);
  state.powerTowers = { U: null, N: null, O: null, "!": null };
  if (player === undefined || player.hand.length === 0) return;
  const kept = player.hand.reduce((best, card) => (
    cardScoreForTower(card) > cardScoreForTower(best) ? card : best
  ), player.hand[0]);
  player.hand = [kept];
  state.events.push({
    type: "instantUno",
    playerId,
    cardId: kept.id,
    at: state.events.length,
  });
  state.replay.push({ playerId, action: "instantUno", cardId: kept.id });
}

function cardScoreForTower(card: Card): number {
  if (card.kind === "number") return card.value ?? 0;
  return 20;
}

function towerOwner(state: GameState, tower: PowerTower, playerId: string): boolean {
  return state.powerTowers[tower] === playerId;
}

function stackResponseAmount(state: GameState, card: Card): number {
  return card.kind === "wildStackNumber" ? revealStackNumber(state) : drawCardValue(card.kind);
}

function resolveShowdown(state: GameState, owner: Player, target: Player, amount: number, cardId: string): void {
  const roll = randomInt(state.seed, 2);
  state.seed = nextSeed(state.seed);
  const winner = roll === 0 ? owner : target;
  const loser = roll === 0 ? target : owner;
  drawCards(state, loser, amount);
  state.events.push({
    type: "showdown",
    playerId: owner.id,
    cardId,
    text: `${winner.id}:${amount}`,
    at: state.events.length,
  });
  state.replay.push({
    playerId: owner.id,
    action: "showdown",
    cardId,
    targetId: target.id,
    count: amount,
  });
}

function applyStackResolution(state: GameState, stack: PendingStack, accept: boolean | undefined): void {
  const pendingWinnerId = stack.pendingWinnerId;
  const pending = state.pendingChallenge;
  const target = state.players.find((player) => player.id === stack.targetId);
  const owner = pending === null ? undefined : state.players.find((player) => player.id === pending.ownerId);
  state.pendingStack = null;
  state.pendingChallenge = null;
  const turnBefore = state.turn;
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
    if (!state.finished) {
      state.turn = turnBefore;
    }
    advance(state, 2);
    state.events.push({ type: "challenge", playerId: target.id, at: state.events.length });
    state.replay.push({ playerId: target.id, action: `challenge:${accept}` });
  } else if (target !== undefined) {
    drawCards(state, target, stack.amount);
    if (!state.finished) {
      state.turn = turnBefore;
    }
    advance(state, state.mode === UNO_MODE.NO_MERCY || stack.kind === "draw2"
      || (state.mode === UNO_MODE.STACK_PACK && stack.kind !== "wild4") ? 1 : 2);
    state.events.push({ type: "draw", playerId: target.id, at: state.events.length });
    state.replay.push({ playerId: target.id, action: "draw" });
  }
  finishDeferredWinner(state, pendingWinnerId);
}

export function mostCommonColor(hand: Card[], options: readonly Color[] = COLORS): Color {
  const counts = new Map<Color, number>();
  for (const color of options) {
    counts.set(color, 0);
  }
  for (const card of hand) {
    if (card.color !== null) {
      counts.set(card.color, (counts.get(card.color) ?? 0) + 1);
    }
  }
  let best: Color = options[0] ?? COLORS[0];
  let bestCount = -1;
  for (const color of options) {
    const count = counts.get(color) ?? 0;
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

function rotateHands(state: GameState): void {
  const original = state.players.map((player) => player.hand);
  const count = state.players.length;
  for (let playerIndex = 0; playerIndex < count; playerIndex += 1) {
    if (state.players[playerIndex].out) {
      continue;
    }
    let from = (playerIndex - state.direction + count * 4) % count;
    for (let step = 0; step < count && state.players[from].out; step += 1) {
      from = (from - state.direction + count * 4) % count;
    }
    state.players[playerIndex].hand = original[from];
  }
}

export function applyAction(previous: GameState, action: Action, now = 0): MoveResult {
  if (previous.finished) {
    return fail(previous, UNO_ERROR.GAME_OVER as "game_over");
  }
  const state = cloneState(previous);
  checkMercy(state);
  if (state.finished) {
    return { state, ok: true };
  }
  const actor = state.players.find((player) => player.id === action.playerId);
  if (actor?.out) {
    return fail(previous, UNO_ERROR.NOT_YOUR_TURN as "not_your_turn");
  }
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

  if (state.pendingRoulette !== null) {
    const roulette = state.pendingRoulette;
    if (actor === undefined || roulette.chooserId !== actor.id
      || (action.type !== "chooseColour" && action.type !== "chooseColor")) {
      return fail(previous, UNO_ERROR.NOT_YOUR_TURN as "not_your_turn");
    }
    const color = action.color ?? action.colour ?? action.chosenColor;
    if (color === undefined || !(state.mode === UNO_MODE.FLIP ? ALL_COLORS : COLORS).includes(color)) {
      return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
    }
    let budget = state.drawPile.length + state.discard.length + 1;
    while (budget > 0) {
      budget -= 1;
      recycleDrawPile(state);
      const revealed = state.drawPile.pop();
      if (revealed === undefined) {
        break;
      }
      actor.hand.push(revealed);
      checkMercy(state);
      if (revealed.color === color || state.finished) {
        break;
      }
    }
    state.pendingRoulette = null;
    checkMercy(state);
    if (!state.finished) {
      advance(state, 1);
    }
    state.events.push({ type: "roulette", playerId: actor.id, text: color, at: state.events.length });
    state.replay.push({ playerId: actor.id, action: `chooseColour:${color}` });
    return { state, ok: true };
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
    const noMercy = state.mode === UNO_MODE.NO_MERCY;
    const reversePack = state.mode === UNO_MODE.REVERSE_PACK;
    const stackPack = state.mode === UNO_MODE.STACK_PACK;
    const cardValue = drawCardValue(stackCard.kind);
    if (stackPack) {
      const stackable = STACK_PACK_KINDS.includes(stackCard.kind)
        && (WILD_COLOR_KINDS.includes(stackCard.kind)
          || STACK_PACK_KINDS.includes(stack.kind)
          || stackCard.color === stack.color);
      if (!stackable) {
        return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
      }
      if (WILD_COLOR_KINDS.includes(stackCard.kind) && action.chosenColor === undefined) {
        return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
      }
      const actorIndex = state.players.findIndex((player) => player.id === actor.id);
      const targetId = state.players[nextActiveIndex(state, actorIndex)].id;
      const amount = stackResponseAmount(state, stackCard);
      actor.hand.splice(stackIndex, 1);
      state.discard.push(stackCard);
      state.drawnCardId = null;
      state.currentColor = action.chosenColor ?? stackCard.color ?? state.currentColor;
      stack.kind = stackCard.kind as PendingStack["kind"];
      stack.amount += amount;
      stack.color = state.currentColor;
      stack.ownerId = actor.id;
      stack.targetId = targetId;
      state.pendingChallenge = null;
      state.turn = state.players.findIndex((player) => player.id === targetId);
      if (actor.hand.length === 0 && stack.pendingWinnerId === undefined) {
        stack.pendingWinnerId = actor.id;
      }
      state.events.push({
        type: "stack",
        playerId: actor.id,
        cardId: stackCard.id,
        text: String(amount),
        at: state.events.length,
      });
      state.replay.push({
        playerId: actor.id,
        action: "stack",
        cardId: stackCard.id,
        count: amount,
      });
      return { state, ok: true };
    }
    if (reversePack) {
      if (stackCard.kind !== "wildNoU") {
        return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
      }
      if (action.chosenColor === undefined) {
        return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
      }
      actor.hand.splice(stackIndex, 1);
      state.discard.push(stackCard);
      state.drawnCardId = null;
      state.currentColor = action.chosenColor;
      state.direction = state.direction === 1 ? -1 : 1;
      state.pendingStack = null;
      const owner = state.players.find((player) => player.id === stack.ownerId);
      if (owner !== undefined) {
        drawCards(state, owner, stack.amount);
      }
      state.events.push({ type: "wildNoU", playerId: actor.id, cardId: stackCard.id, at: state.events.length });
      state.replay.push({ playerId: actor.id, action: "wildNoU", cardId: stackCard.id });
      state.turn = state.players.findIndex((player) => player.id === actor.id);
      advance(state, 1);
      finishIfEmpty(state, actor);
      return { state, ok: true };
    }
    if (noMercy
      ? cardValue === 0 || cardValue < (stack.value ?? 0)
      : stackCard.kind !== stack.kind) {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    if (state.drawnCardId !== null && state.drawnCardId !== stackCard.id) {
      return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
    }
    if ((stackCard.kind === "wild4" || noMercy && WILD_COLOR_KINDS.includes(stackCard.kind))
      && action.chosenColor === undefined) {
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
    if (noMercy) {
      if (stackCard.kind === "wildReverse4") {
        state.direction = state.direction === 1 ? -1 : 1;
      }
      stack.kind = stackCard.kind as PendingStack["kind"];
      stack.value = cardValue;
      stack.amount += cardValue;
      stack.ownerId = actor.id;
      const targetId = stackCard.kind === "wildReverse4"
        ? reverseDrawTargetId(state, actorIndex)
        : state.players[nextActiveIndex(state, actorIndex)].id;
      stack.targetId = targetId;
      if (action.chosenColor !== undefined) {
        stack.color = action.chosenColor;
      }
      state.turn = state.players.findIndex((player) => player.id === targetId);
    } else {
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
    }
    if (actor.hand.length === 0 && stack.pendingWinnerId === undefined) {
      stack.pendingWinnerId = actor.id;
    }
    return { state, ok: true };
  }

  if (state.pendingChallenge !== null) {
    if (state.mode === UNO_MODE.REVERSE_PACK && actor !== undefined
      && state.pendingChallenge.targetId === actor.id
      && action.type === "play") {
      const noUIndex = actor.hand.findIndex((card) => card.kind === "wildNoU" && card.id === action.cardId);
      if (noUIndex < 0) {
        return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
      }
      if (action.chosenColor === undefined) {
        return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
      }
      const pending = state.pendingChallenge;
      const noUCard = actor.hand[noUIndex];
      actor.hand.splice(noUIndex, 1);
      state.discard.push(noUCard);
      state.drawnCardId = null;
      state.currentColor = action.chosenColor;
      state.direction = state.direction === 1 ? -1 : 1;
      state.pendingChallenge = null;
      const owner = state.players.find((player) => player.id === pending.ownerId);
      const amount = pending.amount ?? (pending.kind === "wildDraw2" ? DEFAULT_RULES.drawTwoAmount : DEFAULT_RULES.wildFourAmount);
      if (owner !== undefined) {
        drawCards(state, owner, amount);
      }
      state.events.push({ type: "wildNoU", playerId: actor.id, cardId: noUCard.id, at: state.events.length });
      state.replay.push({ playerId: actor.id, action: "wildNoU", cardId: noUCard.id });
      state.turn = state.players.findIndex((player) => player.id === actor.id);
      advance(state, 1);
      finishIfEmpty(state, actor);
      return { state, ok: true };
    }
    if (actor === undefined || action.type !== "challenge" || state.pendingChallenge.targetId !== action.playerId) {
      return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
    }
    const pending = state.pendingChallenge;
    if (state.mode === UNO_MODE.DARE && (pending.kind === "dare" || pending.kind === "wildDare")) {
      const amount = pending.amount ?? DEFAULT_RULES.drawTwoAmount;
      state.pendingChallenge = null;
      if (action.accept) {
        state.events.push({
          type: "dareAccepted",
          playerId: action.playerId,
          text: pending.kind,
          at: state.events.length,
        });
        state.replay.push({ playerId: action.playerId, action: "dareAccepted" });
      } else {
        drawCards(state, actor, amount);
        state.events.push({
          type: "dareDraw",
          playerId: action.playerId,
          text: String(amount),
          at: state.events.length,
        });
        state.replay.push({ playerId: action.playerId, action: "dareDraw" });
      }
      state.turn = state.players.findIndex((player) => player.id === pending.ownerId);
      advance(state, 2);
      return { state, ok: true };
    }
    const owner = state.players.find((player) => player.id === pending.ownerId);
    const target = state.players.find((player) => player.id === pending.targetId);
    if (owner === undefined || target === undefined) {
      return fail(previous, UNO_ERROR.BAD_CHALLENGE as "bad_challenge");
    }
    state.pendingChallenge = null;
    const challengeKind = pending.kind ?? "wild4";
    const amount = pending.amount ?? (challengeKind === "wildDraw2" ? DEFAULT_RULES.drawTwoAmount : DEFAULT_RULES.wildFourAmount);
    if (challengeKind === "wildDrawColor") {
      const color = pending.color ?? state.currentColor;
      if (action.accept) {
        if (pending.legal) {
          drawUntilColor(state, target, color);
          drawCards(state, target, 2);
        } else {
          drawUntilColor(state, owner, color);
        }
      } else {
        drawUntilColor(state, target, color);
      }
      advance(state, 2);
    } else if (action.accept) {
      if (pending.legal) {
        drawCards(state, target, amount + 2);
      } else {
        drawCards(state, owner, amount);
      }
      advance(state, 2);
    } else {
      drawCards(state, target, amount);
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
    if (state.mode === UNO_MODE.SPEED_PACK) {
      const crashLevel = state.speedLevel;
      drawCards(state, actor, crashLevel);
      state.speedLevel = 1;
      state.events.push({
        type: "speedCrash",
        playerId: actor.id,
        text: String(crashLevel),
        at: state.events.length,
      });
      state.replay.push({ playerId: actor.id, action: "speedCrash", count: crashLevel });
      advance(state, 1);
      return { state, ok: true };
    }
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
    if (state.mode === UNO_MODE.NO_MERCY) {
      if (actor.hand.some((card) => canPlayCard(state, actor, card))) {
        return fail(previous, UNO_ERROR.ILLEGAL_CARD as "illegal_card");
      }
      let found = false;
      let budget = state.drawPile.length + state.discard.length + 1;
      while (budget > 0 && !state.finished && !actor.out) {
        budget -= 1;
        recycleDrawPile(state);
        const drawn = state.drawPile.pop();
        if (drawn === undefined) {
          break;
        }
        actor.hand.push(drawn);
        checkMercy(state);
        if (state.finished || actor.out) {
          break;
        }
        if (canPlayCard(state, actor, drawn)) {
          state.drawnCardId = drawn.id;
          found = true;
          break;
        }
      }
      if (!found && !state.finished) {
        state.drawnCardId = null;
        advance(state, 1);
      }
      state.events.push({ type: "draw", playerId: actor.id, at: state.events.length });
      state.replay.push({ playerId: actor.id, action: "draw" });
      return { state, ok: true };
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
  if (WILD_COLOR_KINDS.includes(card.kind) && action.chosenColor === undefined) {
    return fail(previous, UNO_ERROR.MISSING_COLOR as "missing_color");
  }
  const wildChallengeLegal = (card.kind === "wild4" || card.kind === "wildDraw2"
    || card.kind === "wildDrawColor") && !hasColorMatch(state, actor);

  let attackTargetId: string | undefined;
  let allWildTarget: Player | undefined;
  let showdownTarget: Player | undefined;
  let showdownAmount = 1;
  if (state.mode === UNO_MODE.SHOWDOWN && card.kind === "wildShowdown") {
    const requested = action.targetId ?? action.target_id;
    if (requested === undefined || requested === "") {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    showdownTarget = state.players.find((player) => player.id === requested && player.id !== actor.id);
    if (showdownTarget === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    const requestedAmount = action.showdownAmount ?? action.showdown_amount ?? 1;
    showdownAmount = Math.max(1, Math.min(3, Math.trunc(requestedAmount)));
  }
  if (state.mode === UNO_MODE.ALL_WILD
    && (card.kind === "awTargetDrawTwo" || card.kind === "awForcedSwap")) {
    const requested = action.targetId ?? action.target_id;
    if (requested === undefined || requested === "") {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    allWildTarget = state.players.find((player) => player.id === requested && player.id !== actor.id);
    if (allWildTarget === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
  }
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

  const sevenOActive = state.mode === UNO_MODE.SEVEN_O || state.mode === UNO_MODE.NO_MERCY;
  let swapTarget: Player | undefined;
  if (sevenOActive && card.kind === "number" && card.value === 7) {
    const targetId = action.targetId ?? action.target_id;
    if (targetId === undefined || targetId === "") {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    swapTarget = state.players.find((player) => player.id === targetId && player.id !== actor.id && !player.out);
    if (swapTarget === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
  }

  let swap1Target: Player | undefined;
  let swap1Give: Card | undefined;
  if (card.kind === "swap1") {
    const targetId = action.targetId ?? action.target_id;
    if (targetId === undefined || targetId === "") {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    swap1Target = state.players.find((player) => (
      player.id === targetId && player.id !== actor.id && player.hand.length > 0
    ));
    if (swap1Target === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    const giveId = action.giveCardId ?? action.give_card_id;
    if (giveId === undefined || giveId === "") {
      return fail(previous, UNO_ERROR.UNKNOWN_CARD as "unknown_card");
    }
    swap1Give = actor.hand.find((held) => held.id === giveId && held.id !== card.id);
    if (swap1Give === undefined) {
      return fail(previous, UNO_ERROR.UNKNOWN_CARD as "unknown_card");
    }
  }

  let forceTradeA: Player | undefined;
  let forceTradeB: Player | undefined;
  if (card.kind === "wildForceTrade") {
    const firstId = action.targetId ?? action.target_id;
    const secondId = action.tradeWithId ?? action.trade_with_id;
    if (firstId === undefined || firstId === "" || secondId === undefined || secondId === "" || firstId === secondId) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
    forceTradeA = state.players.find((player) => player.id === firstId);
    forceTradeB = state.players.find((player) => player.id === secondId);
    if (forceTradeA === undefined || forceTradeB === undefined) {
      return fail(previous, UNO_ERROR.MISSING_TARGET as "missing_target");
    }
  }

  actor.hand.splice(index, 1);
  state.discard.push(card);
  state.drawnCardId = null;
  if (action.chosenColor !== undefined) {
    state.currentColor = action.chosenColor;
  } else if ((state.mode === UNO_MODE.ATTACK || state.mode === UNO_MODE.NO_MERCY
    || state.mode === UNO_MODE.POWER_GRAB)
    && card.color !== null && card.kind !== "draw4") {
    state.currentColor = card.color;
  }
  if (state.mode === UNO_MODE.POWER_GRAB && card.power !== undefined) {
    claimTower(state, card.power, actor.id);
  }
  if ((state.mode === UNO_MODE.ATTACK || state.mode === UNO_MODE.NO_MERCY)
    && card.kind === "discardAll" && card.color !== null) {
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

  if (state.mode === UNO_MODE.SPEED_PACK) {
    const gain = card.kind === "wildDoubleSpeed" ? 2 : card.kind === "speedUp" ? 1 : 0;
    if (gain > 0) {
      state.speedLevel += gain;
      state.events.push({
        type: "speedUp",
        playerId: actor.id,
        cardId: card.id,
        text: String(state.speedLevel),
        at: state.events.length,
      });
      state.replay.push({
        playerId: actor.id,
        action: "speedUp",
        cardId: card.id,
        count: gain,
      });
    }
    state.speedPlayed += 1;
    if (state.speedPlayed < state.speedTarget) {
      state.drawnCardId = null;
      if (actor.hand.length === 0) {
        const crashLevel = state.speedLevel;
        drawCards(state, actor, crashLevel);
        state.speedLevel = 1;
        state.events.push({
          type: "speedCrash",
          playerId: actor.id,
          text: String(crashLevel),
          at: state.events.length,
        });
        state.replay.push({ playerId: actor.id, action: "speedCrash", count: crashLevel });
        advance(state, 1);
      }
      return { state, ok: true };
    }
    state.speedPlayed = 0;
    state.speedTarget = state.speedLevel;
  }

  if (sevenOActive && card.kind === "number") {
    if (card.value === 7 && swapTarget !== undefined) {
      const actorHand = actor.hand;
      actor.hand = swapTarget.hand;
      swapTarget.hand = actorHand;
    } else if (card.value === 0) {
      rotateHands(state);
    }
  }

  const noMercy = state.mode === UNO_MODE.NO_MERCY;
  const reversePack = state.mode === UNO_MODE.REVERSE_PACK;
  const stackPack = state.mode === UNO_MODE.STACK_PACK;
  const next = state.players[targetIndex(state)];
  const actorIndex = state.players.findIndex((player) => player.id === actor.id);
  switch (card.kind) {
    case "dare":
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: next.id,
        legal: true,
        kind: "dare",
        amount: DEFAULT_RULES.drawTwoAmount,
        color: card.color ?? undefined,
      };
      break;
    case "wildDare":
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: next.id,
        legal: true,
        kind: "wildDare",
        amount: DEFAULT_RULES.drawTwoAmount,
        color: action.chosenColor,
      };
      break;
    case "showdownNumber":
      if (state.mode === UNO_MODE.SHOWDOWN) {
        resolveShowdown(state, actor, next, card.value ?? 1, card.id);
      }
      advance(state, 1);
      break;
    case "wildShowdown":
      if (state.mode === UNO_MODE.SHOWDOWN && showdownTarget !== undefined) {
        resolveShowdown(state, actor, showdownTarget, showdownAmount, card.id);
      }
      advance(state, 1);
      break;
    case "awWild":
      advance(state, 1);
      break;
    case "awReverse":
      if (activePlayers(state).length === 2) {
        advance(state, 2);
      } else {
        state.direction = state.direction === 1 ? -1 : 1;
        advance(state, 1);
      }
      break;
    case "awSkip":
      advance(state, 2);
      break;
    case "awSkipTwo":
      advance(state, 3);
      break;
    case "awDrawTwo":
      drawCards(state, next, DEFAULT_RULES.drawTwoAmount);
      advance(state, 2);
      finishIfEmpty(state, actor);
      break;
    case "awDrawFour":
      drawCards(state, next, DEFAULT_RULES.wildFourAmount);
      advance(state, 2);
      finishIfEmpty(state, actor);
      break;
    case "awTargetDrawTwo":
      if (allWildTarget !== undefined) {
        drawCards(state, allWildTarget, DEFAULT_RULES.drawTwoAmount);
        state.events.push({
          type: "awTargetDrawTwo",
          playerId: actor.id,
          cardId: card.id,
          text: allWildTarget.id,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "awTargetDrawTwo",
          cardId: card.id,
          targetId: allWildTarget.id,
        });
      }
      advance(state, 1);
      break;
    case "awForcedSwap":
      if (allWildTarget !== undefined) {
        const actorHand = actor.hand;
        actor.hand = allWildTarget.hand;
        allWildTarget.hand = actorHand;
        state.events.push({
          type: "awForcedSwap",
          playerId: actor.id,
          cardId: card.id,
          text: allWildTarget.id,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "awForcedSwap",
          cardId: card.id,
          targetId: allWildTarget.id,
        });
      }
      advance(state, 1);
      break;
    case "stack1":
    case "stack2":
    case "wildStack3":
    case "wildStackNumber":
      if (stackPack) {
        const amount = card.kind === "wildStackNumber"
          ? revealStackNumber(state)
          : drawCardValue(card.kind);
        state.pendingStack = {
          kind: card.kind as PendingStack["kind"],
          amount,
          color: card.color ?? action.chosenColor,
          ownerId: actor.id,
          targetId: next.id,
          ...(actor.hand.length === 0 ? { pendingWinnerId: actor.id } : {}),
        };
        state.events.push({
          type: card.kind === "wildStackNumber" ? "stackNumber" : "stack",
          playerId: actor.id,
          cardId: card.id,
          text: String(amount),
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: card.kind === "wildStackNumber" ? "stackNumber" : "stack",
          cardId: card.id,
          color: action.chosenColor,
          count: amount,
        });
        advance(state, 1);
      } else {
        advance(state, 1);
      }
      break;
    case "reverseDraw2":
      if (reversePack) {
        state.direction = state.direction === 1 ? -1 : 1;
        const targetId = state.players[nextActiveIndex(state, actorIndex)].id;
        state.turn = state.players.findIndex((player) => player.id === targetId);
        state.pendingStack = {
          kind: "draw2",
          amount: DEFAULT_RULES.drawTwoAmount,
          ownerId: actor.id,
          targetId,
          ...(actor.hand.length === 0 ? { pendingWinnerId: actor.id } : {}),
        };
      } else {
        advance(state, 1);
      }
      break;
    case "reverseSkip":
      if (reversePack) {
        state.direction = state.direction === 1 ? -1 : 1;
        advance(state, 2);
      } else {
        advance(state, 1);
      }
      break;
    case "wildPowerReverse":
      if (reversePack) {
        state.direction = state.direction === 1 ? -1 : 1;
      } else {
        advance(state, 1);
      }
      break;
    case "wildNoU":
      if (reversePack) {
        state.direction = state.direction === 1 ? -1 : 1;
        advance(state, 1);
      } else {
        advance(state, 1);
      }
      break;
    case "skip":
      if (state.mode === UNO_MODE.POWER_GRAB && towerOwner(state, "!", next.id)) {
        state.events.push({ type: "towerBlock", playerId: next.id, text: "!", at: state.events.length });
        state.replay.push({ playerId: next.id, action: "towerBlock", text: "!" });
        advance(state, 1);
      } else {
        advance(state, 2);
      }
      break;
    case "reverse":
      if (activePlayers(state).length === 2) {
        advance(state, 2);
      } else {
        state.direction = state.direction === 1 ? -1 : 1;
        advance(state, 1);
      }
      break;
    case "skipEveryone":
      break;
    case "draw2":
      if (state.mode === UNO_MODE.PROGRESSIVE || reversePack || stackPack) {
        state.pendingStack = {
          kind: "draw2",
          amount: DEFAULT_RULES.drawTwoAmount,
          ownerId: actor.id,
          targetId: next.id,
          ...(stackPack ? { color: card.color ?? state.currentColor } : {}),
          ...(actor.hand.length === 0 ? { pendingWinnerId: actor.id } : {}),
        };
        advance(state, 1);
      } else if (noMercy) {
        startNoMercyStack(state, card, actor, next.id, action.chosenColor);
      } else if (state.mode === UNO_MODE.POWER_GRAB && towerOwner(state, "N", next.id)) {
        state.events.push({ type: "towerBlock", playerId: next.id, text: "N", at: state.events.length });
        state.replay.push({ playerId: next.id, action: "towerBlock", text: "N" });
        advance(state, 1);
      } else {
        drawCards(state, next, DEFAULT_RULES.drawTwoAmount);
        advance(state, 2);
        finishIfEmpty(state, actor);
      }
      break;
    case "draw1":
    case "draw5":
      if (state.mode === UNO_MODE.POWER_GRAB && card.kind === "draw1"
        && towerOwner(state, "U", next.id)) {
        state.events.push({ type: "towerBlock", playerId: next.id, text: "U", at: state.events.length });
        state.replay.push({ playerId: next.id, action: "towerBlock", text: "U" });
        advance(state, 1);
      } else {
        drawCards(state, next, card.kind === "draw1" ? 1 : 5);
        advance(state, 2);
      }
      finishIfEmpty(state, actor);
      break;
    case "flip":
      applyFlip(state, actor, action.chosenColor);
      advance(state, 1);
      break;
    case "draw4":
    case "wildDraw6":
    case "wildDraw10":
    case "wildReverse4":
      if (noMercy) {
        if (card.kind === "wildReverse4") {
          state.direction = state.direction === 1 ? -1 : 1;
        }
        const targetId = card.kind === "wildReverse4"
          ? reverseDrawTargetId(state, actorIndex)
          : next.id;
        startNoMercyStack(state, card, actor, targetId, action.chosenColor);
      } else {
        advance(state, 1);
      }
      break;
    case "wildRoulette":
      if (noMercy && actor.hand.length > 0) {
        const chooserId = state.players[nextActiveIndex(state, actorIndex)].id;
        state.pendingRoulette = { chooserId, ownerId: actor.id };
        state.turn = state.players.findIndex((player) => player.id === chooserId);
      } else {
        advance(state, 1);
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
    case "wildDraw2":
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: next.id,
        legal: wildChallengeLegal,
        kind: "wildDraw2",
        amount: DEFAULT_RULES.drawTwoAmount,
        color: action.chosenColor,
      };
      break;
    case "wildDrawColor":
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: next.id,
        legal: wildChallengeLegal,
        kind: "wildDrawColor",
        amount: 0,
        color: action.chosenColor,
      };
      break;
    case "modCard": {
      const giveColor = action.modColor ?? action.mod_color ?? action.chosenColor;
      if (giveColor !== undefined) {
        const outgoing = actor.hand.filter((card) => card.color === giveColor);
        let index = nextActiveIndex(state, state.turn);
        state.events.push({
          type: "mod",
          playerId: actor.id,
          cardId: card.id,
          text: `${giveColor}:${outgoing.length}`,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "mod",
          cardId: card.id,
          color: giveColor,
          count: outgoing.length,
        });
        for (const held of outgoing) {
          actor.hand.splice(actor.hand.indexOf(held), 1);
          const target = state.players[index];
          target.hand.push(held);
          index = nextActiveIndex(state, index);
        }
      }
      advance(state, 1);
      break;
    }
    case "grab2Towers":
      if (state.mode === UNO_MODE.POWER_GRAB) {
        const requested = action.towerId ?? action.tower_id;
        const first: PowerTower = requested ?? "U";
        claimTower(state, first, actor.id);
        const second = (Object.keys(state.powerTowers) as PowerTower[])
          .find((tower) => state.powerTowers[tower] !== actor.id) ?? first;
        claimTower(state, second, actor.id);
        state.events.push({
          type: "grabTowers",
          playerId: actor.id,
          cardId: card.id,
          text: `${first}:${second}`,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "grabTowers",
          cardId: card.id,
          text: `${first}:${second}`,
        });
      }
      advance(state, 1);
      break;
    case "wildGrabTower":
      if (state.mode === UNO_MODE.POWER_GRAB) {
        const tower = action.towerId ?? action.tower_id ?? "U";
        claimTower(state, tower, actor.id);
        state.events.push({
          type: "grabTower",
          playerId: actor.id,
          cardId: card.id,
          text: tower,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "grabTower",
          cardId: card.id,
          text: tower,
        });
      }
      advance(state, 1);
      break;
    case "wild4":
      if (state.mode === UNO_MODE.POWER_GRAB && towerOwner(state, "O", next.id)) {
        state.events.push({ type: "towerBlock", playerId: next.id, text: "O", at: state.events.length });
        state.replay.push({ playerId: next.id, action: "towerBlock", text: "O" });
        advance(state, 1);
        break;
      }
      state.pendingChallenge = {
        ownerId: actor.id,
        targetId: next.id,
        legal: wildChallengeLegal,
        ...(reversePack || stackPack
          ? {
            amount: DEFAULT_RULES.wildFourAmount,
            kind: "wild4" as const,
            color: action.chosenColor,
          }
          : {}),
      };
      if (state.mode === UNO_MODE.PROGRESSIVE || stackPack) {
        state.pendingStack = {
          kind: "wild4",
          amount: DEFAULT_RULES.wildFourAmount,
          ownerId: actor.id,
          targetId: next.id,
          legal: wildChallengeLegal,
          color: action.chosenColor,
          ...(actor.hand.length === 0 ? { pendingWinnerId: actor.id } : {}),
        };
      }
      break;
    case "swap1": {
      if (swap1Target !== undefined && swap1Give !== undefined) {
        const pick = randomInt(state.seed, swap1Target.hand.length);
        state.seed = nextSeed(state.seed);
        const received = swap1Target.hand[pick];
        swap1Target.hand[pick] = swap1Give;
        const giveIndex = actor.hand.findIndex((held) => held.id === swap1Give.id);
        actor.hand.splice(giveIndex, 1);
        actor.hand.push(received);
        state.events.push({
          type: "swap1",
          playerId: actor.id,
          cardId: card.id,
          text: `${swap1Target.id}:${swap1Give.id}:${received.id}`,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "swap1",
          cardId: card.id,
          targetId: swap1Target.id,
          giveCardId: swap1Give.id,
          receivedCardId: received.id,
        });
      }
      advance(state, 1);
      break;
    }
    case "refreshHand": {
      const count = actor.hand.length;
      state.discard.unshift(...actor.hand);
      actor.hand = [];
      drawCards(state, actor, count);
      state.events.push({
        type: "refreshHand",
        playerId: actor.id,
        cardId: card.id,
        text: String(count),
        at: state.events.length,
      });
      state.replay.push({ playerId: actor.id, action: "refreshHand", cardId: card.id, count });
      advance(state, 1);
      break;
    }
    case "wildForceTrade": {
      if (forceTradeA !== undefined && forceTradeB !== undefined) {
        const held = forceTradeA.hand;
        forceTradeA.hand = forceTradeB.hand;
        forceTradeB.hand = held;
        state.events.push({
          type: "wildForceTrade",
          playerId: actor.id,
          cardId: card.id,
          text: `${forceTradeA.id}:${forceTradeB.id}`,
          at: state.events.length,
        });
        state.replay.push({
          playerId: actor.id,
          action: "wildForceTrade",
          cardId: card.id,
          targetId: forceTradeA.id,
          tradeWithId: forceTradeB.id,
        });
      }
      advance(state, 1);
      break;
    }
    case "wildPassHands": {
      rotateHands(state);
      state.events.push({
        type: "wildPassHands",
        playerId: actor.id,
        cardId: card.id,
        at: state.events.length,
      });
      state.replay.push({ playerId: actor.id, action: "wildPassHands", cardId: card.id });
      advance(state, 1);
      break;
    }
    default:
      advance(state, 1);
      break;
  }
  if (state.pendingChallenge === null && state.pendingStack === null
    && state.pendingHit === null && state.pendingRoulette === null) {
    finishIfEmpty(state, actor);
  }
  if (state.mode === UNO_MODE.SHOWDOWN && (card.kind === "showdownNumber" || card.kind === "wildShowdown")
    && actor.hand.length === 0 && !state.finished) {
    state.finished = true;
    state.winner = actor.id;
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
    } else if (card.kind === "awWild" || card.kind === "dare") {
      total += 20;
    } else if (card.kind === "showdownNumber") {
      total += card.value ?? 0;
    } else if (card.kind === "wildShowdown") {
      total += 40;
    } else if (NO_MERCY_WILD_KINDS.includes(card.kind)) {
      total += 50;
    } else {
      total += 20;
    }
  }
  return total;
}
