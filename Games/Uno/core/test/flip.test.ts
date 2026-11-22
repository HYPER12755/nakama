import { describe, expect, it } from "vitest";
import {
  ALL_COLORS,
  DARK_COLORS,
  LIGHT_COLORS,
  UNO_MODES,
  applyAction,
  buildDeck,
  canPlay,
  chooseAction,
  colorsForSide,
  createGame,
  flipCard,
  flipColor,
  isGameMode,
  legalMoves,
  normalizeMode,
  topCard,
  type Card,
  type Color,
  type GameState,
} from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

const lightRedFlip: Card = { id: "light-red-flip-0", color: "red", kind: "flip" };
const lightBlueFlip: Card = { id: "light-blue-flip-1", color: "blue", kind: "flip" };
const lightRedOne: Card = { id: "light-red-1-0", color: "red", kind: "number", value: 1 };
const lightYellowTwo: Card = { id: "light-yellow-2-0", color: "yellow", kind: "number", value: 2 };
const lightGreenThree: Card = { id: "light-green-3-0", color: "green", kind: "number", value: 3 };
const lightYellowFour: Card = { id: "light-yellow-4-0", color: "yellow", kind: "number", value: 4 };
const lightGreenFive: Card = { id: "light-green-5-0", color: "green", kind: "number", value: 5 };
const lightWild: Card = { id: "light-wild-0", color: null, kind: "wild" };

function staged(hand: Card[], color: Color = "red", seats = 3): GameState {
  const game = createGame(7777, players.slice(0, seats), 0, "flip");
  game.turn = 0;
  game.direction = 1;
  game.currentColor = color;
  game.flipSide = "light";
  game.drawnCardId = null;
  game.pendingChallenge = null;
  game.pendingStack = null;
  game.finished = false;
  game.winner = null;
  game.players[0].hand = hand.slice();
  for (let index = 1; index < game.players.length; index += 1) {
    game.players[index].hand = [];
  }
  return game;
}

function darkStaged(hand: Card[], color: Color = "pink", seats = 3): GameState {
  const game = staged(hand, color, seats);
  game.flipSide = "dark";
  return game;
}

