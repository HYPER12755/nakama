import { describe, expect, it } from "vitest";
import {
  UNO_ERROR,
  UNO_MODE,
  UNO_MODES,
  applyAction,
  buildDeck,
  chooseAction,
  createGame,
  isGameMode,
  legalMoves,
  normalizeMode,
  type Card,
  type GameMode,
  type GameState,
} from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

const redHit1: Card = { id: "red-hit1-0", color: "red", kind: "hit1" };
const blueHit1: Card = { id: "blue-hit1-0", color: "blue", kind: "hit1" };
const greenHit2: Card = { id: "green-hit2-0", color: "green", kind: "hit2" };
const wildAttack: Card = { id: "wildattack-0", color: null, kind: "wildAttack" };
const redDiscard: Card = { id: "red-discardall-0", color: "red", kind: "discardAll" };
const yellowDiscard: Card = { id: "yellow-discardall-0", color: "yellow", kind: "discardAll" };
const redOne: Card = { id: "red-1-0", color: "red", kind: "number", value: 1 };
const redTwo: Card = { id: "red-2-0", color: "red", kind: "number", value: 2 };
const blueZero: Card = { id: "blue-0-0", color: "blue", kind: "number", value: 0 };
const redReverse: Card = { id: "red-reverse-0", color: "red", kind: "reverse" };

