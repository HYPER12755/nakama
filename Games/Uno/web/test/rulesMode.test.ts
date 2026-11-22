import { describe, expect, it, vi } from "vitest";
import { createGame, type Card, type GameState } from "@moongames/uno-core";
import { normalizeView, type UnoController } from "../src/hooks/useUnoGame";
import { rulesModeLabel, viewFromCore } from "../src/lib/view";
import { isSevenCard, targetCandidates } from "../src/components/UnoBoardStage";

describe("Uno rules mode", () => {
  it("labels both modes and defaults to classic", () => {
    expect(rulesModeLabel("classic")).toBe("Classic");
    expect(rulesModeLabel("sevenO")).toBe("Seven-O");
    expect(rulesModeLabel(undefined)).toBe("Classic");
  });

  it("normalizes the rules mode from the online STATE payload", () => {
    expect(normalizeView({ rulesMode: "sevenO", mode: "private" }, null).mode).toBe("sevenO");
    expect(normalizeView({ mode: "sevenO" }, null).mode).toBe("sevenO");
    expect(normalizeView({ mode: "private" }, null).mode).toBe("classic");
    expect(normalizeView({ rulesMode: "unknown" }, null).mode).toBe("classic");
    expect(normalizeView({}, null).mode).toBe("classic");
  });

  it("reads the mode from a local game state", () => {
    const state = {
      ...createGame(7, [
        { id: "local", name: "You" },
        { id: "ai1", name: "Computer" },
      ]),
      mode: "sevenO",
    } as GameState;
    expect(viewFromCore(state, "local").mode).toBe("sevenO");
    expect(viewFromCore(null, "local").mode).toBe("classic");
  });

  it("exposes the controller rules shape and forwards a target", () => {
    const play = vi.fn();
    const controller: Pick<
      UnoController,
      "rulesMode" | "setRulesMode" | "rulesModeLabel" | "play"
    > = {
      rulesMode: "sevenO",
      setRulesMode: () => undefined,
      rulesModeLabel: "Seven-O",
      play,
    };
    expect(controller.rulesMode).toBe("sevenO");
    expect(controller.rulesModeLabel).toBe("Seven-O");
    controller.play("red-7-0", undefined, "ai1");
    expect(play).toHaveBeenCalledWith("red-7-0", undefined, "ai1");
  });
});

describe("Uno Seven-O targeting", () => {
  it("detects only seven number cards", () => {
    expect(isSevenCard({ id: "red-7-0", color: "red", kind: "number", value: 7 } as Card)).toBe(true);
    expect(isSevenCard({ id: "red-0-0", color: "red", kind: "number", value: 0 } as Card)).toBe(false);
    expect(isSevenCard({ id: "wild-0", color: null, kind: "wild" } as Card)).toBe(false);
  });

  it("offers only the other seated players as targets", () => {
    const view = normalizeView({
      started: true,
      players: [
        { userId: "me", seat: 0, count: 1 },
        { userId: "a", seat: 1, count: 2 },
        { userId: "b", seat: 2, count: 3 },
      ],
      spectators: [{ userId: "watch" }],
    }, "me");
    expect(targetCandidates(view).map((player) => player.userId)).toEqual(["a", "b"]);
  });
});
