import { describe, expect, it } from "vitest";
import {
  applyAction,
  buildDeck,
  canPlay,
  cloneState,
  createGame,
  DEFAULT_RULES,
  legalMoves,
  mostCommonColor,
  scoreHand,
  shuffle,
  topCard,
  type Card,
  type CardKind,
  type Color,
  type GameState,
} from "../src/index";
import vectors from "../../tests/vectors.json";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

function findSeed(kind: CardKind): number {
  for (let seed = 1; seed < 10000; seed += 1) {
    if (createGame(seed, players).startingRule?.kind === kind) {
      return seed;
    }
  }
  throw new Error(`no seed found for ${kind}`);
}

function stagedGame(hand: Card[], color: Color = "red"): GameState {
  const game = createGame(vectors.seed, players);
  game.turn = 0;
  game.direction = 1;
  game.currentColor = color;
  game.drawnCardId = null;
  game.pendingChallenge = null;
  game.finished = false;
  game.winner = null;
  game.players[0].hand = hand.slice();
  return game;
}

const wildFour: Card = { id: "wild4-0", color: null, kind: "wild4" };
const redZero: Card = { id: "red-0-0", color: "red", kind: "number", value: 0 };
const blueZero: Card = { id: "blue-0-0", color: "blue", kind: "number", value: 0 };
const blueDrawTwo: Card = { id: "blue-draw2-0", color: "blue", kind: "draw2" };

describe("Uno classic rules", () => {
  it("builds a 108 card deck and shuffles deterministically", () => {
    expect(buildDeck()).toHaveLength(vectors.deckSize);
    const shuffled = shuffle(vectors.seed, buildDeck());
    expect(shuffled.cards.slice(0, 12).map((card) => card.id)).toEqual(vectors.shuffledHead);
  });

  it("deals the recorded hand and applies the starting Draw Two", () => {
    const game = createGame(vectors.seed, players);
    expect(game.players[0].hand.map((card) => card.id)).toEqual(vectors.startingHand);
    expect(game.players[0].hand).toHaveLength(
      DEFAULT_RULES.handSize + DEFAULT_RULES.drawTwoAmount,
    );
    expect(game.discard[0].id).toBe(vectors.startingDiscard);
    expect(game.discard[0].kind).toBe("draw2");
    expect(game.currentColor).toBe(vectors.startingColor);
    expect(topCard(game).kind).toBe("draw2");
    expect(game.turn).toBe(1);
    expect(game.direction).toBe(1);
    expect(game.startingRule?.drewCards).toEqual([
      vectors.startingHand[vectors.startingHand.length - 2],
      vectors.startingHand[vectors.startingHand.length - 1],
    ]);
  });

  it("never starts on a Wild Draw Four", () => {
    for (let seed = 1; seed < 200; seed += 1) {
      const game = createGame(seed, players);
      expect(game.discard[0].kind).not.toBe("wild4");
      expect(game.startingRule?.kind).not.toBe("wild4");
    }
  });

  it("lets the first player choose the colour of a Wild starter", () => {
    const game = createGame(findSeed("wild"), players);
    expect(game.discard[0].kind).toBe("wild");
    expect(game.discard[0].color).toBe(mostCommonColor(game.players[0].hand));
    expect(game.currentColor).toBe(mostCommonColor(game.players[0].hand));
    expect(game.turn).toBe(0);
    expect(game.direction).toBe(1);
  });

  it("skips the first player when the starter is Skip", () => {
    const game = createGame(findSeed("skip"), players);
    expect(game.discard[0].kind).toBe("skip");
    expect(game.turn).toBe(1);
    expect(game.direction).toBe(1);
    expect(game.players.every((player) => player.hand.length === DEFAULT_RULES.handSize)).toBe(true);
  });

  it("makes the last seat the dealer when the starter is Reverse", () => {
    const game = createGame(findSeed("reverse"), players);
    expect(game.discard[0].kind).toBe("reverse");
    expect(game.turn).toBe(players.length - 1);
    expect(game.direction).toBe(-1);
  });

  it("reports the legal moves of the player who actually starts", () => {
    const game = createGame(vectors.seed, players);
    expect(legalMoves(game, "p1")).toEqual({ cards: [], canDraw: false });
    expect(legalMoves(game, game.players[game.turn].id)).toEqual(vectors.startingLegal);
  });

  it("only allows legal cards and drawing", () => {
    const game = createGame(vectors.seed, players);
    const actor = game.players[game.turn];
    const illegal = actor.hand.find((card) => !canPlay(game, card));
    if (illegal !== undefined) {
      const result = applyAction(game, { type: "play", playerId: actor.id, cardId: illegal.id });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("illegal_card");
    }
    const result = applyAction(game, { type: "draw", playerId: actor.id });
    expect(result.ok).toBe(true);
  });

  it("rejects a turn from another player", () => {
    const game = createGame(vectors.seed, players);
    const result = applyAction(game, { type: "draw", playerId: "p1" });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_your_turn");
  });

  it("scores a hand", () => {
    expect(scoreHand(buildDeck().slice(0, 0))).toBe(0);
    const game = createGame(vectors.seed, players);
    expect(scoreHand(game.players[0].hand)).toBeGreaterThan(0);
  });

  it("rejects a second draw while a drawn card is pending", () => {
    const game = createGame(vectors.seed, players);
    const pending = cloneState(game);
    const actor = pending.players[pending.turn];
    pending.drawnCardId = actor.hand[0].id;
    const second = applyAction(pending, { type: "draw", playerId: actor.id });
    expect(second.ok).toBe(false);
    expect(second.error).toBe("illegal_card");
    expect(legalMoves(pending, actor.id).canDraw).toBe(false);
  });

  it("keeps a drawn Wild Draw Four playable even as a bluff", () => {
    const game = stagedGame([wildFour, redZero], "red");
    game.drawnCardId = wildFour.id;
    expect(legalMoves(game, "p1")).toEqual({ cards: [wildFour.id], canDraw: false });
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "green",
    });
    expect(result.ok).toBe(true);
    expect(result.state.pendingChallenge).toEqual({ ownerId: "p1", targetId: "p2", legal: false });
  });
});