describe("Uno Flip deck and mapping", () => {
  it("builds exactly 112 light-side cards with the documented ids", () => {
    const deck = buildDeck("flip");
    expect(deck).toHaveLength(112);
    const byId = new Map(deck.map((card) => [card.id, card]));
    for (const id of [
      "light-red-1-0", "light-red-1-1", "light-red-draw1-0", "light-red-reverse-0",
      "light-red-skip-0", "light-red-flip-0", "light-wild-0", "light-wilddraw2-0",
    ]) {
      expect(byId.has(id)).toBe(true);
    }
    expect(deck.every((card) => card.id.startsWith("light-"))).toBe(true);
    expect(deck.filter((card) => card.kind === "number")).toHaveLength(72);
    expect(deck.filter((card) => card.kind !== "number" && card.color !== null)).toHaveLength(32);
    expect(deck.filter((card) => card.kind === "wild")).toHaveLength(4);
    expect(deck.filter((card) => card.kind === "wildDraw2")).toHaveLength(4);
    expect(deck.filter((card) => card.kind === "flip")).toHaveLength(8);
    for (const color of LIGHT_COLORS) {
      expect(deck.filter((card) => card.color === color && card.kind === "number")).toHaveLength(18);
      expect(deck.filter((card) => card.color === color && card.kind !== "number")).toHaveLength(8);
    }
  });

  it("leaves classic decks untouched and exposes side colour lists", () => {
    expect(buildDeck()).toHaveLength(108);
    expect(buildDeck("noMercy")).toHaveLength(168);
    expect(buildDeck("attack")).toHaveLength(112);
    expect(LIGHT_COLORS).toEqual(["red", "yellow", "green", "blue"]);
    expect(DARK_COLORS).toEqual(["pink", "teal", "orange", "purple"]);
    expect(ALL_COLORS).toHaveLength(8);
    expect(colorsForSide("light")).toBe(LIGHT_COLORS);
    expect(colorsForSide("dark")).toBe(DARK_COLORS);
  });

  it("maps every card to its physical opposite side", () => {
    expect(flipColor("red")).toBe("pink");
    expect(flipColor("pink")).toBe("red");
    expect(flipColor("yellow")).toBe("orange");
    expect(flipColor("orange")).toBe("yellow");
    expect(flipColor("green")).toBe("teal");
    expect(flipColor("teal")).toBe("green");
    expect(flipColor("blue")).toBe("purple");
    expect(flipColor("purple")).toBe("blue");

    const cases: Array<[Card, Card]> = [
      [lightRedOne, { id: "dark-pink-1-0", color: "pink", kind: "number", value: 1 }],
      [{ id: "light-red-draw1-0", color: "red", kind: "draw1" },
        { id: "dark-pink-draw5-0", color: "pink", kind: "draw5" }],
      [{ id: "dark-pink-draw5-0", color: "pink", kind: "draw5" },
        { id: "light-red-draw1-0", color: "red", kind: "draw1" }],
      [{ id: "light-red-skip-0", color: "red", kind: "skip" },
        { id: "dark-pink-skipeveryone-0", color: "pink", kind: "skipEveryone" }],
      [{ id: "dark-pink-skipeveryone-0", color: "pink", kind: "skipEveryone" },
        { id: "light-red-skip-0", color: "red", kind: "skip" }],
      [{ id: "light-red-reverse-0", color: "red", kind: "reverse" },
        { id: "dark-pink-reverse-0", color: "pink", kind: "reverse" }],
      [lightRedFlip, { id: "dark-pink-flip-0", color: "pink", kind: "flip" }],
      [lightWild, { id: "dark-wild-0", color: null, kind: "wild" }],
      [{ id: "light-wilddraw2-0", color: null, kind: "wildDraw2" },
        { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" }],
      [{ id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" },
        { id: "light-wilddraw2-0", color: null, kind: "wildDraw2" }],
    ];
    for (const [card, expected] of cases) {
      expect(flipCard(card)).toEqual(expected);
      expect(flipCard(expected)).toEqual(card);
    }
    for (const card of buildDeck("flip")) {
      const flipped = flipCard(card);
      expect(flipped.id.startsWith("dark-")).toBe(true);
      expect(flipCard(flipped)).toEqual(card);
    }
  });

  it("is an authoritative mode with light-side state", () => {
    expect(isGameMode("flip")).toBe(true);
    expect(normalizeMode("flip")).toBe("flip");
    expect(UNO_MODES).toContain("flip");
    const game = createGame(99, players, 0, "flip");
    expect(game.mode).toBe("flip");
    expect(game.flipSide).toBe("light");
    expect(game.drawPile.every((card) => card.id.startsWith("light-"))).toBe(true);
  });
});

describe("Uno Flip flip card", () => {
  it("flips every zone, reverses both piles and sets the top colour", () => {
    const game = staged([lightRedFlip, lightRedOne]);
    game.drawPile = [lightYellowTwo, lightGreenThree];
    game.discard = [lightRedOne, lightBlueFlip];
    game.players[1].hand = [lightYellowFour];
    game.players[2].hand = [lightGreenFive];

    expect(canPlay(game, lightRedFlip)).toBe(true);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: lightRedFlip.id });
    expect(result.ok).toBe(true);
    const state = result.state;
    expect(state.flipSide).toBe("dark");
    expect(state.drawPile.map((card) => card.id)).toEqual(["dark-teal-3-0", "dark-orange-2-0"]);
    expect(state.discard.map((card) => card.id)).toEqual([
      "dark-pink-flip-0", "dark-purple-flip-1", "dark-pink-1-0",
    ]);
    expect(topCard(state).id).toBe("dark-pink-1-0");
    expect(state.currentColor).toBe("pink");
    expect(state.players[0].hand.map((card) => card.id)).toEqual(["dark-pink-1-0"]);
    expect(state.players[1].hand.map((card) => card.id)).toEqual(["dark-orange-4-0"]);
    expect(state.players[2].hand.map((card) => card.id)).toEqual(["dark-teal-5-0"]);
    expect(state.turn).toBe(1);
    expect(state.finished).toBe(false);
  });

  it("uses a supplied colour or the post-flip hand when the new top is wild", () => {
    const game = staged([lightRedFlip, lightRedOne]);
    game.discard = [lightWild];
    game.players[0].hand = [lightRedFlip];
    const supplied = applyAction(game, {
      type: "play", playerId: "p1", cardId: lightRedFlip.id, chosenColor: "teal",
    });
    expect(supplied.ok).toBe(true);
    expect(supplied.state.currentColor).toBe("teal");
    expect(topCard(supplied.state).id).toBe("dark-wild-0");

    const fallback = applyAction(game, { type: "play", playerId: "p1", cardId: lightRedFlip.id });
    expect(fallback.ok).toBe(true);
    expect(fallback.state.currentColor).toBe("pink");
  });

  it("is playable only on a colour or another flip card", () => {
    const game = staged([lightRedFlip, lightGreenThree], "blue");
    game.discard = [lightYellowFour];
    expect(canPlay(game, lightRedFlip)).toBe(false);
    game.discard = [lightBlueFlip];
    expect(canPlay(game, lightRedFlip)).toBe(true);
    game.discard = [lightGreenFive];
    game.currentColor = "red";
    expect(canPlay(game, lightRedFlip)).toBe(true);
  });

  it("does not trigger an action on the new top card", () => {
    const game = staged([lightRedFlip]);
    game.discard = [{ id: "light-red-draw1-0", color: "red", kind: "draw1" }];
    game.players[1].hand = [lightYellowFour];
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: lightRedFlip.id });
    expect(result.ok).toBe(true);
    expect(result.state.players[1].hand.map((card) => card.id)).toEqual(["dark-orange-4-0"]);
    expect(result.state.currentColor).toBe("pink");
  });
});

