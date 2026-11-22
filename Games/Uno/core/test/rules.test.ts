import { describe, expect, it } from "vitest";
import {
  applyAction,
  buildDeck,
  canPlay,
  cloneState,
  createGame,
  DEFAULT_RULES,
  isGameMode,
  legalMoves,
  mostCommonColor,
  normalizeMode,
  scoreHand,
  shuffle,
  topCard,
  type Card,
  type CardKind,
  type Color,
  type GameMode,
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

function stagedGame(hand: Card[], color: Color = "red", mode: GameMode = "classic"): GameState {
  const game = createGame(vectors.seed, players, 0, mode);
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
const redSeven: Card = { id: "red-7-0", color: "red", kind: "number", value: 7 };
const blueDrawTwo: Card = { id: "blue-draw2-0", color: "blue", kind: "draw2" };
const greenDrawTwo: Card = { id: "green-draw2-0", color: "green", kind: "draw2" };
const yellowDrawTwo: Card = { id: "yellow-draw2-0", color: "yellow", kind: "draw2" };
const secondWildFour: Card = { id: "wild4-1", color: null, kind: "wild4" };
const greenZero: Card = { id: "green-0-0", color: "green", kind: "number", value: 0 };

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

describe("Uno Seven-O house rule", () => {
  function hands(state: GameState): string[][] {
    return state.players.map((player) => player.hand.map((card) => card.id));
  }

  it("defaults to classic and records the explicit mode in state", () => {
    const classic = createGame(vectors.seed, players);
    const sevenO = createGame(vectors.seed, players, 0, "sevenO");
    expect(classic.mode).toBe("classic");
    expect(sevenO.mode).toBe("sevenO");
    expect(classic.version).toBe(2);
    expect(sevenO.version).toBe(2);
    expect(sevenO.players.map((player) => player.hand)).toEqual(classic.players.map((player) => player.hand));
  });

  it("swaps the actor's whole hand with the chosen target", () => {
    const game = stagedGame([redSeven, blueZero], "red", "sevenO");
    const before = hands(game);
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: redSeven.id,
      targetId: "p2",
    });
    expect(result.ok).toBe(true);
    expect(hands(result.state)).toEqual([before[1], [blueZero.id], before[2]]);
    expect(result.state.turn).toBe(1);
    expect(result.state.direction).toBe(1);
    expect(result.state.finished).toBe(false);
  });

  it("accepts the snake_case target alias", () => {
    const game = stagedGame([redSeven], "red", "sevenO");
    const before = hands(game);
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: redSeven.id,
      target_id: "p3",
    });
    expect(result.ok).toBe(true);
    expect(hands(result.state)[0]).toEqual(before[2]);
    expect(hands(result.state)[2]).toEqual([]);
  });

  it("checks the swap before declaring a winner", () => {
    const game = stagedGame([redSeven], "red", "sevenO");
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: redSeven.id,
      targetId: "p2",
    });
    expect(result.ok).toBe(true);
    expect(result.state.finished).toBe(false);
    expect(result.state.winner).toBeNull();
    expect(result.state.players[0].hand.length).toBeGreaterThan(0);
  });

  it("rejects a seven with no target id", () => {
    const game = stagedGame([redSeven, blueZero], "red", "sevenO");
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redSeven.id });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing_target");
    expect(result.state).toBe(game);
  });

  it("rejects a seven targeting the actor or an unknown player", () => {
    for (const targetId of ["p1", "nobody"]) {
      const game = stagedGame([redSeven, blueZero], "red", "sevenO");
      const result = applyAction(game, {
        type: "play",
        playerId: "p1",
        cardId: redSeven.id,
        targetId,
      });
      expect(result.ok).toBe(false);
      expect(result.error).toBe("missing_target");
    }
  });

  it("rotates every hand to the next player clockwise on zero", () => {
    const game = stagedGame([redZero], "red", "sevenO");
    const before = hands(game);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redZero.id });
    expect(result.ok).toBe(true);
    expect(hands(result.state)).toEqual([before[2], [], before[1]]);
    expect(result.state.turn).toBe(1);
    expect(result.state.direction).toBe(1);
    expect(result.state.finished).toBe(false);
  });

  it("rotates every hand to the next player counter-clockwise on zero", () => {
    const game = stagedGame([redZero], "red", "sevenO");
    game.direction = -1;
    const before = hands(game);
    const result = applyAction(game, { type: "play", playerId: "p1", cardId: redZero.id });
    expect(result.ok).toBe(true);
    expect(hands(result.state)).toEqual([before[1], before[2], []]);
    expect(result.state.turn).toBe(2);
    expect(result.state.direction).toBe(-1);
    expect(result.state.finished).toBe(false);
  });

  it("leaves classic hands untouched by seven and zero", () => {
    const seven = stagedGame([redSeven, blueZero], "red");
    const sevenResult = applyAction(seven, {
      type: "play",
      playerId: "p1",
      cardId: redSeven.id,
      targetId: "p2",
    });
    expect(sevenResult.ok).toBe(true);
    expect(hands(sevenResult.state)[1]).toEqual(hands(seven)[1]);
    expect(sevenResult.state.players[0].hand.map((card) => card.id)).toEqual([blueZero.id]);

    const zero = stagedGame([redZero, blueZero], "red");
    const before = hands(zero);
    const zeroResult = applyAction(zero, { type: "play", playerId: "p1", cardId: redZero.id });
    expect(zeroResult.ok).toBe(true);
    expect(hands(zeroResult.state)).toEqual([[blueZero.id], before[1], before[2]]);
  });
});

