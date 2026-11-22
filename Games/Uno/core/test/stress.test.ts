import { describe, expect, it } from "vitest";
import { applyAction, chooseAction, createGame } from "../src/index";
import type { GameMode, GameState } from "../src/types";

const SEEDS = Array.from({ length: 100 }, (_, index) => 1000 + index * 7919);

function signature(state: GameState): string {
  return [
    state.turn,
    state.direction,
    state.currentColor,
    state.drawnCardId,
    state.pendingChallenge?.targetId ?? "",
    state.pendingStack === null ? "" : [
      state.pendingStack.kind,
      state.pendingStack.amount,
      state.pendingStack.ownerId,
      state.pendingStack.targetId,
    ].join(","),
    state.discard[state.discard.length - 1]?.id ?? "",
    state.drawPile.length,
    state.players.map((player) => player.hand.map((card) => card.id).join(",")).join("|"),
  ].join(":");
}

function actorFor(state: GameState): string {
  return state.pendingStack?.targetId ?? state.pendingChallenge?.targetId ?? state.players[state.turn].id;
}

describe("Uno stress simulation", () => {
  it("finishes 100 seeds across 2, 3 and 4 seats in all three modes", () => {
    let stepsTotal = 0;
    const modes: GameMode[] = ["classic", "sevenO", "progressive"];
    for (const mode of modes) {
      for (const seed of SEEDS) {
        for (const seats of [2, 3, 4]) {
          const players = Array.from({ length: seats }, (_, index) => ({
            id: `p${index + 1}`,
            name: `Player ${index + 1}`,
          }));
          let state = createGame(seed, players, 0, mode);
          const seen = new Set<string>();
          let steps = 0;
          for (; steps < 5000 && !state.finished; steps += 1) {
            const value = signature(state);
            expect(seen.has(value)).toBe(false);
            seen.add(value);
            const actorId = actorFor(state);
            const action = chooseAction(state, actorId);
            expect(action).not.toBeNull();
            if (action === null) break;
            if (action.type === "play" && action.targetId !== undefined) {
              expect(state.players.some((player) => (
                player.id === action.targetId && player.id !== action.playerId
              ))).toBe(true);
            }
            const result = applyAction(state, action);
            expect(result.ok).toBe(true);
            state = result.state;
          }
          expect(state.finished).toBe(true);
          expect(state.winner).not.toBeNull();
          stepsTotal += steps;
        }
      }
    }
    expect(stepsTotal).toBeGreaterThan(100);
  }, 60000);
});
