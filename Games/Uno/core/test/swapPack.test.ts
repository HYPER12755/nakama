import { describe, expect, it } from "vitest";
import {
  UNO_MODE,
  UNO_MODES,
  applyAction,
  buildDeck,
  canPlay,
  chooseAction,
  createGame,
  isGameMode,
  legalMoves,
  nextSeed,
  normalizeMode,
  randomInt,
  scoreHand,
  shuffle,
  topCard,
  type Action,
  type Card,
  type Color,
  type GameState,
} from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

const redSwap1: Card = { id: "red-swap1-0", color: "red", kind: "swap1" };
const blueSwap1: Card = { id: "blue-swap1-0", color: "blue", kind: "swap1" };
const redRefresh: Card = { id: "red-refreshhand-0", color: "red", kind: "refreshHand" };
const blueRefresh: Card = { id: "blue-refreshhand-0", color: "blue", kind: "refreshHand" };
const forceTrade: Card = { id: "wildforcetrade-0", color: null, kind: "wildForceTrade" };
const passHands: Card = { id: "wildpasshands-0", color: null, kind: "wildPassHands" };
const redOne: Card = { id: "red-1-0", color: "red", kind: "number", value: 1 };
const blueTwo: Card = { id: "blue-2-0", color: "blue", kind: "number", value: 2 };
const greenThree: Card = { id: "green-3-0", color: "green", kind: "number", value: 3 };
const yellowFour: Card = { id: "yellow-4-0", color: "yellow", kind: "number", value: 4 };
const darkFive: Card = { id: "blue-5-1", color: "blue", kind: "number", value: 5 };

function staged(hand: Card[], color: Color = "red", seats = 3, seed = 4242): GameState {
  const game = createGame(seed, players.slice(0, seats), 0, "swapPack");
  game.turn = 0;
  game.direction = 1;
  game.seed = seed;
  game.currentColor = color;
  game.drawnCardId = null;
  game.pendingChallenge = null;
  game.pendingStack = null;
  game.pendingHit = null;
  game.pendingRoulette = null;
  game.finished = false;
  game.winner = null;
  game.events = [];
  game.replay = [];
  game.players[0].hand = hand.slice();
  for (let index = 1; index < game.players.length; index += 1) {
    game.players[index].hand = [];
  }
  return game;
}

function ids(hand: Card[]): string[] {
  return hand.map((card) => card.id);
}

type PlayFields = Partial<Extract<Action, { type: "play" }>>;

describe("Uno Swap Pack deck and mode", () => {
  it("builds exactly 124 cards with the documented new ids and order", () => {
    const deck = buildDeck("swapPack");
    expect(deck).toHaveLength(124);
    expect(buildDeck()).toHaveLength(108);
    expect(deck.slice(0, 108)).toEqual(buildDeck());
    expect(deck.slice(108).map((card) => card.id)).toEqual([
      "red-swap1-0", "yellow-swap1-0", "green-swap1-0", "blue-swap1-0",
      "red-refreshhand-0", "yellow-refreshhand-0", "green-refreshhand-0", "blue-refreshhand-0",
      "wildforcetrade-0", "wildforcetrade-1", "wildforcetrade-2", "wildforcetrade-3",
      "wildpasshands-0", "wildpasshands-1", "wildpasshands-2", "wildpasshands-3",
    ]);
    expect(deck.filter((card) => card.kind === "swap1")).toHaveLength(4);
    expect(deck.filter((card) => card.kind === "refreshHand")).toHaveLength(4);
    expect(deck.filter((card) => card.kind === "wildForceTrade")).toHaveLength(4);
    expect(deck.filter((card) => card.kind === "wildPassHands")).toHaveLength(4);
    expect(new Set(deck.map((card) => card.id)).size).toBe(124);
  });

  it("exposes swapPack as an authoritative mode", () => {
    expect(UNO_MODE.SWAP_PACK).toBe("swapPack");
    expect(UNO_MODES).toContain("swapPack");
    expect(isGameMode("swapPack")).toBe(true);
    expect(normalizeMode("swapPack")).toBe("swapPack");
    expect(normalizeMode("unknown")).toBe("classic");
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(createGame(seed, players.slice(0, 2), 0, "swapPack").mode).toBe("swapPack");
    }
  });

  it("matches by colour or by the same new symbol, and wilds always match", () => {
    const game = staged([redSwap1, redRefresh, forceTrade, passHands], "red");
    expect(canPlay(game, redSwap1)).toBe(true);
    expect(canPlay(game, redRefresh)).toBe(true);
    expect(canPlay(game, forceTrade)).toBe(true);
    expect(canPlay(game, passHands)).toBe(true);
    game.currentColor = "green";
    game.discard = [blueSwap1];
    expect(canPlay(game, redSwap1)).toBe(true);
    expect(canPlay(game, redRefresh)).toBe(false);
    game.discard = [blueRefresh];
    expect(canPlay(game, redRefresh)).toBe(true);
    expect(canPlay(game, redSwap1)).toBe(false);
    const moves = legalMoves(game, "p1");
    expect(moves.cards).toContain(redRefresh.id);
  });
});