describe("Uno Progressive house rule", () => {
  function progressive(hand: Card[], color: Color = "red"): GameState {
    return stagedGame(hand, color, "progressive");
  }

  it("exposes progressive as a valid mode with an empty pending stack", () => {
    const game = createGame(vectors.seed, players, 0, "progressive");
    expect(game.mode).toBe("progressive");
    expect(game.pendingStack).toBeNull();
    expect(isGameMode("progressive")).toBe(true);
    expect(normalizeMode("progressive")).toBe("progressive");
  });

  it("sets a Draw Two stack instead of drawing immediately", () => {
    const game = progressive([blueDrawTwo, redZero], "blue");
    const targetBefore = game.players[1].hand.length;
    const result = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: blueDrawTwo.id,
    });
    expect(result.ok).toBe(true);
    expect(result.state.pendingStack).toEqual({
      kind: "draw2",
      amount: 2,
      ownerId: "p1",
      targetId: "p2",
    });
    expect(result.state.players[1].hand).toHaveLength(targetBefore);
    expect(result.state.turn).toBe(1);
    expect(result.state.finished).toBe(false);
  });

  it("stacks Draw Twos and makes the final target take the accumulated amount", () => {
    const game = progressive([blueDrawTwo], "blue");
    const played = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: blueDrawTwo.id,
    });
    expect(played.state.finished).toBe(false);
    expect(played.state.pendingStack?.pendingWinnerId).toBe("p1");

    const withSecond = cloneState(played.state);
    withSecond.players[1].hand = [greenDrawTwo];
    const stacked = applyAction(withSecond, {
      type: "play",
      playerId: "p2",
      cardId: greenDrawTwo.id,
    });
    expect(stacked.ok).toBe(true);
    expect(stacked.state.pendingStack).toMatchObject({
      kind: "draw2",
      amount: 4,
      ownerId: "p2",
      targetId: "p3",
      pendingWinnerId: "p1",
    });
    const thirdBefore = stacked.state.players[2].hand.length;
    const taken = applyAction(stacked.state, { type: "draw", playerId: "p3" });
    expect(taken.ok).toBe(true);
    expect(taken.state.pendingStack).toBeNull();
    expect(taken.state.players[2].hand).toHaveLength(thirdBefore + 4);
    expect(taken.state.finished).toBe(true);
    expect(taken.state.winner).toBe("p1");
  });

  it("declares the deferred Draw Two winner when the first stack is taken", () => {
    const game = progressive([blueDrawTwo], "blue");
    const targetBefore = game.players[1].hand.length;
    const played = applyAction(game, {
      type: "play",
      playerId: "p1",
      cardId: blueDrawTwo.id,
    });
    expect(played.state.finished).toBe(false);
    expect(played.state.winner).toBeNull();
    const taken = applyAction(played.state, { type: "draw", playerId: "p2" });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[1].hand).toHaveLength(targetBefore + 2);
    expect(taken.state.finished).toBe(true);
    expect(taken.state.winner).toBe("p1");
  });

  it("keeps the hand alive when a Draw Two stack returns to the owner", () => {
    const played = applyAction(progressive([blueDrawTwo], "blue"), {
      type: "play",
      playerId: "p1",
      cardId: blueDrawTwo.id,
    });
    const withSecond = cloneState(played.state);
    withSecond.players[1].hand = [greenDrawTwo];
    const stackedTwice = applyAction(withSecond, {
      type: "play",
      playerId: "p2",
      cardId: greenDrawTwo.id,
    });
    expect(stackedTwice.state.pendingStack?.amount).toBe(4);
    const withThird = cloneState(stackedTwice.state);
    withThird.players[2].hand = [yellowDrawTwo];
    const stackedThrice = applyAction(withThird, {
      type: "play",
      playerId: "p3",
      cardId: yellowDrawTwo.id,
    });
    expect(stackedThrice.state.pendingStack?.amount).toBe(6);
    expect(stackedThrice.state.pendingStack?.targetId).toBe("p1");
    const taken = applyAction(stackedThrice.state, { type: "draw", playerId: "p1" });
    expect(taken.ok).toBe(true);
    expect(taken.state.players[0].hand.length).toBeGreaterThan(0);
    expect(taken.state.finished).toBe(false);
  });

  it("rejects cross-stacking a Wild Four onto a Draw Two stack", () => {
    const played = applyAction(progressive([blueDrawTwo, redZero], "blue"), {
      type: "play",
      playerId: "p1",
      cardId: blueDrawTwo.id,
    });
    const withWild = cloneState(played.state);
    withWild.players[1].hand = [wildFour];
    expect(legalMoves(withWild, "p2")).toEqual({ cards: [], canDraw: true });
    const result = applyAction(withWild, {
      type: "play",
      playerId: "p2",
      cardId: wildFour.id,
      chosenColor: "green",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("illegal_card");
  });

  it("sets a stacked Wild Four and resolves an innocent challenge by the accumulated amount", () => {
    const played = applyAction(progressive([wildFour, blueZero], "red"), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "green",
    });
    expect(played.state.pendingStack).toMatchObject({
      kind: "wild4",
      amount: 4,
      ownerId: "p1",
      targetId: "p2",
      legal: true,
      color: "green",
    });
    const withSecond = cloneState(played.state);
    withSecond.players[1].hand = [secondWildFour, blueZero];
    const stacked = applyAction(withSecond, {
      type: "play",
      playerId: "p2",
      cardId: secondWildFour.id,
      chosenColor: "yellow",
    });
    expect(stacked.ok).toBe(true);
    expect(stacked.state.pendingStack).toMatchObject({
      amount: 8,
      ownerId: "p2",
      targetId: "p3",
      legal: true,
      color: "yellow",
    });
    expect(stacked.state.currentColor).toBe("yellow");
    const thirdBefore = stacked.state.players[2].hand.length;
    const challenged = applyAction(stacked.state, {
      type: "challenge",
      playerId: "p3",
      accept: true,
    });
    expect(challenged.ok).toBe(true);
    expect(challenged.state.players[2].hand).toHaveLength(thirdBefore + 10);
    expect(challenged.state.pendingStack).toBeNull();
    expect(challenged.state.pendingChallenge).toBeNull();
  });

  it("makes the last Wild Four owner draw the accumulated amount on a guilty challenge", () => {
    const played = applyAction(progressive([wildFour, greenZero], "green"), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "blue",
    });
    expect(played.state.pendingChallenge?.legal).toBe(false);
    const withSecond = cloneState(played.state);
    withSecond.players[1].hand = [secondWildFour, blueZero];
    const stacked = applyAction(withSecond, {
      type: "play",
      playerId: "p2",
      cardId: secondWildFour.id,
      chosenColor: "yellow",
    });
    expect(stacked.state.pendingStack?.legal).toBe(false);
    expect(stacked.state.pendingStack?.amount).toBe(8);
    const challenged = applyAction(stacked.state, {
      type: "challenge",
      playerId: "p3",
      accept: true,
    });
    expect(challenged.ok).toBe(true);
    expect(challenged.state.players[1].hand).toHaveLength(1 + 8);
  });

  it("makes the target take the accumulated amount when a stacked Wild Four is declined", () => {
    const played = applyAction(progressive([wildFour, blueZero], "red"), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "green",
    });
    const withSecond = cloneState(played.state);
    withSecond.players[1].hand = [secondWildFour, blueZero];
    const stacked = applyAction(withSecond, {
      type: "play",
      playerId: "p2",
      cardId: secondWildFour.id,
      chosenColor: "yellow",
    });
    const thirdBefore = stacked.state.players[2].hand.length;
    const declined = applyAction(stacked.state, {
      type: "challenge",
      playerId: "p3",
      accept: false,
    });
    expect(declined.ok).toBe(true);
    expect(declined.state.players[2].hand).toHaveLength(thirdBefore + 8);
  });

  it("rejects cross-stacking a Draw Two onto a Wild Four stack", () => {
    const played = applyAction(progressive([wildFour, blueZero], "red"), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "blue",
    });
    const withDraw = cloneState(played.state);
    withDraw.players[1].hand = [blueDrawTwo];
    expect(legalMoves(withDraw, "p2").cards).toEqual([]);
    const result = applyAction(withDraw, {
      type: "play",
      playerId: "p2",
      cardId: blueDrawTwo.id,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("illegal_card");
  });

  it("defers a final Wild Four win until the stack resolves", () => {
    const played = applyAction(progressive([wildFour], "red"), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "blue",
    });
    expect(played.state.finished).toBe(false);
    expect(played.state.pendingStack?.pendingWinnerId).toBe("p1");
    const targetBefore = played.state.players[1].hand.length;
    const declined = applyAction(played.state, {
      type: "challenge",
      playerId: "p2",
      accept: false,
    });
    expect(declined.ok).toBe(true);
    expect(declined.state.players[1].hand).toHaveLength(targetBefore + 4);
    expect(declined.state.finished).toBe(true);
    expect(declined.state.winner).toBe("p1");
  });

  it("withholds a final Wild Four win after a guilty challenge", () => {
    const played = applyAction(progressive([wildFour, greenZero], "green"), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: "blue",
    });
    const challenged = applyAction(played.state, {
      type: "challenge",
      playerId: "p2",
      accept: true,
    });
    expect(challenged.ok).toBe(true);
    expect(challenged.state.players[0].hand).toHaveLength(1 + 4);
    expect(challenged.state.finished).toBe(false);
  });

});