describe("Uno Flip light actions", () => {
  it("draws one and loses the turn with Draw One", () => {
    const game = staged([{ id: "light-red-draw1-0", color: "red", kind: "draw1" }, lightRedOne]);
    game.drawPile = [lightYellowTwo];
    game.players[1].hand = [lightGreenFour()];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: "light-red-draw1-0",
    });
    expect(result.ok).toBe(true);
    expect(result.state.players[1].hand.map((card) => card.id)).toContain("light-yellow-2-0");
    expect(result.state.turn).toBe(2);
  });

  it("skips the next player and reverses direction", () => {
    const skipGame = staged([{ id: "light-red-skip-0", color: "red", kind: "skip" }]);
    const skipped = applyAction(skipGame, {
      type: "play", playerId: "p1", cardId: "light-red-skip-0",
    });
    expect(skipped.ok).toBe(true);
    expect(skipped.state.turn).toBe(2);

    const reverseGame = staged([{ id: "light-red-reverse-0", color: "red", kind: "reverse" }]);
    const reversed = applyAction(reverseGame, {
      type: "play", playerId: "p1", cardId: "light-red-reverse-0",
    });
    expect(reversed.state.direction).toBe(-1);
    expect(reversed.state.turn).toBe(2);

    const two = staged([{ id: "light-red-reverse-0", color: "red", kind: "reverse" }], "red", 2);
    const twoResult = applyAction(two, {
      type: "play", playerId: "p1", cardId: "light-red-reverse-0",
    });
    expect(twoResult.state.direction).toBe(1);
    expect(twoResult.state.turn).toBe(0);
  });

  it("chooses a colour with Wild", () => {
    const game = staged([lightWild]);
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: lightWild.id, chosenColor: "green",
    });
    expect(result.ok).toBe(true);
    expect(result.state.currentColor).toBe("green");
    expect(result.state.turn).toBe(1);
  });

  it("requires a colour to play Wild Draw Two", () => {
    const game = staged([{ id: "light-wilddraw2-0", color: null, kind: "wildDraw2" }]);
    const missing = applyAction(game, {
      type: "play", playerId: "p1", cardId: "light-wilddraw2-0",
    });
    expect(missing.error).toBe("missing_color");
  });

  it("challenges Wild Draw Two with guilty and innocent outcomes", () => {
    const wildDrawTwo: Card = { id: "light-wilddraw2-0", color: null, kind: "wildDraw2" };
    const guilty = staged([wildDrawTwo, lightRedOne]);
    guilty.drawPile = [lightYellowTwo, lightGreenThree];
    const played = applyAction(guilty, {
      type: "play", playerId: "p1", cardId: wildDrawTwo.id, chosenColor: "yellow",
    });
    expect(played.ok).toBe(true);
    expect(played.state.pendingChallenge).toEqual({
      ownerId: "p1", targetId: "p2", legal: false,
      kind: "wildDraw2", amount: 2, color: "yellow",
    });
    expect(played.state.turn).toBe(0);
    expect(chooseAction(played.state, "p2")).toEqual({
      type: "challenge", playerId: "p2", accept: true,
    });
    const caught = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: true,
    });
    expect(caught.ok).toBe(true);
    expect(caught.state.players[0].hand.map((card) => card.id)).toEqual([
      "light-red-1-0", "light-green-3-0", "light-yellow-2-0",
    ]);
    expect(caught.state.turn).toBe(2);

    const declined = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: false,
    });
    expect(declined.state.players[1].hand.map((card) => card.id)).toEqual([
      "light-green-3-0", "light-yellow-2-0",
    ]);

    const innocent = staged([wildDrawTwo, lightGreenThree]);
    innocent.drawPile = [lightYellowTwo, lightGreenThree, lightYellowFour, lightGreenFive];
    const clean = applyAction(innocent, {
      type: "play", playerId: "p1", cardId: wildDrawTwo.id, chosenColor: "yellow",
    });
    expect(clean.state.pendingChallenge?.legal).toBe(true);
    const accepted = applyAction(clean.state, {
      type: "challenge", playerId: "p2", accept: true,
    });
    expect(accepted.state.players[1].hand).toHaveLength(4);
    expect(accepted.state.players[1].hand.map((card) => card.id)).toEqual([
      "light-green-5-0", "light-yellow-4-0", "light-green-3-0", "light-yellow-2-0",
    ]);
    expect(accepted.state.turn).toBe(2);
  });
});

