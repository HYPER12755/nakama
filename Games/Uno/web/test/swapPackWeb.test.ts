import { describe, expect, it, vi } from "vitest";
import { createGame, type GameState } from "@moongames/uno-core";
import { buildPlayPayload, normalizeView, type UnoController } from "../src/hooks/useUnoGame";
import { giveCandidates, tradeCandidates } from "../src/components/UnoBoardStage";
import { rulesModeLabel, viewFromCore } from "../src/lib/view";

describe("Uno Swap Pack web", () => {
  it("labels and normalizes the swap pack mode", () => {
    expect(rulesModeLabel("swapPack")).toBe("Swap Pack");
    expect(normalizeView({ rulesMode: "swapPack" }, null).rulesMode).toBe("swapPack");
    const state = createGame(37, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "swapPack") as GameState;
    expect(viewFromCore(state, "local").rulesMode).toBe("swapPack");
  });

  it("sends swap pack card fields through the play payload", () => {
    const view = normalizeView({
      started: true,
      rulesMode: "swapPack",
      players: [{ userId: "me", seat: 0, count: 2 }],
    }, "me");
    expect(buildPlayPayload(view, "yellow-swap1-0", undefined, "ai1", {
      giveCardId: "red-5-0",
    })).toEqual({
      cardId: "yellow-swap1-0",
      targetId: "ai1",
      giveCardId: "red-5-0",
    });
    expect(buildPlayPayload(view, "wildforcetrade-0", "blue", "me", {
      tradeWithId: "ai1",
    })).toEqual({
      cardId: "wildforcetrade-0",
      chosenColor: "blue",
      targetId: "me",
      tradeWithId: "ai1",
    });
  });

  it("exposes every seated player as a trade target and excludes played cards from give choices", () => {
    const view = normalizeView({
      started: true,
      rulesMode: "swapPack",
      players: [
        { userId: "me", seat: 0, count: 2, hand: [
          { id: "yellow-swap1-0", color: "yellow", kind: "swap1" },
          { id: "red-5-0", color: "red", kind: "number", value: 5 },
        ] },
        { userId: "ai1", seat: 1, count: 3 },
        { userId: "ai2", seat: 2, count: 2, out: true },
      ],
    }, "me");
    expect(tradeCandidates(view).map((player) => player.userId)).toEqual(["me", "ai1"]);
    expect(giveCandidates(view, "yellow-swap1-0").map((card) => card.id)).toEqual(["red-5-0"]);
  });

  it("forwards optional swap fields through the controller play signature", () => {
    const play = vi.fn();
    const controller: Pick<UnoController, "play"> = { play };
    controller.play("yellow-swap1-0", undefined, "ai1", { giveCardId: "red-5-0" });
    expect(play).toHaveBeenCalledWith("yellow-swap1-0", undefined, "ai1", { giveCardId: "red-5-0" });
  });
});
