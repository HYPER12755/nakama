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
    expect(rulesModeLabel("stackPack")).toBe("Stack Pack");
    expect(rulesModeLabel("speedPack")).toBe("Speed Pack");
    expect(rulesModeLabel("allWild")).toBe("All Wild");
    expect(rulesModeLabel("dare")).toBe("Dare");
    expect(rulesModeLabel("showdown")).toBe("Showdown");
    expect(rulesModeLabel("powerGrab")).toBe("Power Grab");
    expect(rulesModeLabel(undefined)).toBe("Classic");
  });

  it("lists every rules mode once", () => {
    expect(RULES_MODES).toContain("classic");
    expect(RULES_MODES).toContain("sevenO");
    expect(RULES_MODES as string[]).toContain("progressive");
    expect(RULES_MODES as string[]).toContain("attack");
    expect(RULES_MODES as string[]).toContain("swapPack");
    expect(RULES_MODES as string[]).toContain("reversePack");
    expect(RULES_MODES as string[]).toContain("stackPack");
    expect(RULES_MODES as string[]).toContain("speedPack");
    expect(RULES_MODES as string[]).toContain("allWild");
    expect(RULES_MODES as string[]).toContain("dare");
    expect(RULES_MODES as string[]).toContain("showdown");
    expect(RULES_MODES as string[]).toContain("powerGrab");
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

  it("normalizes and reads Stack Pack", () => {
    expect(normalizeView({ rulesMode: "stackPack" }, null).mode).toBe("stackPack");
    expect(normalizeView({ mode: "stackPack" }, null).mode).toBe("stackPack");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "stackPack");
    expect(viewFromCore(state, "local").rulesMode).toBe("stackPack");
  });

  it("normalizes and reads Speed Pack", () => {
    expect(normalizeView({ rulesMode: "speedPack" }, null).mode).toBe("speedPack");
    expect(normalizeView({ mode: "speedPack" }, null).mode).toBe("speedPack");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "speedPack");
    expect(viewFromCore(state, "local").rulesMode).toBe("speedPack");
    expect(viewFromCore(state, "local").speedLevel).toBe(1);
  });

  it("normalizes and reads All Wild", () => {
    expect(normalizeView({ rulesMode: "allWild" }, null).mode).toBe("allWild");
    expect(normalizeView({ mode: "allWild" }, null).mode).toBe("allWild");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "allWild");
    expect(viewFromCore(state, "local").rulesMode).toBe("allWild");
  });

  it("normalizes and reads Dare", () => {
    expect(normalizeView({ rulesMode: "dare" }, null).mode).toBe("dare");
    expect(normalizeView({ mode: "dare" }, null).mode).toBe("dare");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "dare");
    expect(viewFromCore(state, "local").rulesMode).toBe("dare");
  });

  it("normalizes and reads Showdown", () => {
    expect(normalizeView({ rulesMode: "showdown" }, null).mode).toBe("showdown");
    expect(normalizeView({ mode: "showdown" }, null).mode).toBe("showdown");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "showdown");
    expect(viewFromCore(state, "local").rulesMode).toBe("showdown");
  });

  it("normalizes and reads Power Grab", () => {
    expect(normalizeView({ rulesMode: "powerGrab" }, null).mode).toBe("powerGrab");
    expect(normalizeView({ mode: "powerGrab" }, null).mode).toBe("powerGrab");
    const state = createGame(7, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "powerGrab");
    expect(viewFromCore(state, "local").rulesMode).toBe("powerGrab");
    expect(viewFromCore(state, "local").powerTowers).toMatchObject({ U: null, N: null });
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
