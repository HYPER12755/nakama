import { describe, expect, it } from "vitest";
import {
  UNO_ERROR,
  UNO_MODE,
  UNO_CLIENT_OP,
  applyAction,
  buildDeck,
  chooseAction,
  createGame,
  drawCardValue,
  isGameMode,
  legalMoves,
  normalizeMode,
  scoreHand,
  type Card,
  type Color,
  type GameState,
} from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

const redFive: Card = { id: "red-5-0", color: "red", kind: "number", value: 5 };
const redOne: Card = { id: "red-1-0", color: "red", kind: "number", value: 1 };
const blueZero: Card = { id: "blue-0-0", color: "blue", kind: "number", value: 0 };
const blueDraw2: Card = { id: "blue-draw2-0", color: "blue", kind: "draw2" };
const redDraw2: Card = { id: "red-draw2-0", color: "red", kind: "draw2" };
const greenDraw2: Card = { id: "green-draw2-0", color: "green", kind: "draw2" };
const redDraw4: Card = { id: "red-draw4-0", color: "red", kind: "draw4" };
const blueDraw4: Card = { id: "blue-draw4-0", color: "blue", kind: "draw4" };
const greenDraw4: Card = { id: "green-draw4-0", color: "green", kind: "draw4" };
const redSkipEveryone: Card = { id: "red-skipeveryone-0", color: "red", kind: "skipEveryone" };
const redDiscardAll: Card = { id: "red-discardall-0", color: "red", kind: "discardAll" };
const redSeven: Card = { id: "red-7-0", color: "red", kind: "number", value: 7 };
const redZero: Card = { id: "red-0-0", color: "red", kind: "number", value: 0 };
const redReverse: Card = { id: "red-reverse-0", color: "red", kind: "reverse" };
const wildDraw6: Card = { id: "wilddraw6-0", color: null, kind: "wildDraw6" };
const wildDraw10: Card = { id: "wilddraw10-0", color: null, kind: "wildDraw10" };
const wildReverse4: Card = { id: "wildreverse4-0", color: null, kind: "wildReverse4" };
const wildRoulette: Card = { id: "wildroulette-0", color: null, kind: "wildRoulette" };
const wildCard: Card = { id: "wild-0", color: null, kind: "wild" };
const filler = (index: number): Card => ({
  id: `blue-${index}-0`, color: "blue", kind: "number", value: index % 10,
});

function staged(hand: Card[], color: Color = "red", seats = players): GameState {
  const game = createGame(4242, seats, 0, UNO_MODE.NO_MERCY);
  game.turn = 0;
  game.direction = 1;
  game.currentColor = color;
  game.discard = [redFive];
  game.drawnCardId = null;
  game.pendingChallenge = null;
  game.pendingStack = null;
  game.pendingHit = null;
  game.pendingRoulette = null;
  game.finished = false;
  game.winner = null;
  for (const player of game.players) {
    player.hand = [];
    player.out = false;
  }
  game.players[0].hand = hand.slice();
  return game;
}

function counts(deck: Card[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const card of deck) {
    result[card.kind] = (result[card.kind] ?? 0) + 1;
  }
  return result;
}

