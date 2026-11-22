import { describe, expect, it } from "vitest";
import { normalizeHistory, normalizeView } from "../src/hooks/useUnoGame";

describe("Uno online view normalization", () => {
  it("maps snake_case challenge and result fields", () => {
    const view = normalizeView({
      started: true,
      turn: 2,
      players: [{ seat: 0, user_id: "u1", username: "Ana", connected: true, count: 1 }],
      spectators: [{ user_id: "u3", username: "Watcher" }],
      chat: [{ id: "c1", user_id: "u2", username: "Ben", text: "hi", sent_at: 123 }],
      pendingChallenge: { owner_id: "u1", target_id: "u2", legal: true },
      result: { status: "finished", winner_user_id: "u2", reason: "uno" },
    }, "u1");

    expect(view.pendingChallenge).toEqual({ ownerId: "u1", targetId: "u2", legal: true });
    expect(view.result).toEqual({ status: "finished", winnerUserId: "u2", reason: "uno" });
    expect(view.players[0]?.userId).toBe("u1");
    expect(view.spectators[0]?.userId).toBe("u3");
    expect(view.chat[0]?.userId).toBe("u2");
    expect(view.chat[0]?.at).toBe(123);
  });

  it("leaves absent challenge and result empty", () => {
    const view = normalizeView({ started: false }, null);
    expect(view.pendingChallenge).toBeNull();
    expect(view.result).toBeNull();
    expect(view.players).toEqual([]);
    expect(view.pendingStack).toBeNull();
  });

  it("maps camelCase pending stack fields", () => {
    const view = normalizeView({
      started: true,
      pendingStack: { ownerId: "u1", targetId: "u2", kind: "draw2", count: 6 },
    }, "u2");
    expect(view.pendingStack).toEqual({ ownerId: "u1", targetId: "u2", kind: "draw2", count: 6 });
  });

  it("maps snake_case pending stack fields and wild four kind", () => {
    const view = normalizeView({
      pending_stack: { owner_id: "u3", target_id: "u4", stackKind: "wild4", amount: 8 },
    }, "u4");
    expect(view.pendingStack).toEqual({ ownerId: "u3", targetId: "u4", kind: "wild4", count: 8 });
  });

  it("derives a pending stack count from a card list", () => {
    const view = normalizeView({
      pendingStack: {
        ownerId: "u1",
        targetId: "u2",
        kind: "wild4",
        cards: ["wild4-0", "wild4-1", "wild4-2", "wild4-3"],
      },
    }, "u2");
    expect(view.pendingStack?.count).toBe(4);
  });

  it("ignores an invalid pending stack without crashing", () => {
    expect(normalizeView({ pendingStack: { targetId: "u2" } }, "u2").pendingStack).toBeNull();
    expect(normalizeView({ pendingStack: null }, "u2").pendingStack).toBeNull();
  });

  it("normalizes snake_case history into shared entries", () => {
    const history = normalizeHistory([{
      match_id: "match-1",
      mode: "private",
      rated: true,
      outcome: "loss",
      status: "finished",
      reason: "resign",
      opponent_id: "u9",
      rating_before: 1200,
      rating_after: 1184,
      rating_delta: -16,
      ended_at: 1700000000000,
      replay: { seats: 2, steps: ["play red-5", "draw"] },
    }]);

    expect(history).toEqual([{
      matchId: "match-1",
      gameId: undefined,
      mode: "private",
      rated: true,
      outcome: "loss",
      status: "finished",
      reason: "resign",
      opponent: { userId: "u9", username: "Opponent" },
      ratingBefore: 1200,
      ratingAfter: 1184,
      ratingDelta: -16,
      endedAt: 1700000000000,
      steps: ["play red-5", "draw"],
      summary: undefined,
      pgn: undefined,
      finalFen: undefined,
    }]);
  });

  it("keeps camelCase history fields intact", () => {
    const history = normalizeHistory([{
      matchId: "m2",
      opponent: { userId: "u2", username: "Ben" },
      ratingDelta: 12,
      steps: ["play blue-2"],
    }]);
    expect(history[0]?.opponent).toEqual({ userId: "u2", username: "Ben" });
    expect(history[0]?.steps).toEqual(["play blue-2"]);
  });
});