function staged(
  hand: Card[],
  color = "red",
  seed = 42,
  seats = players,
): GameState {
  const game = createGame(seed, seats, 0, "attack");
  game.turn = 0;
  game.direction = 1;
  game.currentColor = color as GameState["currentColor"];
  game.drawnCardId = null;
  game.pendingChallenge = null;
  game.pendingStack = null;
  game.pendingHit = null;
  game.finished = false;
  game.winner = null;
  for (const player of game.players) {
    player.hand = [];
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

describe("Uno Attack mode and deck", () => {
  it("exposes attack as an authoritative mode", () => {
    expect(UNO_MODE.ATTACK).toBe("attack");
    expect(UNO_MODES).toContain("attack");
    expect(isGameMode("attack")).toBe(true);
    expect(normalizeMode("attack")).toBe("attack");
    expect(UNO_ERROR.MISSING_TARGET).toBe("missing_target");
    expect(createGame(7, players, 0, "attack").mode).toBe("attack");
    expect(createGame(7, players, 0, "attack").pendingHit).toBeNull();
    expect(createGame(7, players).mode).toBe("classic");
  });

  it("builds a 112 card attack deck without zeros, draw twos or wild fours", () => {
    const deck = buildDeck("attack");
    expect(deck).toHaveLength(112);
    const byKind = counts(deck);
    expect(byKind.number).toBe(72);
    expect(byKind.hit1).toBe(4);
    expect(byKind.hit2).toBe(8);
    expect(byKind.discardAll).toBe(8);
    expect(byKind.reverse).toBe(4);
    expect(byKind.skip).toBe(8);
    expect(byKind.wild).toBe(4);
    expect(byKind.wildAttack).toBe(4);
    expect(byKind.draw2).toBeUndefined();
    expect(byKind.wild4).toBeUndefined();
    expect(deck.some((card) => card.value === 0)).toBe(false);
    for (const color of ["red", "yellow", "green", "blue"]) {
      const colored = deck.filter((card) => card.color === color);
      expect(colored).toHaveLength(26);
      expect(counts(colored).number).toBe(18);
      expect(counts(colored).hit1).toBe(1);
      expect(counts(colored).hit2).toBe(2);
      expect(counts(colored).discardAll).toBe(2);
      expect(counts(colored).reverse).toBe(1);
      expect(counts(colored).skip).toBe(2);
    }
    const ids = deck.map((card) => card.id);
    expect(ids).toContain("red-hit1-0");
    expect(ids).toContain("blue-hit2-1");
    expect(ids).toContain("green-discardall-1");
    expect(ids).toContain("wildattack-3");
    expect(buildDeck()).toHaveLength(108);
  });

  it("selects the attack deck only in attack mode", () => {
    for (const mode of ["classic", "sevenO", "progressive", "jumpIn"] as GameMode[]) {
      const deck = buildDeck(mode);
      expect(deck).toHaveLength(108);
      expect(counts(deck).draw2).toBe(8);
      expect(counts(deck).wild4).toBe(4);
    }
  });
});

describe("Uno Attack hits", () => {
  it("sets a pending hit on the next player and offers a take", () => {
    const game = staged([redHit1]);
    game.players[1].hand = [blueZero];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redHit1.id });
    expect(played.ok).toBe(true);
    expect(played.state.pendingHit).toEqual({ amount: 1, ownerId: "p1", targetId: "p2" });
    expect(played.state.turn).toBe(1);
    expect(legalMoves(played.state, "p1")).toEqual({ cards: [], canDraw: false });
    expect(legalMoves(played.state, "p2")).toEqual({ cards: [], canDraw: true });
    const wrong = applyAction(played.state, { type: "draw", playerId: "p1" });
    expect(wrong.ok).toBe(false);
    expect(wrong.error).toBe(UNO_ERROR.NOT_YOUR_TURN);
  });

  it("takes a hit with deterministic launcher draws and passes the turn", () => {
    const game = staged([redHit1]);
    game.players[1].hand = [blueZero];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redHit1.id });
    const seedBefore = played.state.seed;
    const taken = applyAction(played.state, { type: "draw", playerId: "p2" });
    expect(taken.ok).toBe(true);
    expect(taken.state.pendingHit).toBeNull();
    expect(taken.state.players[1].hand).toHaveLength(2);
    expect(taken.state.seed).not.toBe(seedBefore);
    expect(taken.state.turn).toBe(2);
    expect(legalMoves(taken.state, "p2")).toEqual({ cards: [], canDraw: false });
  });

  it("draws seeded 0-3 cards per launcher press and advances the seed each time", () => {
    let state = staged([]);
    const actorBefore = state.players[0];
    const lengths: number[] = [];
    const expected = [1, 1, 1, 2];
    for (let press = 0; press < expected.length; press += 1) {
      const before = state.seed;
      const actor = state.players[state.turn];
      const handBefore = actor.hand.length;
      const result = applyAction(state, { type: "draw", playerId: actor.id });
      expect(result.ok).toBe(true);
      lengths.push(result.state.players.find((player) => player.id === actor.id)!.hand.length - handBefore);
      expect(result.state.seed).not.toBe(before);
      state = result.state;
    }
    expect(lengths).toEqual(expected);
    expect(state.players.find((player) => player.id === actorBefore.id)!.hand).toHaveLength(3);
  });

  it("presses the launcher once per hit for Hit 2", () => {
    const game = staged([greenHit2], "green", 123456789);
    game.players[1].hand = [blueZero];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: greenHit2.id });
    expect(played.state.pendingHit).toEqual({ amount: 2, ownerId: "p1", targetId: "p2" });
    const taken = applyAction(played.state, { type: "draw", playerId: "p2" });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[1].hand).toHaveLength(6);
  });

  it("deflects a hit with any hit card and accumulates the amount", () => {
    const game = staged([redHit1]);
    game.players[1].hand = [greenHit2, blueZero];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redHit1.id });
    const deflected = applyAction(played.state, {
      type: "play",
      playerId: "p2",
      cardId: greenHit2.id,
    });
    expect(deflected.ok).toBe(true);
    expect(deflected.state.pendingHit).toEqual({ amount: 3, ownerId: "p2", targetId: "p3" });
    expect(deflected.state.turn).toBe(2);
    expect(deflected.state.currentColor).toBe("green");
    expect(deflected.state.players[1].hand).toEqual([blueZero]);
    expect(deflected.state.discard[deflected.state.discard.length - 1].id).toBe(greenHit2.id);
  });

  it("refuses a non-hit deflection", () => {
    const game = staged([redHit1]);
    game.players[1].hand = [blueZero];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redHit1.id });
    const result = applyAction(played.state, {
      type: "play",
      playerId: "p2",
      cardId: blueZero.id,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe(UNO_ERROR.ILLEGAL_CARD);
  });

  it("deflects with Wild Attack and redirects the hit", () => {
    const game = staged([redHit1]);
    game.players[1].hand = [wildAttack];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redHit1.id });
    const deflected = applyAction(played.state, {
      type: "play",
      playerId: "p2",
      cardId: wildAttack.id,
      chosenColor: "blue",
      targetId: "p1",
    });
    expect(deflected.ok).toBe(true);
    expect(deflected.state.currentColor).toBe("blue");
    expect(deflected.state.pendingHit).toEqual({ amount: 3, ownerId: "p2", targetId: "p1" });
    expect(deflected.state.turn).toBe(0);
  });
});

describe("Uno Attack Wild Attack", () => {
  it("requires a valid target and a colour", () => {
    const game = staged([wildAttack, redOne]);
    expect(legalMoves(game, "p1").cards).toContain(wildAttack.id);
    const missing = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildAttack.id,
      chosenColor: "blue",
    });
    expect(missing.ok).toBe(false);
    expect(missing.error).toBe(UNO_ERROR.MISSING_TARGET);
    expect(missing.state).toBe(game);
    const unknown = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildAttack.id,
      chosenColor: "blue",
      targetId: "nobody",
    });
    expect(unknown.error).toBe(UNO_ERROR.MISSING_TARGET);
    const self = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildAttack.id,
      chosenColor: "blue",
      targetId: "p1",
    });
    expect(self.error).toBe(UNO_ERROR.MISSING_TARGET);
    const noColor = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildAttack.id,
      targetId: "p3",
    });
    expect(noColor.error).toBe(UNO_ERROR.MISSING_COLOR);
  });

  it("hits the chosen target twice and continues after them", () => {
    const game = staged([wildAttack, redOne]);
    game.players[2].hand = [blueZero];
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildAttack.id,
      chosenColor: "blue",
      targetId: "p3",
    });
    expect(result.ok).toBe(true);
    expect(result.state.currentColor).toBe("blue");
    expect(result.state.pendingHit).toEqual({ amount: 2, ownerId: "p1", targetId: "p3" });
    expect(result.state.turn).toBe(2);
    const taken = applyAction(result.state, { type: "draw", playerId: "p3" });
    expect(taken.ok).toBe(true);
    expect(taken.state.turn).toBe(0);
  });
});

