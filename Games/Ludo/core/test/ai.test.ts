import { describe, expect, it } from "vitest";
import {
  applyMove,
  chooseMove,
  cloneState,
  createGame,
  legalMoves,
  playerAt,
  simulateGame,
} from "../src/index";
import type { LudoState } from "../src/index";

function withDice(state: LudoState, value: number, seat = state.current): LudoState {
  state.current = seat;
  state.dice = value;
  state.phase = "move";
  return state;
}

function putOnTrack(state: LudoState, seat: number, token: number, progress: number): void {
  const piece = playerAt(state, seat).tokens[token]!;
  piece.progress = progress;
  piece.location = progress >= 56 ? "finished" : progress >= 51 ? "column" : "track";
}

describe("Ludo AI", () => {
  it("passes when there is no legal move", () => {
    const game = withDice(createGame({ seed: 1 }), 3);
    expect(chooseMove(game, "easy")).toBeNull();
    expect(chooseMove(game, "hard")).toBeNull();
  });

  it("chooses the same move for the same state and seed", () => {
    const game = createGame({ seed: 55 });
    const ready = withDice(game, 6);
    expect(chooseMove(ready, "hard")).toBe(chooseMove(cloneState(ready), "hard"));
    expect(chooseMove(ready, "easy")).toBe(chooseMove(cloneState(ready), "easy"));
  });

  it("takes a capture when a harder opponent has the choice", () => {
    const game = createGame({ seed: 3 });
    putOnTrack(game, 0, 0, 2); // red 2 + 3 = ring 5
    putOnTrack(game, 0, 1, 10); // red 10 + 3 = ring 13 (safe)
    putOnTrack(game, 1, 0, 44); // green 44 = ring 5
    const ready = withDice(game, 3);
    const moves = legalMoves(ready);
    expect(moves.find((move) => move.token === 0)!.captures).toHaveLength(1);
    expect(moves.find((move) => move.token === 1)!.captures).toHaveLength(0);
    expect(chooseMove(ready, "hard")).toBe(0);
    expect(chooseMove(ready, "normal")).toBe(0);
  });

  it("never picks an illegal token", () => {
    const game = createGame({ seed: 8 });
    putOnTrack(game, 0, 0, 20);
    const ready = withDice(game, 4);
    const legal = legalMoves(ready).map((move) => move.token);
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      expect(legal).toContain(chooseMove(ready, difficulty));
    }
  });
});

describe("Ludo AI match completion", () => {
  for (const playerCount of [2, 3, 4]) {
    for (const difficulty of ["easy", "normal", "hard"] as const) {
      it(`finishes a ${playerCount}-player ${difficulty} match`, () => {
        for (const seed of [11, 97, 2024]) {
          const game = simulateGame({ playerCount, seed, difficulty });
          expect(game.phase).toBe("over");
          expect(game.winner).not.toBeNull();
          expect(playerAt(game, game.winner!).finished).toBe(4);
        }
      });
    }
  }

  it("lets a hard table beat an easy table more often than not", () => {
    let hardWins = 0;
    const games = 12;
    for (let i = 0; i < games; i += 1) {
      const hardFirst = i % 2 === 0;
      const game = simulateGame({
        playerCount: 2,
        seed: 1000 + i,
        ai: hardFirst ? ["hard", "easy"] : ["easy", "hard"],
      });
      if ((game.winner === 0) === hardFirst) hardWins += 1;
    }
    expect(hardWins).toBeGreaterThan(games / 2);
  });

  it("keeps a full AI game replayable", () => {
    const game = simulateGame({ playerCount: 4, seed: 77, difficulty: "normal" });
    expect(game.events.filter((event) => event.type === "roll").length).toBeGreaterThan(20);
    const first = legalMoves(game);
    expect(first).toEqual([]);
    // A finished game has no pending move; playing another roll must fail.
    expect(() => applyMove(game, 0)).toThrow();
  });
});