describe("Uno No Mercy deck and mode", () => {
  it("builds the exact 168 card deck", () => {
    const deck = buildDeck("noMercy");
    expect(deck).toHaveLength(168);
    const byKind = counts(deck);
    expect(byKind.number).toBe(80);
    expect(byKind.skip).toBe(12);
    expect(byKind.reverse).toBe(12);
    expect(byKind.draw2).toBe(12);
    expect(byKind.draw4).toBe(8);
    expect(byKind.discardAll).toBe(12);
    expect(byKind.skipEveryone).toBe(8);
    expect(byKind.wildReverse4).toBe(8);
    expect(byKind.wildRoulette).toBe(8);
    expect(byKind.wildDraw6).toBe(4);
    expect(byKind.wildDraw10).toBe(4);
    expect(byKind.wild).toBeUndefined();
    expect(byKind.wild4).toBeUndefined();
    expect(new Set(deck.map((card) => card.id)).size).toBe(168);
  });

  it("uses the documented card ids and per-colour counts", () => {
    const deck = buildDeck("noMercy");
    const ids = deck.map((card) => card.id);
    for (const id of [
      "red-draw4-0", "red-draw4-1", "red-skipeveryone-0", "red-skipeveryone-1",
      "blue-discardall-0", "blue-discardall-2", "wilddraw6-0", "wilddraw6-3",
      "wilddraw10-0", "wilddraw10-3", "wildreverse4-0", "wildreverse4-7",
      "wildroulette-0", "wildroulette-7",
    ]) {
      expect(ids).toContain(id);
    }
    for (const color of ["red", "yellow", "green", "blue"]) {
      const colored = deck.filter((card) => card.color === color);
      expect(colored).toHaveLength(36);
      expect(counts(colored).number).toBe(20);
      for (let value = 0; value <= 9; value += 1) {
        expect(colored.filter((card) => card.kind === "number" && card.value === value)).toHaveLength(2);
      }
    }
  });

  it("exposes noMercy as an authoritative mode with the colour opcode", () => {
    expect(UNO_MODE.NO_MERCY).toBe("noMercy");
    expect(isGameMode("noMercy")).toBe(true);
    expect(normalizeMode("noMercy")).toBe("noMercy");
    expect(UNO_CLIENT_OP.COLOR_CHOOSE).toBe(108);
    const game = createGame(7, players, 0, "noMercy");
    expect(game.mode).toBe("noMercy");
    expect(game.pendingRoulette).toBeNull();
    expect(game.players.every((player) => player.out === false)).toBe(true);
    expect(drawCardValue("draw2")).toBe(2);
    expect(drawCardValue("draw4")).toBe(4);
    expect(drawCardValue("wildReverse4")).toBe(4);
    expect(drawCardValue("wildDraw6")).toBe(6);
    expect(drawCardValue("wildDraw10")).toBe(10);
    expect(drawCardValue("number")).toBe(0);
  });

  it("always flips a number card as the starter", () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const game = createGame(seed, players, 0, "noMercy");
      expect(game.discard[0].kind).toBe("number");
      expect(game.startingRule?.kind).toBe("number");
      expect(game.currentColor).toBe(game.discard[0].color);
      expect(game.players.every((player) => player.hand.length === 7)).toBe(true);
    }
  });

  it("scores wild variants at 50 and coloured actions at 20", () => {
    expect(scoreHand([wildDraw6, wildDraw10, wildReverse4, wildRoulette])).toBe(200);
    expect(scoreHand([redDraw4, redSkipEveryone, redDiscardAll])).toBe(60);
  });
});

describe("Uno No Mercy draw until playable", () => {
  it("draws one card at a time and keeps a playable drawn card pending", () => {
    const game = staged([]);
    game.discard = [redFive];
    game.drawPile = [redOne, blueZero];
    const drawn = applyAction(game, { type: "draw", playerId: "p1" });
    expect(drawn.ok).toBe(true);
    expect(drawn.state.turn).toBe(0);
    expect(drawn.state.players[0].hand.map((card) => card.id)).toEqual([blueZero.id, redOne.id]);
    expect(drawn.state.drawnCardId).toBe(redOne.id);
    expect(legalMoves(drawn.state, "p1")).toEqual({ cards: [redOne.id], canDraw: false });
    const played = applyAction(drawn.state, { type: "play", playerId: "p1", cardId: redOne.id });
    expect(played.ok).toBe(true);
    expect(played.state.turn).toBe(1);
  });

  it("reshuffles the discard keeping the top without stalling", () => {
    const game = staged([]);
    game.drawPile = [blueZero];
    game.discard = [{ id: "blue-1-0", color: "blue", kind: "number", value: 1 }, blueZero, redFive];
    const drawn = applyAction(game, { type: "draw", playerId: "p1" });
    expect(drawn.ok).toBe(true);
    expect(drawn.state.drawnCardId).toBeNull();
    expect(drawn.state.turn).toBe(1);
    expect(drawn.state.players[0].hand.length).toBe(3);
    expect(drawn.state.discard.map((card) => card.id)).toEqual([redFive.id]);
  });

  it("refuses a draw while a legal card is in hand", () => {
    const game = staged([redOne]);
    expect(legalMoves(game, "p1").canDraw).toBe(false);
    const drawn = applyAction(game, { type: "draw", playerId: "p1" });
    expect(drawn.ok).toBe(false);
    expect(drawn.error).toBe(UNO_ERROR.ILLEGAL_CARD);
  });
});

