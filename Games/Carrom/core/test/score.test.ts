import { describe, expect, it } from "vitest";
import {
  createInitialState,
  piecesLeft,
  pointsFor,
  resolveShotRules,
  scoresFromBoard,
} from "../src";

/**
 * The score of a colour is the number of its pieces that are pocketed. The
 * bar counts them from the board, so the number a player sees always matches
 * the table, whether the game is played here or on the server.
 */
describe("the score of a table", () => {
  it("counts the pieces that are pocketed", () => {
    const state = createInitialState(["white", "black"]);
    expect(scoresFromBoard(state)).toEqual({
      white: 0,
      black: 0,
      green: 0,
      yellow: 0,
    });
    expect(piecesLeft(state, "white")).toBe(9);
  });

  it("counts a piece that a shot pocketed", () => {
    const state = createInitialState(["white", "black"]);
    // One white man goes into a pocket.
    const white = state.discs.find(
      (disc) => disc.kind === "white" && !disc.pocketed,
    )!;
    const discs = state.discs.map((disc) =>
      disc.id === white.id ? { ...disc, pocketed: true } : disc,
    );
    const physics = {
      pocketed: [
        { type: "pocket", time: 0.1, id: white.id, kind: "white", pocket: { x: 0.05, y: 0.05 } },
      ],
      strikerPocketed: false,
      discs,
      striker: state.striker,
      duration: 1,
      events: [],
    } as never;
    const shot = { position: 0.5, angle: -Math.PI / 2, power: 0.5 };
    const result = resolveShotRules(state, physics, shot);

    expect(scoresFromBoard(result.state).white).toBe(1);
    expect(result.state.scores.white).toBe(1);
    expect(piecesLeft(result.state, "white")).toBe(8);
    // A man is worth one point.
    expect(pointsFor(result.state, "white")).toBe(1);
  });

  it("gives the same number whether the board or the counter is read", () => {
    const state = createInitialState(["white", "black"]);
    const white = state.discs.find(
      (disc) => disc.kind === "white" && !disc.pocketed,
    )!;
    const discs = state.discs.map((disc) =>
      disc.id === white.id ? { ...disc, pocketed: true } : disc,
    );
    const physics = {
      pocketed: [
        { type: "pocket", time: 0.1, id: white.id, kind: "white", pocket: { x: 0.05, y: 0.05 } },
      ],
      strikerPocketed: false,
      discs,
      striker: state.striker,
      duration: 1,
      events: [],
    } as never;
    const shot = { position: 0.5, angle: -Math.PI / 2, power: 0.5 };
    const result = resolveShotRules(state, physics, shot);
    // The counter the rules keep and the number counted from the board are
    // the same number, so the bar and the table can never disagree.
    expect(scoresFromBoard(result.state)).toEqual(result.state.scores);
  });
});