describe("Uno Stack Pack", () => {
  const stackOne: Card = { id: "blue-stack1-0", color: "blue", kind: "stack1" };
  const redStackOne: Card = { id: "red-stack1-0", color: "red", kind: "stack1" };
  const stackTwo: Card = { id: "green-stack2-0", color: "green", kind: "stack2" };
  const wildStackThree: Card = { id: "wildstack3-0", color: null, kind: "wildStack3" };
  const wildStackNumber: Card = { id: "wildstacknumber-0", color: null, kind: "wildStackNumber" };

  it("builds a Stack Pack deck with sixteen added cards", () => {
    const deck = buildDeck("stackPack");
    expect(deck).toHaveLength(124);
    for (const kind of ["stack1", "stack2", "wildStack3", "wildStackNumber"] as CardKind[]) {
      expect(deck.filter((card) => card.kind === kind)).toHaveLength(4);
    }
  });

  it("starts a Stack One penalty and lets the target chain a Stack Two", () => {
    const game = stagedGame([stackOne], "blue", "stackPack");
    game.players[1].hand = [stackTwo, wildStackThree];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: stackOne.id });
    expect(played.state.pendingStack).toMatchObject({
      kind: "stack1", amount: 1, color: "blue", targetId: "p2",
    });
    expect(legalMoves(played.state, "p2").cards).toContain(stackTwo.id);
    expect(legalMoves(played.state, "p2").cards).toContain(wildStackThree.id);

    const chained = applyAction(played.state, { type: "play", playerId: "p2", cardId: stackTwo.id });
    expect(chained.state.pendingStack?.amount).toBe(3);
    expect(chained.state.pendingStack?.kind).toBe("stack2");
    expect(chained.state.pendingStack?.targetId).toBe("p3");
    expect(chained.state.events.at(-1)?.type).toBe("stack");
    expect(chained.state.replay.at(-1)).toMatchObject({ action: "stack", count: 2 });
  });

  it("lets a coloured stack answer a matching Draw Two", () => {
    const blueStackTwo: Card = { id: "blue-stack2-0", color: "blue", kind: "stack2" };
    const game = stagedGame([blueDrawTwo], "blue", "stackPack");
    game.players[1].hand = [stackTwo, blueStackTwo];
    const draw = applyAction(game, { type: "play", playerId: "p1", cardId: blueDrawTwo.id });
    expect(draw.state.pendingStack).toMatchObject({ kind: "draw2", amount: 2, color: "blue" });
    expect(legalMoves(draw.state, "p2").cards).not.toContain(stackTwo.id);
    expect(legalMoves(draw.state, "p2").cards).toContain(blueStackTwo.id);
    const answered = applyAction(draw.state, { type: "play", playerId: "p2", cardId: blueStackTwo.id });
    expect(answered.state.pendingStack?.amount).toBe(4);
  });

  it("lets Wild Stack Three answer any stack and choose the colour", () => {
    const game = stagedGame([stackOne], "blue", "stackPack");
    game.players[1].hand = [wildStackThree];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: stackOne.id });
    const answered = applyAction(played.state, {
      type: "play", playerId: "p2", cardId: wildStackThree.id, chosenColor: "yellow",
    });
    expect(answered.ok).toBe(true);
    expect(answered.state.pendingStack).toMatchObject({
      kind: "wildStack3", amount: 4, color: "yellow", targetId: "p3",
    });
    expect(answered.state.currentColor).toBe("yellow");
  });

  it("reveals a deterministic Wild Stack Number amount", () => {
    const game = stagedGame([wildStackNumber], "blue", "stackPack");
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildStackNumber.id, chosenColor: "green",
    });
    expect(played.ok).toBe(true);
    expect(played.state.pendingStack?.kind).toBe("wildStackNumber");
    expect(played.state.pendingStack?.amount).toBeGreaterThanOrEqual(1);
    expect(played.state.pendingStack?.color).toBe("green");
    expect(played.state.events.at(-1)?.type).toBe("stackNumber");
  });

  it("stacks a Wild Four with a coloured Stack card and clears the challenge", () => {
    const game = stagedGame([wildFour], "blue", "stackPack");
    game.players[1].hand = [redStackOne];
    const wild = applyAction(game, {
      type: "play", playerId: "p1", cardId: wildFour.id, chosenColor: "red",
    });
    expect(wild.state.pendingChallenge).not.toBeNull();
    const stacked = applyAction(wild.state, { type: "play", playerId: "p2", cardId: redStackOne.id });
    expect(stacked.ok).toBe(true);
    expect(stacked.state.pendingChallenge).toBeNull();
    expect(stacked.state.pendingStack?.amount).toBe(5);
  });
});

