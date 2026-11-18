import { describe, expect, it } from "vitest";
import {
  FINISH_PROGRESS,
  START_INDEX,
  TOKENS_PER_PLAYER,
  TRACK_LENGTH,
  applyMove,
  cloneState,
  createGame,
  legalMoves,
  passTurn,
  playerAt,
  recordReplay,
  replaySteps,
  rollDice,
  rollFromSeed,
  trackIndex,
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
  piece.location = progress >= FINISH_PROGRESS ? "finished" : progress >= 51 ? "column" : "track";
  if (piece.location === "finished") playerAt(state, seat).finished += 1;
}

function seedFor(value: number): number {
  for (let seed = 1; seed < 100_000; seed += 1) {
    if (rollFromSeed(seed).value === value) return seed;
  }
  throw new Error(`No seed found for ${value}`);
}

describe("Ludo setup and dice", () => {
  it("starts four players with four tokens at home", () => {
    const game = createGame({ seed: 42 });
    expect(game.players).toHaveLength(4);
    expect(game.playerCount).toBe(4);
    expect(game.phase).toBe("roll");
    expect(game.current).toBe(0);
    for (const player of game.players) {
      expect(player.tokens).toHaveLength(TOKENS_PER_PLAYER);
      expect(player.tokens.every((token) => token.location === "home" && token.progress === -1)).toBe(true);
    }
  });

  it("supports two and three player tables", () => {
    expect(createGame({ playerCount: 2 }).players).toHaveLength(2);
    expect(createGame({ playerCount: 3 }).players).toHaveLength(3);
    expect(() => createGame({ playerCount: 1 })).toThrow();
    expect(() => createGame({ playerCount: 5 })).toThrow();
  });

  it("reproduces the same dice sequence from the same seed", () => {
    const first = createGame({ seed: 12345 });
    const second = createGame({ seed: 12345 });
    for (let i = 0; i < 12; i += 1) {
      if (first.phase !== "roll" || second.phase !== "roll") {
        first.phase = "roll";
        second.phase = "roll";
      }
      const a = rollDice(first);
      const b = rollDice(second);
      expect(a).toBe(b);
      first.phase = "roll";
      second.phase = "roll";
    }
  });

  it("gives alternating turns every die face", () => {
    const game = createGame({ seed: 1004 });
    const seen = [new Set<number>(), new Set<number>()];
    for (let i = 0; i < 240; i += 1) {
      const seat = game.current;
      const value = rollDice(game);
      seen[seat]!.add(value);
      game.phase = "roll";
      game.dice = null;
      game.sixStreak = 0;
      game.current = (seat + 1) % 2;
    }
    expect([...seen[0]!].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...seen[1]!].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("keeps every colour entry square 13 apart around a 52 square ring", () => {
    expect(TRACK_LENGTH).toBe(52);
    expect(START_INDEX.red).toBe(0);
    expect(START_INDEX.green).toBe(13);
    expect(START_INDEX.yellow).toBe(26);
    expect(START_INDEX.blue).toBe(39);
    expect(trackIndex("green", 52 + 4)).toBe(17);
  });
});

describe("Ludo movement rules", () => {
  it("needs a six to leave home and then uses the colour entry square", () => {
    const game = createGame({ seed: 7 });
    expect(legalMoves(withDice(game, 5))).toHaveLength(0);
    const six = withDice(game, 6);
    const moves = legalMoves(six);
    expect(moves).toHaveLength(4);
    expect(moves.every((move) => move.leavesHome && move.to === 0)).toBe(true);
    const result = applyMove(six, 2);
    expect(playerAt(six, 0).tokens[2]!.location).toBe("track");
    expect(playerAt(six, 0).tokens[2]!.progress).toBe(0);
    expect(result.extra).toBe(true);
  });

  it("moves a token around the ring and up its own home column", () => {
    const game = createGame({ seed: 7 });
    putOnTrack(game, 0, 0, 49);
    const result = applyMove(withDice(game, 4), 0);
    expect(result.move.to).toBe(53);
    expect(playerAt(game, 0).tokens[0]!.location).toBe("column");
    expect(result.move.finishes).toBe(false);
  });

  it("requires an exact roll to reach the centre", () => {
    const game = createGame({ seed: 7 });
    putOnTrack(game, 0, 0, 54);
    expect(legalMoves(withDice(game, 3)).some((move) => move.token === 0)).toBe(false);
    const result = applyMove(withDice(game, 2), 0);
    expect(result.move.finishes).toBe(true);
    expect(result.won).toBe(false);
    expect(playerAt(game, 0).tokens[0]!.location).toBe("finished");
    expect(playerAt(game, 0).finished).toBe(1);
  });

  it("captures an opponent on a normal square and earns another roll", () => {
    const game = createGame({ seed: 7 });
    putOnTrack(game, 0, 0, 5);
    putOnTrack(game, 1, 0, 40); // green 40 + 4 = 44 = ring square 5
    expect(trackIndex("green", 44)).toBe(trackIndex("red", 5));
    const dice = withDice(game, 4, 1);
    const move = legalMoves(dice).find((entry) => entry.token === 0)!;
    expect(move.captures).toEqual([{ player: 0, token: 0 }]);
    const result = applyMove(dice, 0);
    expect(playerAt(game, 0).tokens[0]!.location).toBe("home");
    expect(result.extra).toBe(true);
    expect(result.nextPlayer).toBe(1);
    expect(game.phase).toBe("roll");
  });

  it("does not capture on a safe star square", () => {
    const game = createGame({ seed: 7 });
    putOnTrack(game, 0, 0, 8); // ring square 8 is safe
    putOnTrack(game, 1, 0, 41);
    const dice = withDice(game, 6, 1);
    const move = legalMoves(dice).find((entry) => entry.token === 0)!;
    expect(move.safe).toBe(true);
    expect(move.captures).toEqual([]);
    applyMove(dice, 0);
    expect(playerAt(game, 0).tokens[0]!.location).toBe("track");
  });

  it("will not enter a square held by an opponent wall", () => {
    const game = createGame({ seed: 7 });
    putOnTrack(game, 0, 0, 8);
    putOnTrack(game, 0, 1, 8); // a red wall on square 8
    putOnTrack(game, 1, 0, 41);
    const dice = withDice(game, 6, 1);
    expect(legalMoves(dice).some((move) => move.token === 0)).toBe(false);
  });

  it("forfeits the turn after three consecutive sixes", () => {
    const game = createGame({ seed: seedFor(6) });
    game.sixStreak = 2;
    rollDice(game);
    expect(game.current).toBe(1);
    expect(game.phase).toBe("roll");
    expect(game.dice).toBeNull();
    expect(game.sixStreak).toBe(0);
  });

  it("passes the turn when no token can move", () => {
    const game = createGame({ seed: 7 });
    const dice = withDice(game, 2);
    expect(legalMoves(dice)).toHaveLength(0);
    passTurn(dice);
    expect(dice.current).toBe(1);
    expect(dice.phase).toBe("roll");
  });

  it("ends the game when a player finishes all four tokens", () => {
    const game = createGame({ seed: 7 });
    for (let token = 0; token < 3; token += 1) putOnTrack(game, 0, token, FINISH_PROGRESS);
    putOnTrack(game, 0, 3, 55);
    const result = applyMove(withDice(game, 1), 3);
    expect(result.won).toBe(true);
    expect(game.winner).toBe(0);
    expect(game.phase).toBe("over");
    expect(game.ranking).toEqual([0]);
  });
});

describe("Ludo replay", () => {
  it("reproduces the final board from the recorded decisions", () => {
    const initial = createGame({ seed: 909 });
    const game = cloneState(initial);
    let guard = 0;
    while (game.phase !== "over" && guard < 10_000) {
      guard += 1;
      if (game.phase === "roll") {
        rollDice(game);
      } else {
        const moves = legalMoves(game);
        if (moves.length === 0) passTurn(game);
        else applyMove(game, moves[0]!.token);
      }
    }
    expect(game.phase).toBe("over");

    const steps = recordReplay(game);
    const frames = replaySteps(initial, steps);
    const rebuilt = frames[frames.length - 1]!;
    expect(rebuilt.winner).toBe(game.winner);
    expect(rebuilt.action).toBe(game.action);
    expect(rebuilt.players.map((player) => player.finished)).toEqual(
      game.players.map((player) => player.finished),
    );
    expect(rebuilt.players.map((player) => player.tokens.map((token) => [token.location, token.progress]))).toEqual(
      game.players.map((player) => player.tokens.map((token) => [token.location, token.progress])),
    );
  });
});