describe("Uno No Mercy stacking", () => {
  it("stacks equal or higher draw cards regardless of colour and accumulates value", () => {
    let state = staged([blueDraw2]);
    state.discard = [blueDraw2];
    state.currentColor = "blue";
    const first = applyAction(state, { type: "play", playerId: "p1", cardId: blueDraw2.id });
    expect(first.ok).toBe(true);
    expect(first.state.pendingStack).toMatchObject({
      kind: "draw2", amount: 2, value: 2, ownerId: "p1", targetId: "p2",
    });
    state = first.state;
    state.players[1].hand = [redDraw4];
    const second = applyAction(state, { type: "play", playerId: "p2", cardId: redDraw4.id });
    expect(second.ok).toBe(true);
    expect(second.state.pendingStack).toMatchObject({
      kind: "draw4", amount: 6, value: 4, ownerId: "p2", targetId: "p3",
    });
    state = second.state;
    state.players[2].hand = [wildDraw6];
    const third = applyAction(state, {
      type: "play", playerId: "p3", cardId: wildDraw6.id, chosenColor: "green",
    });
    expect(third.ok).toBe(true);
    expect(third.state.pendingStack).toMatchObject({
      kind: "wildDraw6", amount: 12, value: 6, ownerId: "p3", targetId: "p1",
    });
    expect(third.state.currentColor).toBe("green");
    const before = third.state.players[0].hand.length;
    const taken = applyAction(third.state, { type: "draw", playerId: "p1" });
    expect(taken.ok).toBe(true);
    expect(taken.state.pendingStack).toBeNull();
    expect(taken.state.players[0].hand.length).toBe(before + 12);
  });

  it("refuses a lower-value stack", () => {
    let state = staged([redDraw4]);
    state.players[1].hand = [blueDraw2];
    const first = applyAction(state, { type: "play", playerId: "p1", cardId: redDraw4.id });
    expect(first.ok).toBe(true);
    expect(legalMoves(first.state, "p2")).toEqual({ cards: [], canDraw: true });
    const result = applyAction(first.state, { type: "play", playerId: "p2", cardId: blueDraw2.id });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(UNO_ERROR.ILLEGAL_CARD);
  });

  it("stacks an equal-value wild reverse four and reverses direction", () => {
    const state = staged([redDraw4]);
    state.players[1].hand = [wildReverse4];
    const first = applyAction(state, { type: "play", playerId: "p1", cardId: redDraw4.id });
    expect(first.ok).toBe(true);
    const stacked = applyAction(first.state, {
      type: "play", playerId: "p2", cardId: wildReverse4.id, chosenColor: "blue",
    });
    expect(stacked.ok).toBe(true);
    expect(stacked.state.direction).toBe(-1);
    expect(stacked.state.pendingStack).toMatchObject({ amount: 8, value: 4, targetId: "p1" });
  });

  it("takes the whole stack on a draw request", () => {
    let state = staged([blueDraw2]);
    state.currentColor = "blue";
    state.discard = [blueDraw2];
    const first = applyAction(state, { type: "play", playerId: "p1", cardId: blueDraw2.id });
    state = first.state;
    state.players[1].hand = [greenDraw2];
    const stacked = applyAction(state, { type: "play", playerId: "p2", cardId: greenDraw2.id });
    expect(stacked.state.pendingStack?.amount).toBe(4);
    const before = stacked.state.players[2].hand.length;
    const taken = applyAction(stacked.state, { type: "draw", playerId: "p3" });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[2].hand.length).toBe(before + 4);
    expect(taken.state.turn).toBe(0);
  });
});