describe("Swap 1", () => {
  it("takes a deterministic random card and gives the chosen card back", () => {
    const game = staged([redSwap1, redOne], "red");
    game.seed = 777;
    game.players[1].hand = [blueTwo, greenThree, yellowFour];
    const seed = game.seed;
    const pick = randomInt(seed, 3);
    const received = game.players[1].hand[pick];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: redSwap1.id, targetId: "p2", giveCardId: redOne.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.seed).toBe(nextSeed(seed));
    expect(ids(result.state.players[0].hand)).toEqual([received.id]);
    const targetHand = ids(result.state.players[1].hand);
    expect(targetHand).toHaveLength(3);
    expect(targetHand[pick]).toBe(redOne.id);
    expect(targetHand.filter((id) => id !== redOne.id)).toEqual(
      [blueTwo.id, greenThree.id, yellowFour.id].filter((id) => id !== received.id),
    );
    expect(result.state.turn).toBe(1);
    expect(result.state.events.some((event) => event.type === "swap1")).toBe(true);
    const replay = result.state.replay.find((step) => step.action === "swap1");
    expect(replay?.targetId).toBe("p2");
    expect(replay?.giveCardId).toBe(redOne.id);
    expect(replay?.receivedCardId).toBe(received.id);
  });

  it("rejects missing, self, unknown and empty targets plus bad give cards", () => {
    const base = staged([redSwap1, redOne], "red");
    base.players[1].hand = [blueTwo];
    const cases: Array<[PlayFields, "missing_target" | "unknown_card"]> = [
      [{}, "missing_target"],
      [{ targetId: "p1", giveCardId: redOne.id }, "missing_target"],
      [{ targetId: "nobody", giveCardId: redOne.id }, "missing_target"],
      [{ targetId: "p3", giveCardId: redOne.id }, "missing_target"],
      [{ targetId: "p2" }, "unknown_card"],
      [{ targetId: "p2", giveCardId: "not-in-hand" }, "unknown_card"],
      [{ targetId: "p2", giveCardId: redSwap1.id }, "unknown_card"],
    ];
    for (const [extra, error] of cases) {
      const action: Action = {
        type: "play", playerId: "p1", cardId: redSwap1.id, ...extra,
      };
      const result = applyAction(base, action);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    }
  });

  it("accepts snake_case aliases from the Lua protocol shape", () => {
    const game = staged([redSwap1, redOne], "red");
    game.players[1].hand = [blueTwo];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: redSwap1.id,
      target_id: "p2", give_card_id: redOne.id,
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.players[1].hand)).toContain(redOne.id);
  });
});

describe("Refresh Hand", () => {
  it("places the remaining hand at the bottom of the discard and draws the same count", () => {
    const game = staged([redRefresh, redOne, blueTwo], "red");
    game.players[1].hand = [greenThree];
    game.drawPile = [darkFive, yellowFour];
    const oldCard: Card = { id: "green-6-0", color: "green", kind: "number", value: 6 };
    game.discard = [oldCard];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: redRefresh.id,
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.discard)).toEqual([
      redOne.id, blueTwo.id, oldCard.id, redRefresh.id,
    ]);
    expect(ids(result.state.players[0].hand)).toEqual([yellowFour.id, darkFive.id]);
    expect(result.state.turn).toBe(1);
    const event = result.state.events.find((entry) => entry.type === "refreshHand");
    expect(event?.text).toBe("2");
    expect(result.state.replay.find((step) => step.action === "refreshHand")?.count).toBe(2);
  });

  it("recycles the discard pile deterministically when the draw pile is short", () => {
    const game = staged([redRefresh, redOne, blueTwo], "red");
    game.discard = [{ id: "green-6-0", color: "green", kind: "number", value: 6 }];
    game.drawPile = [];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: redRefresh.id,
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.players[0].hand)).toHaveLength(2);
    expect(topCard(result.state).id).toBe(redRefresh.id);
    const returned = [redOne, blueTwo, { id: "green-6-0", color: "green" as const, kind: "number" as const, value: 6 }];
    const expected = shuffle(game.seed, returned);
    expect(ids(result.state.players[0].hand)).toEqual(
      ids(expected.cards.slice(-2).reverse()),
    );
    expect(result.state.seed).toBe(expected.seed);
  });

  it("wins after resolving when the hand was empty after playing", () => {
    const game = staged([redRefresh], "red");
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: redRefresh.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
    expect(ids(result.state.players[0].hand)).toEqual([]);
    expect(ids(result.state.discard)).toEqual([topCard(game).id, redRefresh.id]);
  });
});

