import { describe, expect, it } from "vitest";
import { applyAction, chooseAction, createGame, legalMoves } from "../src/index";

describe("Uno classic AI", () => {
  it("always chooses a legal action", () => {
    let state = createGame(123456789, [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
    ]);
    for (let step = 0; step < 200 && !state.finished; step += 1) {
      const actorId = state.pendingChallenge !== null
        ? state.pendingChallenge.targetId
        : state.players[state.turn].id;
      const action = chooseAction(state, actorId);
      expect(action).not.toBeNull();
      if (action === null) break;
      const moves = legalMoves(state, action.playerId);
      if (action.type === "play") {
        expect(moves.cards).toContain(action.cardId);
      }
      const result = applyAction(state, action);
      expect(result.ok).toBe(true);
      state = result.state;
    }
  });

  it("picks the same card for the same state", () => {
    const state = createGame(42, [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
    ]);
    expect(chooseAction(state, "p1")).toEqual(chooseAction(state, "p1"));
  });
});