function lightGreenFour(): Card {
  return { id: "light-green-4-0", color: "green", kind: "number", value: 4 };
}

describe("Uno Flip dark actions", () => {
  it("draws five and loses the turn with Draw Five", () => {
    const game = darkStaged([{ id: "dark-pink-draw5-0", color: "pink", kind: "draw5" }]);
    game.drawPile = [
      { id: "dark-teal-1-0", color: "teal", kind: "number", value: 1 },
      { id: "dark-teal-2-0", color: "teal", kind: "number", value: 2 },
      { id: "dark-teal-3-0", color: "teal", kind: "number", value: 3 },
      { id: "dark-teal-4-0", color: "teal", kind: "number", value: 4 },
      { id: "dark-teal-5-0", color: "teal", kind: "number", value: 5 },
    ];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: "dark-pink-draw5-0",
    });
    expect(result.ok).toBe(true);
    expect(result.state.players[1].hand).toHaveLength(5);
    expect(result.state.turn).toBe(2);
  });

  it("skips everyone and reverses with two players", () => {
    const everyone = darkStaged([
      { id: "dark-pink-skipeveryone-0", color: "pink", kind: "skipEveryone" },
    ], "pink", 3);
    const skipped = applyAction(everyone, {
      type: "play", playerId: "p1", cardId: "dark-pink-skipeveryone-0",
    });
    expect(skipped.state.turn).toBe(0);
    expect(legalMoves(skipped.state, "p2").cards).toEqual([]);

    const two = darkStaged([
      { id: "dark-pink-reverse-0", color: "pink", kind: "reverse" },
    ], "pink", 2);
    const reversed = applyAction(two, {
      type: "play", playerId: "p1", cardId: "dark-pink-reverse-0",
    });
    expect(reversed.state.turn).toBe(0);
    expect(reversed.state.direction).toBe(1);
  });

  it("draws until the chosen colour appears and ignores wilds", () => {
    const wildDrawColor: Card = { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" };
    const game = darkStaged([wildDrawColor]);
    game.drawPile = [
      { id: "dark-pink-1-0", color: "pink", kind: "number", value: 1 },
      { id: "dark-pink-9-0", color: "pink", kind: "number", value: 9 },
      { id: "dark-orange-9-0", color: "orange", kind: "number", value: 9 },
      { id: "dark-teal-3-0", color: "teal", kind: "number", value: 3 },
      lightWild,
      { id: "dark-orange-2-0", color: "orange", kind: "number", value: 2 },
    ];
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildDrawColor.id, chosenColor: "teal",
    });
    expect(played.ok).toBe(true);
    expect(played.state.pendingChallenge).toEqual({
      ownerId: "p1", targetId: "p2", legal: true,
      kind: "wildDrawColor", amount: 0, color: "teal",
    });
    const taken = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: false,
    });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[1].hand.map((card) => card.id)).toEqual([
      "dark-orange-2-0", "light-wild-0", "dark-teal-3-0",
    ]);
    expect(taken.state.drawPile.map((card) => card.id)).toEqual([
      "dark-pink-1-0", "dark-pink-9-0", "dark-orange-9-0",
    ]);
    expect(taken.state.turn).toBe(2);

    const accepted = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: true,
    });
    expect(accepted.state.players[1].hand).toHaveLength(5);
    expect(accepted.state.players[1].hand.map((card) => card.id)).toEqual([
      "dark-orange-2-0", "light-wild-0", "dark-teal-3-0", "dark-orange-9-0", "dark-pink-9-0",
    ]);
    expect(accepted.state.turn).toBe(2);
  });

  it("makes a guilty owner draw until the colour and not the challenger", () => {
    const wildDrawColor: Card = { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" };
    const game = darkStaged([wildDrawColor, { id: "dark-pink-2-0", color: "pink", kind: "number", value: 2 }]);
    game.drawPile = [
      { id: "dark-pink-1-0", color: "pink", kind: "number", value: 1 },
      { id: "dark-teal-4-0", color: "teal", kind: "number", value: 4 },
      { id: "dark-orange-2-0", color: "orange", kind: "number", value: 2 },
    ];
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildDrawColor.id, chosenColor: "teal",
    });
    expect(played.state.pendingChallenge?.legal).toBe(false);
    expect(chooseAction(played.state, "p2")).toEqual({
      type: "challenge", playerId: "p2", accept: true,
    });
    const caught = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: true,
    });
    expect(caught.state.players[0].hand.map((card) => card.id)).toEqual([
      "dark-pink-2-0", "dark-orange-2-0", "dark-teal-4-0",
    ]);
    expect(caught.state.players[1].hand).toEqual([]);
    expect(caught.state.turn).toBe(2);
  });
});