describe("Wild Force Trade", () => {
  it("swaps two other hands and sets the chosen colour", () => {
    const game = staged([forceTrade, redOne], "red");
    game.players[1].hand = [blueTwo, greenThree];
    game.players[2].hand = [yellowFour];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: forceTrade.id,
      targetId: "p2", tradeWithId: "p3", chosenColor: "blue",
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.players[1].hand)).toEqual([yellowFour.id]);
    expect(ids(result.state.players[2].hand)).toEqual([blueTwo.id, greenThree.id]);
    expect(ids(result.state.players[0].hand)).toEqual([redOne.id]);
    expect(result.state.currentColor).toBe("blue");
    expect(result.state.turn).toBe(1);
    const replay = result.state.replay.find((step) => step.action === "wildForceTrade");
    expect(replay?.targetId).toBe("p2");
    expect(replay?.tradeWithId).toBe("p3");
  });

  it("allows the actor to trade their whole hand with another player", () => {
    const game = staged([forceTrade, redOne], "red");
    game.players[1].hand = [blueTwo, greenThree];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: forceTrade.id,
      targetId: "p1", tradeWithId: "p2", chosenColor: "green",
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.players[0].hand)).toEqual([blueTwo.id, greenThree.id]);
    expect(ids(result.state.players[1].hand)).toEqual([redOne.id]);
    expect(result.state.currentColor).toBe("green");
  });

  it("rejects missing, identical and unknown participants and a missing colour", () => {
    const base = staged([forceTrade, redOne], "red");
    base.players[1].hand = [blueTwo];
    const cases: Array<[PlayFields, "missing_target" | "missing_color"]> = [
      [{ tradeWithId: "p2", chosenColor: "red" }, "missing_target"],
      [{ targetId: "p2", chosenColor: "red" }, "missing_target"],
      [{ targetId: "p2", tradeWithId: "p2", chosenColor: "red" }, "missing_target"],
      [{ targetId: "p2", tradeWithId: "unknown", chosenColor: "red" }, "missing_target"],
      [{ targetId: "p2", tradeWithId: "p3" }, "missing_color"],
    ];
    for (const [extra, error] of cases) {
      const action: Action = {
        type: "play", playerId: "p1", cardId: forceTrade.id, ...extra,
      };
      const result = applyAction(base, action);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    }
  });
});

describe("Wild Pass Hands", () => {
  it("passes every hand clockwise simultaneously", () => {
    const game = staged([passHands, redOne], "red");
    game.players[1].hand = [blueTwo];
    game.players[2].hand = [greenThree];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: passHands.id, chosenColor: "yellow",
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.players[0].hand)).toEqual([greenThree.id]);
    expect(ids(result.state.players[1].hand)).toEqual([redOne.id]);
    expect(ids(result.state.players[2].hand)).toEqual([blueTwo.id]);
    expect(result.state.currentColor).toBe("yellow");
    expect(result.state.turn).toBe(1);
    expect(result.state.events.some((event) => event.type === "wildPassHands")).toBe(true);
  });

  it("passes every hand counter-clockwise when direction is reversed", () => {
    const game = staged([passHands, redOne], "red");
    game.direction = -1;
    game.players[1].hand = [blueTwo];
    game.players[2].hand = [greenThree];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: passHands.id, chosenColor: "blue",
    });
    expect(result.ok).toBe(true);
    expect(ids(result.state.players[0].hand)).toEqual([blueTwo.id]);
    expect(ids(result.state.players[1].hand)).toEqual([greenThree.id]);
    expect(ids(result.state.players[2].hand)).toEqual([redOne.id]);
    expect(result.state.currentColor).toBe("blue");
  });

  it("requires a continuing colour", () => {
    const game = staged([passHands, redOne], "red");
    game.players[1].hand = [blueTwo];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: passHands.id,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_color");
  });
});

describe("Swap Pack scoring and AI", () => {
  it("scores colour actions at 20 and wild actions at 50", () => {
    expect(scoreHand([redSwap1, redRefresh])).toBe(40);
    expect(scoreHand([forceTrade, passHands])).toBe(100);
    expect(scoreHand([redOne, redSwap1, forceTrade])).toBe(71);
  });

  it("chooses legal actions with the required fields for every new card", () => {
    const setups: Array<[Card, string[]]> = [
      [redSwap1, ["giveCardId"]],
      [redRefresh, []],
      [forceTrade, ["targetId", "tradeWithId"]],
      [passHands, []],
    ];
    for (const [card, required] of setups) {
      const game = staged([card, redOne], "red");
      game.players[1].hand = [blueTwo];
      game.players[2].hand = [greenThree];
      const action = chooseAction(game, "p1");
      expect(action).not.toBeNull();
      expect(action?.type).toBe("play");
      if (action?.type !== "play") continue;
      expect(action.cardId).toBe(card.id);
      if (card.kind === "wildForceTrade" || card.kind === "wildPassHands") {
        expect(action.chosenColor).toBeDefined();
      }
      for (const field of required) {
        expect((action as unknown as Record<string, unknown>)[field]).toBeDefined();
      }
      const result = applyAction(game, action);
      expect(result.ok).toBe(true);
    }
  });

  it("never stalls on a forced draw of a new wild card", () => {
    const game = staged([forceTrade], "red");
    game.players[1].hand = [blueTwo];
    game.players[2].hand = [greenThree];
    game.drawPile = [passHands];
    const drawn = applyAction(game, { type: "draw", playerId: "p1" });
    expect(drawn.ok).toBe(true);
    const action = chooseAction(drawn.state, "p1");
    expect(action).not.toBeNull();
    const result = applyAction(drawn.state, action as Action);
    expect(result.ok).toBe(true);
  });
});