describe("Uno No Mercy mercy elimination", () => {
  it("eliminates a player at 25 cards and declares the last active player the winner", () => {
    const game = staged([blueDraw2], "blue", players.slice(0, 2));
    game.players[1].hand = Array.from({ length: 24 }, (_, index) => filler(index));
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: blueDraw2.id });
    expect(played.ok).toBe(true);
    const result = applyAction(played.state, { type: "draw", playerId: "p2" });
    expect(result.ok).toBe(true);
    expect(result.state.players[1].hand.length).toBe(26);
    expect(result.state.players[1].out).toBe(true);
    expect(result.state.players).toHaveLength(2);
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
  });

  it("keeps eliminated seats in order and skips their turns", () => {
    const game = staged([redDraw2]);
    game.players[1].hand = Array.from({ length: 24 }, (_, index) => filler(index));
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redDraw2.id });
    const result = applyAction(played.state, { type: "draw", playerId: "p2" });
    expect(result.state.players[1].out).toBe(true);
    expect(result.state.turn).toBe(2);
    expect(legalMoves(result.state, "p2")).toEqual({ cards: [], canDraw: false });
    expect(chooseAction(result.state, "p2")).toBeNull();
    expect(result.state.players.map((player) => player.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("refuses an action from an eliminated seat", () => {
    const game = staged([redOne]);
    game.players[0].out = true;
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redOne.id });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(UNO_ERROR.NOT_YOUR_TURN);
  });

  it("eliminates via a taken stack and finishes when only one player remains", () => {
    const game = staged([redDraw4]);
    game.players[1].hand = [wildDraw6];
    game.players[2].hand = Array.from({ length: 20 }, (_, index) => filler(index));
    const first = applyAction(game, { type: "play", playerId: "p1", cardId: redDraw4.id });
    const stacked = applyAction(first.state, {
      type: "play", playerId: "p2", cardId: wildDraw6.id, chosenColor: "blue",
    });
    expect(stacked.ok).toBe(true);
    const taken = applyAction(stacked.state, { type: "draw", playerId: "p3" });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[2].hand.length).toBe(30);
    expect(taken.state.players[2].out).toBe(true);
    expect(taken.state.finished).toBe(true);
    expect(taken.state.winner).toBe("p1");
  });
});

describe("Uno No Mercy seven and zero", () => {
  it("swaps hands on a seven and requires a valid target", () => {
    const game = staged([redSeven, redOne]);
    game.players[1].hand = [blueZero];
    const before = game.players.map((player) => player.hand.map((card) => card.id));
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: redSeven.id, targetId: "p2",
    });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand.map((card) => card.id)).toEqual(before[1]);
    expect(result.state.players[1].hand.map((card) => card.id)).toEqual([redOne.id]);
    const missing = applyAction(game, { type: "play", playerId: "p1", cardId: redSeven.id });
    expect(missing.error).toBe(UNO_ERROR.MISSING_TARGET);
    const eliminated = staged([redSeven, redOne]);
    eliminated.players[1].out = true;
    const refused = applyAction(eliminated, {
      type: "play", playerId: "p1", cardId: redSeven.id, targetId: "p2",
    });
    expect(refused.error).toBe(UNO_ERROR.MISSING_TARGET);
  });

  it("rotates only active hands on a zero", () => {
    const game = staged([redZero]);
    game.players[1].hand = [blueZero];
    game.players[2].hand = [redDraw2];
    game.players[1].out = true;
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redZero.id });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toEqual([redDraw2]);
    expect(result.state.players[1].hand).toEqual([blueZero]);
    expect(result.state.players[2].hand).toEqual([]);
  });
});

