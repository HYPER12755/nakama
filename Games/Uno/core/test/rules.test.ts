import { describe, expect, it } from "vitest";
import {
  applyAction,
  buildDeck,
  canPlay,
  createGame,
  legalMoves,
  scoreHand,
  shuffle,
  topCard,
} from "../src/index";
import vectors from "../../tests/vectors.json";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

describe("Uno classic rules", () => {
  it("builds a 108 card deck and shuffles deterministically", () => {
    expect(buildDeck()).toHaveLength(vectors.deckSize);
    const shuffled = shuffle(vectors.seed, buildDeck());
    expect(shuffled.cards.slice(0, 12).map((card) => card.id)).toEqual(vectors.shuffledHead);
  });

  it("deals seven cards and starts on a number card", () => {
    const game = createGame(vectors.seed, players);
    expect(game.players[0].hand.map((card) => card.id)).toEqual(vectors.startingHand);
    expect(game.discard[0].id).toBe(vectors.startingDiscard);
    expect(game.currentColor).toBe(vectors.startingColor);
    expect(topCard(game).kind).toBe("number");
  });

  it("only allows legal cards and drawing", () => {
    const game = createGame(vectors.seed, players);
    expect(legalMoves(game, "p1")).toEqual(vectors.startingLegal);
    const actor = game.players[0];
    const illegal = actor.hand.find((card) => !canPlay(game, card));
    if (illegal !== undefined) {
      const result = applyAction(game, { type: "play", playerId: "p1", cardId: illegal.id });
      expect(result.ok).toBe(false);
    }
    const result = applyAction(game, { type: "draw", playerId: "p1" });
    expect(result.ok).toBe(true);
  });

  it("rejects a turn from another player", () => {
    const game = createGame(vectors.seed, players);
    const result = applyAction(game, {
      type: "draw",
      playerId: "p2",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("not_your_turn");
  });

  it("scores a hand", () => {
    expect(scoreHand(buildDeck().slice(0, 0))).toBe(0);
    const game = createGame(vectors.seed, players);
    expect(scoreHand(game.players[0].hand)).toBeGreaterThan(0);
  });
});
