import { describe, expect, it } from "vitest";
import { gamePositions } from "../src/lib/engine/puzzleMining";
import {
  readPuzzleAnswer,
  readPuzzleNext,
  readStormState,
} from "../src/lib/puzzles";

/**
 * The puzzles: what the server says, and the positions of a game.
 */

describe("the answer of the server", () => {
  it("gives a puzzle and the record of the player", () => {
    const result = readPuzzleNext({
      ok: true,
      puzzle: {
        id: "p1",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "e2e4",
        solutionSan: "e4",
        loss: 0.4,
        cp: 60,
        ply: 4,
        game: "game-1",
      },
      game: null,
      streak: 3,
      best: 5,
      solved: 7,
      remaining: 12,
    });

    expect(result.puzzle?.id).toBe("p1");
    expect(result.puzzle?.solution).toBe("e2e4");
    expect(result.streak).toBe(3);
    expect(result.best).toBe(5);
    expect(result.solved).toBe(7);
    expect(result.remaining).toBe(12);
  });

  it("gives the game to make puzzles of when there is nothing to solve", () => {
    const result = readPuzzleNext({
      ok: true,
      puzzle: null,
      game: {
        gameId: "game-2",
        initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        steps: ["e4", "e5"],
      },
      streak: 0,
      best: 0,
      solved: 0,
      remaining: 0,
    });

    expect(result.puzzle).toBeNull();
    expect(result.game?.gameId).toBe("game-2");
    expect(result.game?.steps).toEqual(["e4", "e5"]);
  });

  it("does not trust an answer that is not written properly", () => {
    const result = readPuzzleNext({ ok: true, puzzle: { id: 7 }, game: 3 });
    expect(result.puzzle).toBeNull();
    expect(result.game).toBeNull();
    expect(result.streak).toBe(0);
  });

  it("has nothing to say when the answer is not there", () => {
    const result = readPuzzleNext(null);
    expect(result.puzzle).toBeNull();
    expect(result.game).toBeNull();
  });
});

describe("the answer to a move", () => {
  it("says whether the move was the answer", () => {
    const answer = readPuzzleAnswer({
      ok: true,
      solved: true,
      streak: 4,
      best: 4,
      played: 9,
    });
    expect(answer.solved).toBe(true);
    expect(answer.streak).toBe(4);
    expect(answer.played).toBe(9);
  });

  it("says nothing when the answer is not there", () => {
    const answer = readPuzzleAnswer(undefined);
    expect(answer.solved).toBe(false);
    expect(answer.streak).toBe(0);
  });
});

describe("the run of puzzles with a clock on them", () => {
  it("is read as it is written", () => {
    const state = readStormState({
      ok: true,
      puzzle: {
        id: "p1",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: "",
        solutionSan: "",
        loss: 0.4,
        cp: 60,
        ply: 4,
        game: "game-1",
      },
      score: 3,
      index: 4,
      total: 10,
      seconds: 120,
      finished: false,
    });

    expect(state.puzzle?.id).toBe("p1");
    expect(state.puzzle?.solution).toBe("");
    expect(state.score).toBe(3);
    expect(state.index).toBe(4);
    expect(state.total).toBe(10);
    expect(state.seconds).toBe(120);
    expect(state.finished).toBe(false);
  });

  it("is over when the server says so", () => {
    const state = readStormState({ ok: true, puzzle: null, score: 7, finished: true });
    expect(state.puzzle).toBeNull();
    expect(state.score).toBe(7);
    expect(state.finished).toBe(true);
  });

  it("has nothing to say when the answer is not there", () => {
    const state = readStormState(null);
    expect(state.puzzle).toBeNull();
    expect(state.score).toBe(0);
  });
});

describe("the positions of a game", () => {  it("are the positions the game was played through", () => {
    const positions = gamePositions(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      ["e4", "e5", "Nf3"],
    );

    expect(positions).toHaveLength(3);
    expect(positions[0].uci).toBe("e2e4");
    expect(positions[0].fen).toContain("8/8/8/8/PPPPPPPP/RNBQKBNR");
    expect(positions[1].fen).toContain("4P3");
    expect(positions[2].fen).toContain("4p3");
  });

  it("are not there when the game cannot be played", () => {
    expect(() =>
      gamePositions(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        ["e4", "Qxh5"],
      ),
    ).toThrow();
  });
});
