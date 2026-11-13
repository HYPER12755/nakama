import { describe, expect, it } from "vitest";
import {
  isLaunchBusy,
  launchButtonLabel,
  launchButtonShortLabel,
  launchPhaseFor,
  type LaunchState,
} from "../src/lib/launchPhase";

describe("launch phases", () => {
  it("labels every phase of the launch pipeline", () => {
    expect(launchButtonLabel("idle", "Carrom")).toBe("Play Carrom");
    expect(launchButtonLabel("verifying", "Carrom")).toBe("Verifying release…");
    expect(launchButtonLabel("account", "Carrom")).toBe(
      "Connect your account",
    );
    expect(launchButtonLabel("preparing", "Carrom")).toBe(
      "Preparing shared account…",
    );
    expect(launchButtonLabel("opening", "Carrom")).toBe("Opening…");
    expect(launchButtonLabel("error", "Carrom")).toBe("Try again");
  });

  it("keeps card labels short", () => {
    expect(launchButtonShortLabel("idle")).toBe("Play");
    expect(launchButtonShortLabel("opening")).toBe("Opening…");
    expect(launchButtonShortLabel("error")).toBe("Retry");
  });

  it("marks only in flight phases as busy", () => {
    expect(isLaunchBusy("idle")).toBe(false);
    expect(isLaunchBusy("error")).toBe(false);
    expect(isLaunchBusy("account")).toBe(false);
    expect(isLaunchBusy("verifying")).toBe(true);
    expect(isLaunchBusy("preparing")).toBe(true);
    expect(isLaunchBusy("opening")).toBe(true);
  });

  it("resolves the phase for one game at a time", () => {
    const state: LaunchState = { gameId: "chess", phase: "opening" };
    expect(launchPhaseFor(state, "chess")).toBe("opening");
    expect(launchPhaseFor(state, "carrom")).toBe("idle");
    expect(launchPhaseFor(null, "chess")).toBe("idle");
  });
});