describe("Uno No Mercy special cards", () => {
  it("plays a coloured Draw Four on another Draw Four with no colour change or challenge", () => {
    const game = staged([redDraw4, redOne], "green");
    game.discard = [blueDraw4];
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redDraw4.id });
    expect(result.ok).toBe(true);
    expect(result.state.currentColor).toBe("green");
    expect(result.state.pendingChallenge).toBeNull();
    expect(result.state.pendingStack).toMatchObject({ kind: "draw4", amount: 4, value: 4 });
    const challenge = applyAction(result.state, { type: "challenge", playerId: "p2", accept: true });
    expect(challenge.ok).toBe(false);
    expect(challenge.error).toBe(UNO_ERROR.BAD_CHALLENGE);
  });

  it("requires a colour for Wild Draw Six and Wild Draw Ten", () => {
    for (const card of [wildDraw6, wildDraw10]) {
      const game = staged([card, redOne]);
      const missing = applyAction(game, { type: "play", playerId: "p1", cardId: card.id });
      expect(missing.error).toBe(UNO_ERROR.MISSING_COLOR);
      const played = applyAction(game, {
        type: "play", playerId: "p1", cardId: card.id, chosenColor: "yellow",
      });
      expect(played.ok).toBe(true);
      expect(played.state.currentColor).toBe("yellow");
      expect(played.state.pendingStack).toMatchObject({
        amount: card.kind === "wildDraw6" ? 6 : 10,
        value: card.kind === "wildDraw6" ? 6 : 10,
      });
    }
  });

  it("reverses before drawing with Wild Reverse Draw Four", () => {
    const game = staged([wildReverse4]);
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildReverse4.id, chosenColor: "blue",
    });
    expect(played.ok).toBe(true);
    expect(played.state.direction).toBe(-1);
    expect(played.state.currentColor).toBe("blue");
    expect(played.state.pendingStack).toMatchObject({ targetId: "p3", amount: 4, value: 4 });
  });

  it("targets the actor with Wild Reverse Draw Four in a two-player game", () => {
    const game = staged([wildReverse4], "red", players.slice(0, 2));
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildReverse4.id, chosenColor: "blue",
    });
    expect(played.ok).toBe(true);
    expect(played.state.pendingStack).toMatchObject({ targetId: "p1", ownerId: "p1" });
    const taken = applyAction(played.state, { type: "draw", playerId: "p1" });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[0].hand.length).toBe(4);
    expect(taken.state.turn).toBe(1);
  });

  it("resolves Wild Colour Roulette authoritatively", () => {
    const game = staged([wildRoulette, redOne]);
    game.drawPile = [redOne, wildCard, { id: "blue-9-0", color: "blue", kind: "number", value: 9 }];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: wildRoulette.id });
    expect(played.ok).toBe(true);
    expect(played.state.pendingRoulette).toEqual({ chooserId: "p2", ownerId: "p1" });
    expect(played.state.turn).toBe(1);
    expect(legalMoves(played.state, "p2")).toEqual({ cards: [], canDraw: false });
    const wrong = applyAction(played.state, { type: "chooseColour", playerId: "p1", color: "red" });
    expect(wrong.error).toBe(UNO_ERROR.NOT_YOUR_TURN);
    const invalid = applyAction(played.state, { type: "chooseColour", playerId: "p2", color: "purple" as Color });
    expect(invalid.error).toBe(UNO_ERROR.MISSING_COLOR);
    expect(chooseAction(played.state, "p2")).toEqual({ type: "chooseColour", playerId: "p2", color: "red" });
    const chosen = applyAction(played.state, { type: "chooseColour", playerId: "p2", color: "red" });
    expect(chosen.ok).toBe(true);
    expect(chosen.state.pendingRoulette).toBeNull();
    expect(chosen.state.players[1].hand.map((card) => card.id)).toEqual([
      "blue-9-0", wildCard.id, redOne.id,
    ]);
    expect(chosen.state.turn).toBe(2);
  });

  it("wins immediately with a final Wild Colour Roulette", () => {
    const game = staged([wildRoulette]);
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: wildRoulette.id });
    expect(played.ok).toBe(true);
    expect(played.state.finished).toBe(true);
    expect(played.state.winner).toBe("p1");
    expect(played.state.pendingRoulette).toBeNull();
  });

  it("discards all matching colours and wins on an empty hand", () => {
    const game = staged([redDiscardAll, redOne]);
    game.players[0].hand.push(blueZero);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redDiscardAll.id });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toEqual([blueZero]);
    const final = staged([redDiscardAll, redOne]);
    const won = applyAction(final, { type: "play", playerId: "p1", cardId: redDiscardAll.id });
    expect(won.state.finished).toBe(true);
    expect(won.state.winner).toBe("p1");
  });

  it("skips everyone so the actor acts again", () => {
    const game = staged([redSkipEveryone, redOne]);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redSkipEveryone.id });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(0);
    expect(result.state.currentColor).toBe("red");
    expect(legalMoves(result.state, "p2")).toEqual({ cards: [], canDraw: false });
    expect(legalMoves(result.state, "p1").cards).toContain(redOne.id);
  });

  it("treats Reverse with two active players as Skip", () => {
    const game = staged([redReverse, redOne], "red", players.slice(0, 2));
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redReverse.id });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(0);
    expect(result.state.direction).toBe(1);
  });

  it("keeps the AI stall-free when the stack targets its own owner", () => {
    const game = staged([wildDraw6], "red", players.slice(0, 2));
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildDraw6.id, chosenColor: "green",
    });
    played.state.players[1].hand = [wildDraw10];
    const stacked = applyAction(played.state, {
      type: "play", playerId: "p2", cardId: wildDraw10.id, chosenColor: "blue",
    });
    expect(stacked.ok).toBe(true);
    expect(chooseAction(stacked.state, "p1")).toEqual({ type: "draw", playerId: "p1" });
  });
});
