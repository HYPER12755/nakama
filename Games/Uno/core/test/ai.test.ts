import { describe, expect, it } from "vitest";
import { applyAction, chooseAction, createGame, legalMoves, type Action, type Card } from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

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

describe("Uno Seven-O AI", () => {
  const seven: Card = { id: "red-7-0", color: "red", kind: "number", value: 7 };
  const filler = (index: number): Card => ({
    id: `blue-${index}-0`,
    color: "blue",
    kind: "number",
    value: index,
  });

  function staged(twoCounts: number[], threeCounts: number[]) {
    const state = createGame(7, players, 0, "sevenO");
    state.turn = 0;
    state.direction = 1;
    state.currentColor = "red";
    state.drawnCardId = null;
    state.pendingChallenge = null;
    state.players[0].hand = [seven];
    state.players[1].hand = twoCounts.map(filler);
    state.players[2].hand = threeCounts.map(filler);
    return state;
  }

  it("targets the opponent with the most cards", () => {
    const state = staged([1, 2, 3], [1, 2]);
    const action = chooseAction(state, "p1");
    expect(action).toEqual({ type: "play", playerId: "p1", cardId: seven.id, targetId: "p2" });
    expect(applyAction(state, action as Action).ok).toBe(true);
  });

  it("breaks target ties by player order", () => {
    const state = staged([1, 2], [3, 4]);
    const action = chooseAction(state, "p1");
    expect(action).toEqual({ type: "play", playerId: "p1", cardId: seven.id, targetId: "p2" });
  });

  it("never returns an invalid seven target", () => {
    const state = staged([1, 2], [1]);
    const action = chooseAction(state, "p1");
    if (action?.type === "play") {
      expect(state.players.some((player) => player.id === action.targetId && player.id !== "p1")).toBe(true);
    }
    expect(applyAction(state, action as Action).ok).toBe(true);
  });
});
