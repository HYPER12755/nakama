import { describe, expect, it } from "vitest";
import { applyAction, createGame } from "../src/index";
import vectors from "../../tests/vectors.json";

describe("Uno classic shared vectors", () => {
  it("plays the reference game to the same winner", () => {
    let state = createGame(vectors.seed, vectors.reference.players.map((id, index) => ({
      id,
      name: `Player ${index + 1}`,
    })));
    for (const action of vectors.reference.actions) {
      const result = applyAction(state, action as never);
      expect(result.ok).toBe(true);
      state = result.state;
    }
    expect(state.finished).toBe(vectors.reference.finished);
    expect(state.winner).toBe(vectors.reference.winner);
    expect(state.replay).toHaveLength(vectors.reference.steps);
  });
});
