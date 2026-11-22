import { describe, expect, it, vi } from "vitest";
import { createGame, type Card, type GameMode, type GameState } from "@moongames/uno-core";
import { normalizeView, type UnoController } from "../src/hooks/useUnoGame";
import { rulesModeLabel, RULES_MODES, viewFromCore } from "../src/lib/view";
import { isSevenCard, targetCandidates } from "../src/components/UnoBoardStage";

const progressive = "progressive" as unknown as GameMode;

describe("Uno rules mode", () => {
  it("labels every mode and defaults to classic", () => {
    expect(rulesModeLabel("classic")).toBe("Classic");
    expect(rulesModeLabel("sevenO")).toBe("Seven-O");
    expect(rulesModeLabel(progressive)).toBe("Progressive");
    expect(rulesModeLabel("attack")).toBe("Attack");
    expect(rulesModeLabel("swapPack")).toBe("Swap Pack");
    expect(rulesModeLabel("reversePack")).toBe("Reverse Pack");
    expect(rulesModeLabel(undefined)).toBe("Classic");
  });

  it("lists every rules mode once", () => {
    expect(RULES_MODES).toContain("classic");
    expect(RULES_MODES).toContain("sevenO");
    expect(RULES_MODES as string[]).toContain("progressive");
    expect(RULES_MODES as string[]).toContain("attack");
    expect(RULES_MODES as string[]).toContain("swapPack");
    expect(RULES_MODES as string[]).toContain("reversePack");
    expect(new Set(RULES_MODES).size).toBe(RULES_MODES.length);
  });

  it("normalizes the rules mode from the online STATE payload", () => {
    expect(normalizeView({ rulesMode: "sevenO", mode: "private" }, null).mode).toBe("sevenO");
    expect(normalizeView({ mode: "sevenO" }, null).mode).toBe("sevenO");
    expect(normalizeView({ mode: "private" }, null).mode).toBe("classic");
    expect(normalizeView({ rulesMode: "unknown" }, null).mode).toBe("classic");
    expect(normalizeView({}, null).mode).toBe("classic");
  });

  it("normalizes progressive from the online STATE payload", () => {
    expect(normalizeView({ rulesMode: "progressive" }, null).mode).toBe("progressive");
    expect(normalizeView({ mode: "progressive" }, null).mode).toBe("progressive");
  });

  it("normalizes attack from the online STATE payload", () => {
    expect(normalizeView({ rulesMode: "attack" }, null).mode).toBe("attack");
    expect(normalizeView({ mode: "attack" }, null).mode).toBe("attack");
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

  it("reads progressive from a local game state", () => {
    const state = {
      ...createGame(7, [
        { id: "local", name: "You" },
        { id: "ai1", name: "Computer" },
      ]),
      mode: progressive,
    } as GameState;
    expect(viewFromCore(state, "local").mode).toBe("progressive");
  });

  it("reads attack from a local game state", () => {
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "attack");
    expect(viewFromCore(state, "local").mode).toBe("attack");
  });

  it("normalizes and reads Reverse Pack", () => {
    expect(normalizeView({ rulesMode: "reversePack" }, null).mode).toBe("reversePack");
    expect(normalizeView({ mode: "reversePack" }, null).mode).toBe("reversePack");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "reversePack");
    expect(viewFromCore(state, "local").rulesMode).toBe("reversePack");
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
