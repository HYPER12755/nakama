import { describe, expect, it } from "vitest";
import { applyAction, chooseAction, clearJumpWindow, createGame } from "../src/index";
import type { GameMode, GameState } from "../src/types";

const SEEDS = Array.from({ length: 100 }, (_, index) => 1000 + index * 7919);

function signature(state: GameState): string {
  return [
    state.turn,
    state.direction,
    state.currentColor,
    state.drawnCardId,
    state.seed,
    state.pendingChallenge?.targetId ?? "",
    state.pendingHit === null ? "" : [
      state.pendingHit.amount,
      state.pendingHit.ownerId,
      state.pendingHit.targetId,
    ].join(","),
    state.pendingStack === null ? "" : [
      state.pendingStack.kind,
      state.pendingStack.amount,
      state.pendingStack.value ?? "",
      state.pendingStack.ownerId,
      state.pendingStack.targetId,
    ].join(","),
    state.pendingRoulette === null ? "" : [
      state.pendingRoulette.chooserId,
      state.pendingRoulette.ownerId,
    ].join(","),
    state.players.map((player) => (player.out ? "1" : "0")).join(""),
    state.jumpWindow === null ? "" : [
      state.jumpWindow.cardId,
      state.jumpWindow.ownerId,
      state.jumpWindow.expiresAt,
    ].join(","),
    state.discard[state.discard.length - 1]?.id ?? "",
    state.drawPile.length,
    state.players.map((player) => player.hand.map((card) => card.id).join(",")).join("|"),
  ].join(":");
}

function actorFor(state: GameState): string {
  return state.pendingRoulette?.chooserId ?? state.pendingHit?.targetId
    ?? state.pendingStack?.targetId ?? state.pendingChallenge?.targetId
    ?? state.players[state.turn].id;
}

async function runMode(mode: GameMode): Promise<void> {
  for (const seed of SEEDS) {
    for (const seats of [2, 3, 4]) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const players = Array.from({ length: seats }, (_, index) => ({
        id: `p${index + 1}`,
        name: `Player ${index + 1}`,
      }));
      let state = createGame(seed, players, 0, mode);
      const seen = new Set<string>();
      let now = 0;
      let steps = 0;
      for (; steps < 5000 && !state.finished; steps += 1) {
        state = clearJumpWindow(state, now);
        const value = signature(state);
        expect(seen.has(value)).toBe(false);
        seen.add(value);
        const actorId = actorFor(state);
        let action = chooseAction(state, actorId, now);
        if (action === null && state.jumpWindow !== null) {
          now = state.jumpWindow.expiresAt;
          state = clearJumpWindow(state, now);
          action = chooseAction(state, actorId, now);
        }
        expect(action).not.toBeNull();
        if (action === null) break;
        if (action.type === "play" && action.targetId !== undefined) {
          expect(state.players.some((player) => (
            player.id === action.targetId && player.id !== action.playerId
          ))).toBe(true);
        }
        const result = applyAction(state, action, now);
        expect(result.ok).toBe(true);
        state = result.state;
        now += 1;
      }
      expect(state.finished).toBe(true);
      expect(state.winner).not.toBeNull();
    }
  }
}

describe("Uno stress simulation", () => {
  it("finishes 100 seeds across 2, 3 and 4 seats in classic mode", async () => {
    await runMode("classic");
  }, 60000);

  it("finishes 100 seeds across 2, 3 and 4 seats in Seven-O mode", async () => {
    await runMode("sevenO");
  }, 60000);

  it("finishes 100 seeds across 2, 3 and 4 seats in progressive mode", async () => {
    await runMode("progressive");
  }, 60000);

  it("finishes 100 seeds across 2, 3 and 4 seats in jumpIn mode", async () => {
    await runMode("jumpIn");
  }, 60000);

  it("finishes 100 seeds across 2, 3 and 4 seats in attack mode", async () => {
    await runMode("attack");
  }, 60000);

  it("finishes 100 seeds across 2, 3 and 4 seats in noMercy mode", async () => {
    await runMode("noMercy");
  }, 60000);
});