describe("Uno Attack Discard All", () => {
  it("discards every card of its colour and leaves other colours", () => {
    const game = staged([redDiscard, redOne, redTwo, blueZero]);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redDiscard.id });
    expect(result.ok).toBe(true);
    expect(result.state.players[0].hand).toEqual([blueZero]);
    expect(result.state.discard.slice(-3).map((card) => card.id)).toEqual([
      redDiscard.id,
      redOne.id,
      redTwo.id,
    ]);
    expect(result.state.finished).toBe(false);
  });

  it("wins when the discard empties the hand", () => {
    const game = staged([redDiscard, redOne]);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redDiscard.id });
    expect(result.ok).toBe(true);
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
    expect(result.state.players[0].hand).toHaveLength(0);
  });

  it("is playable on another Discard All of a different colour", () => {
    const game = staged([redDiscard, blueZero], "red");
    const first = applyAction(game, { type: "play", playerId: "p1", cardId: redDiscard.id });
    expect(first.ok).toBe(true);
    expect(first.state.finished).toBe(false);
    const second = staged([yellowDiscard, blueZero], "blue");
    second.discard.push({ ...redDiscard });
    const result = applyAction(second, {
      type: "play",
      playerId: "p1",
      cardId: yellowDiscard.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.currentColor).toBe("yellow");
    expect(result.state.players[0].hand).toEqual([blueZero]);
  });
});

describe("Uno Attack draw and end-of-turn rules", () => {
  it("always allows a draw and never lets drawn cards be played", () => {
    const game = staged([redOne]);
    expect(legalMoves(game, "p1").canDraw).toBe(true);
    const drawn = applyAction(game, { type: "draw", playerId: "p1" });
    expect(drawn.ok).toBe(true);
    expect(drawn.state.drawnCardId).toBeNull();
    expect(drawn.state.turn).toBe(1);
    expect(legalMoves(drawn.state, "p1")).toEqual({ cards: [], canDraw: false });
    expect(legalMoves(drawn.state, "p2").canDraw).toBe(true);
  });

  it("makes Reverse skip when only two players are seated", () => {
    const game = staged([redReverse], "red", 42, players.slice(0, 2));
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redReverse.id });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(0);
    expect(result.state.direction).toBe(1);
  });
});

describe("Uno Attack AI", () => {
  it("deflects a hit when holding a hit card and takes otherwise", () => {
    const played = applyAction(staged([redHit1]), {
      type: "play",
      playerId: "p1",
      cardId: redHit1.id,
    }).state;
    played.players[1].hand = [blueHit1];
    expect(chooseAction(played, "p2")).toEqual({
      type: "play",
      playerId: "p2",
      cardId: blueHit1.id,
    });
    played.players[1].hand = [blueZero];
    expect(chooseAction(played, "p2")).toEqual({ type: "draw", playerId: "p2" });
  });

  it("chooses the player with the most cards for Wild Attack", () => {
    const game = staged([wildAttack, redOne]);
    game.players[1].hand = [redOne];
    game.players[2].hand = [redOne, redTwo];
    const action = chooseAction(game, "p1");
    expect(action).toEqual({
      type: "play",
      playerId: "p1",
      cardId: wildAttack.id,
      chosenColor: "red",
      targetId: "p3",
    });
    expect(applyAction(game, action!).ok).toBe(true);
  });

  it("auto-plays a legal Discard All", () => {
    const game = staged([redDiscard, redOne]);
    const action = chooseAction(game, "p1");
    expect(action?.type).toBe("play");
    if (action?.type === "play") {
      expect(action.cardId).toBe(redDiscard.id);
    }
    expect(applyAction(game, action!).ok).toBe(true);
  });

  it("stays deterministic and never stalls while a hit is pending", () => {
    const game = staged([redHit1]);
    expect(chooseAction(game, "p2")).toBeNull();
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: redHit1.id }).state;
    expect(chooseAction(played, "p1")).toBeNull();
    const first = chooseAction(played, "p2");
    expect(first).toEqual(chooseAction(played, "p2"));
    expect(applyAction(played, first!).ok).toBe(true);
  });
});