describe("Uno Flip final-card effects", () => {
  it("resolves Draw One before declaring the winner", () => {
    const game = staged([{ id: "light-red-draw1-0", color: "red", kind: "draw1" }]);
    game.drawPile = [lightYellowTwo];
    const result = applyAction(game, {
      type: "play", playerId: "p1", cardId: "light-red-draw1-0",
    });
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
    expect(result.state.players[1].hand.map((card) => card.id)).toContain("light-yellow-2-0");
  });

  it("flips and wins with a final Flip card", () => {
    const game = staged([lightRedFlip]);
    game.discard = [lightRedOne, lightBlueFlip];
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: lightRedFlip.id });
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
    expect(result.state.flipSide).toBe("dark");
  });

  it("defers a final Wild Draw Two win until the challenge resolves", () => {
    const wildDrawTwo: Card = { id: "light-wilddraw2-0", color: null, kind: "wildDraw2" };
    const game = staged([wildDrawTwo]);
    game.drawPile = [lightYellowTwo, lightGreenThree, lightYellowFour, lightGreenFive];
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildDrawTwo.id, chosenColor: "yellow",
    });
    expect(played.state.finished).toBe(false);
    expect(played.state.pendingChallenge).not.toBeNull();
    const challenged = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: true,
    });
    expect(challenged.state.players[1].hand).toHaveLength(4);
    expect(challenged.state.finished).toBe(true);
    expect(challenged.state.winner).toBe("p1");
    const declined = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: false,
    });
    expect(declined.state.players[1].hand).toHaveLength(2);
    expect(declined.state.finished).toBe(true);
    expect(declined.state.winner).toBe("p1");
  });

  it("defers a final Wild Draw Color win until the challenge resolves", () => {
    const wildDrawColor: Card = { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" };
    const game = darkStaged([wildDrawColor]);
    game.drawPile = [{ id: "dark-teal-3-0", color: "teal", kind: "number", value: 3 }];
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildDrawColor.id, chosenColor: "teal",
    });
    expect(played.state.finished).toBe(false);
    const innocent = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: true,
    });
    expect(innocent.state.finished).toBe(true);
    expect(innocent.state.winner).toBe("p1");
    const guilty = applyAction(played.state, {
      type: "challenge", playerId: "p2", accept: false,
    });
    expect(guilty.state.finished).toBe(true);
    expect(guilty.state.winner).toBe("p1");
  });
});

describe("Uno Flip AI", () => {
  it("chooses dark colours on the dark side and stays deterministic", () => {
    const game = darkStaged([
      { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" },
      { id: "dark-teal-3-0", color: "teal", kind: "number", value: 3 },
      { id: "dark-teal-4-0", color: "teal", kind: "number", value: 4 },
      { id: "dark-pink-1-0", color: "pink", kind: "number", value: 1 },
    ]);
    const action = chooseAction(game, "p1");
    expect(action).toEqual({
      type: "play", playerId: "p1", cardId: "dark-wilddrawcolor-0", chosenColor: "teal",
    });
    expect(chooseAction(game, "p1")).toEqual(action);
  });

  it("never stalls with a pending challenge or an open flip", () => {
    const game = staged([lightRedFlip, lightRedOne]);
    const flip = applyAction(game, { type: "play", playerId: "p1", cardId: lightRedFlip.id });
    expect(chooseAction(flip.state, "p2")).not.toBeNull();

    const wildDrawTwo: Card = { id: "light-wilddraw2-0", color: null, kind: "wildDraw2" };
    const challenge = applyAction(staged([wildDrawTwo]), {
      type: "play", playerId: "p1", cardId: wildDrawTwo.id, chosenColor: "red",
    });
    expect(chooseAction(challenge.state, "p2")).toEqual({
      type: "challenge", playerId: "p2", accept: false,
    });
  });
});
