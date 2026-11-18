import { describe, expect, it } from "vitest";
import {
  applyMove,
  cloneState,
  createGame,
  legalMoves,
  passTurn,
  playerAt,
  recordReplay,
  rollDice,
  rollFromSeed,
} from "../src/index";
import vectors from "../../tests/vectors.json";

describe("Ludo TS/Lua parity vectors", () => {
  it("rolls the same dice as the Lua server", () => {
    for (const curve of vectors.rolls) {
      let seed = curve.seed;
      for (const expected of curve.rolls) {
        const roll = rollFromSeed(seed);
        expect(roll.value).toBe(expected);
        seed = roll.seed;
      }
      expect(seed).toBe(curve.finalSeed);
    }
  });

  it("offers the same legal moves as the Lua server", () => {
    for (const vector of vectors.legalMoves) {
      const game = createGame({ seed: 99 });
      game.current = vector.current;
      game.dice = vector.dice;
      game.phase = "move";
      for (const placed of vector.tokens) {
        const token = playerAt(game, placed.seat).tokens[placed.token]!;
        token.progress = placed.progress;
        token.location = placed.progress >= 56 ? "finished" : placed.progress >= 51 ? "column" : "track";
        if (placed.progress >= 56) playerAt(game, placed.seat).finished += 1;
      }
      const moves = legalMoves(game);
      expect(moves.length, vector.name).toBe(vector.expected.length);
      for (const expected of vector.expected) {
        const move = moves.find((entry) => entry.token === expected.token)!;
        expect(move.to, vector.name).toBe(expected.to);
        expect(move.leavesHome, vector.name).toBe(expected.leavesHome);
        expect(move.captures.length, vector.name).toBe(expected.captures);
        if ("finishes" in expected) expect(move.finishes, vector.name).toBe(expected.finishes);
      }
    }
  });

  it("plays the same reference game as the Lua server", () => {
    const initial = createGame({ seed: vectors.game.seed, playerCount: 4 });
    const game = cloneState(initial);
    let index = 0;
    while (game.phase !== "over" && index < vectors.game.count) {
      if (game.phase !== "roll") break;
      const before = game.current;
      const value = rollDice(game);
      if (game.phase !== "move") continue;
      const expected = vectors.game.decisions[index];
      if (expected) {
        expect(before).toBe(expected[0]);
        expect(value).toBe(expected[1]);
      }
      const moves = legalMoves(game);
      const choice = moves.length > 0 ? moves[0]!.token : null;
      if (expected) expect(choice === null ? -1 : choice).toBe(expected[2]);
      if (choice === null) passTurn(game);
      else applyMove(game, choice);
      index += 1;
    }
    expect(index).toBe(vectors.game.count);
    expect(game.winner).toBe(vectors.game.winner);
    expect(game.players.map((player) => player.finished)).toEqual(vectors.game.finished);

    const recorded = recordReplay(game).slice(0, vectors.game.replay.length).map((step) => ({
      roll: step.roll,
      seed: step.seed,
      token: step.token === null ? -1 : step.token,
    }));
    expect(recorded).toEqual(vectors.game.replay);
  });
});