describe("Uno Reverse Pack", () => {
  it("builds a Reverse Pack deck with sixteen added cards", () => {
    const deck = buildDeck("reversePack");
    expect(deck).toHaveLength(124);
    expect(buildDeck()).toHaveLength(108);
    for (const kind of ["reverseDraw2", "reverseSkip"] as CardKind[]) {
      expect(deck.filter((card) => card.kind === kind)).toHaveLength(4);
    }
    for (const kind of ["wildPowerReverse", "wildNoU"] as CardKind[]) {
      expect(deck.filter((card) => card.kind === kind)).toHaveLength(4);
    }
  });

  it("matches Reverse Draw Two and Reverse Skip across their symbols", () => {
    const game = stagedGame([], "blue", "reversePack");
    const reverseDrawTwo: Card = { id: "red-reversedraw2-0", color: "red", kind: "reverseDraw2" };
    const reverseSkip: Card = { id: "red-reverseskip-0", color: "red", kind: "reverseSkip" };
    game.discard = [{ id: "blue-draw2-0", color: "blue", kind: "draw2" }];
    expect(canPlay(game, reverseDrawTwo)).toBe(true);
    game.discard = [{ id: "blue-reverse-0", color: "blue", kind: "reverse" }];
    expect(canPlay(game, reverseSkip)).toBe(true);
  });

  it("reverses direction and hands a Draw Two stack to the next player in the new order", () => {
    const game = stagedGame([
      { id: "red-reversedraw2-0", color: "red", kind: "reverseDraw2" },
      redZero,
    ], "blue", "reversePack");
    game.discard = [{ id: "blue-draw2-0", color: "blue", kind: "draw2" }];
    game.players[1].hand = [blueZero];
    game.players[2].hand = [greenZero];
    const played = applyAction(game, { type: "play", playerId: "p1", cardId: "red-reversedraw2-0" });
    expect(played.error).toBeUndefined();
    expect(played.ok).toBe(true);
    expect(played.state.direction).toBe(-1);
    expect(played.state.pendingStack?.kind).toBe("draw2");
    expect(played.state.pendingStack?.amount).toBe(2);
    expect(played.state.pendingStack?.targetId).toBe("p3");
    expect(played.state.turn).toBe(2);
  });

  it("lets the stack target fire Wild NO U back at the owner", () => {
    const game = stagedGame([redZero], "blue", "reversePack");
    game.players[1].hand = [];
    game.players[2].hand = [
      { id: "wildnou-0", color: null, kind: "wildNoU" },
    ];
    game.pendingStack = { kind: "draw2", amount: 2, ownerId: "p1", targetId: "p3" };
    game.turn = 2;
    const answered = applyAction(game, {
      type: "play", playerId: "p3", cardId: "wildnou-0", chosenColor: "green",
    });
    expect(answered.ok).toBe(true);
    expect(answered.state.pendingStack).toBeNull();
    expect(answered.state.players[0].hand).toHaveLength(3);
    expect(answered.state.currentColor).toBe("green");
    expect(answered.state.direction).toBe(-1);
  });

  it("keeps Wild Power Reverse on the actor for another turn", () => {
    const game = stagedGame([
      { id: "wildpowerreverse-0", color: null, kind: "wildPowerReverse" },
    ], "blue", "reversePack");
    const played = applyAction(game, {
      type: "play", playerId: "p1", cardId: "wildpowerreverse-0", chosenColor: "green",
    });
    expect(played.ok).toBe(true);
    expect(played.state.turn).toBe(0);
    expect(played.state.direction).toBe(-1);
    expect(played.state.currentColor).toBe("green");
  });

  it("leaves classic and Seven-O draw effects immediate with no stack", () => {
    for (const mode of ["classic", "sevenO"] as GameMode[]) {
      const drawGame = stagedGame([blueDrawTwo, redZero], "blue", mode);
      const drawResult = applyAction(drawGame, {
        type: "play",
        playerId: "p1",
        cardId: blueDrawTwo.id,
      });
      expect(drawResult.state.pendingStack).toBeNull();
      expect(drawResult.state.finished).toBe(false);

      const wildGame = stagedGame([wildFour], "red", mode);
      const wildResult = applyAction(wildGame, {
        type: "play",
        playerId: "p1",
        cardId: wildFour.id,
        chosenColor: "blue",
      });
      expect(wildResult.state.pendingStack).toBeNull();
      expect(wildResult.state.pendingChallenge).not.toBeNull();
    }
  });
});