describe("Uno wild four challenges", () => {
  function bluff(): GameState {
    return stagedGame([wildFour, redZero], "red");
  }

  function innocent(): GameState {
    return stagedGame([wildFour, blueZero], "red");
  }

  function play(game: GameState): GameState {
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "green",
    });
    expect(result.ok).toBe(true);
    expect(result.state.turn).toBe(0);
    expect(result.state.finished).toBe(false);
    return result.state;
  }

  it("allows an illegal bluff and marks the pending challenge guilty", () => {
    const game = bluff();
    expect(legalMoves(game, "p1").cards).toContain(wildFour.id);
    const state = play(game);
    expect(state.pendingChallenge).toEqual({ ownerId: "p1", targetId: "p2", legal: false });
  });

  it("marks a legal Wild Draw Four innocent", () => {
    const state = play(innocent());
    expect(state.pendingChallenge).toEqual({ ownerId: "p1", targetId: "p2", legal: true });
  });

  it("makes the owner draw four when a guilty play is challenged", () => {
    const game = bluff();
    const targetBefore = game.players[1].hand.length;
    const state = applyAction(play(game), { type: "challenge", playerId: "p2", accept: true });
    expect(state.ok).toBe(true);
    expect(state.state.pendingChallenge).toBeNull();
    expect(state.state.players[0].hand).toHaveLength(1 + DEFAULT_RULES.wildFourAmount);
    expect(state.state.players[1].hand).toHaveLength(targetBefore);
    expect(state.state.turn).toBe(2);
    expect(state.state.finished).toBe(false);
  });

  it("makes the target draw six when an innocent play is challenged", () => {
    const game = innocent();
    const targetBefore = game.players[1].hand.length;
    const state = applyAction(play(game), { type: "challenge", playerId: "p2", accept: true });
    expect(state.ok).toBe(true);
    expect(state.state.players[0].hand).toHaveLength(1);
    expect(state.state.players[1].hand).toHaveLength(targetBefore + DEFAULT_RULES.challengePenalty);
    expect(state.state.turn).toBe(2);
  });

  it("makes the target take four when the challenge is declined", () => {
    const game = bluff();
    const targetBefore = game.players[1].hand.length;
    const state = applyAction(play(game), { type: "challenge", playerId: "p2", accept: false });
    expect(state.ok).toBe(true);
    expect(state.state.players[0].hand).toHaveLength(1);
    expect(state.state.players[1].hand).toHaveLength(targetBefore + DEFAULT_RULES.wildFourAmount);
    expect(state.state.turn).toBe(2);
  });

  it("refuses a challenge from the owner or an unknown player", () => {
    const pending = play(bluff());
    const owner = applyAction(pending, { type: "challenge", playerId: "p1", accept: true });
    expect(owner.ok).toBe(false);
    expect(owner.error).toBe("bad_challenge");
    const stranger = applyAction(pending, { type: "challenge", playerId: "nobody", accept: true });
    expect(stranger.ok).toBe(false);
    expect(stranger.error).toBe("bad_challenge");
  });
});

describe("Uno final card effects", () => {
  it("makes the next player draw two before a final Draw Two wins", () => {
    const game = stagedGame([blueDrawTwo], "blue");
    const targetBefore = game.players[1].hand.length;
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: blueDrawTwo.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.players[1].hand).toHaveLength(targetBefore + DEFAULT_RULES.drawTwoAmount);
    expect(result.state.turn).toBe(2);
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
  });

  it("waits for the challenge before a final Wild Draw Four wins", () => {
    const game = stagedGame([wildFour], "red");
    const targetBefore = game.players[1].hand.length;
    const played = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "blue",
    });
    expect(played.ok).toBe(true);
    expect(played.state.pendingChallenge).toEqual({ ownerId: "p1", targetId: "p2", legal: true });
    expect(played.state.finished).toBe(false);
    expect(played.state.winner).toBeNull();
    const answered = applyAction(played.state, {
      type: "challenge",
      playerId: "p2",
      accept: false,
    });
    expect(answered.ok).toBe(true);
    expect(answered.state.players[1].hand).toHaveLength(targetBefore + DEFAULT_RULES.wildFourAmount);
    expect(answered.state.finished).toBe(true);
    expect(answered.state.winner).toBe("p1");
  });

  it("lets the owner win a final Wild Draw Four after an innocent challenge", () => {
    const game = stagedGame([wildFour], "red");
    const targetBefore = game.players[1].hand.length;
    const played = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "blue",
    });
    const answered = applyAction(played.state, {
      type: "challenge",
      playerId: "p2",
      accept: true,
    });
    expect(answered.ok).toBe(true);
    expect(answered.state.players[0].hand).toHaveLength(0);
    expect(answered.state.players[1].hand).toHaveLength(targetBefore + DEFAULT_RULES.challengePenalty);
    expect(answered.state.finished).toBe(true);
    expect(answered.state.winner).toBe("p1");
  });

  it("finishes immediately on an ordinary final card", () => {
    const game = stagedGame([blueZero], "blue");
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: blueZero.id });
    expect(result.ok).toBe(true);
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p1");
  });
});
