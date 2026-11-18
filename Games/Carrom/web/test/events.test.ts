import { describe, expect, it } from "vitest";
import {
  createInitialState,
  resolveShotRules,
  type CarromPhysicsResult,
  type CarromShotResult,
  type CarromState,
} from "@moongames/carrom-core";
import { shotEvents } from "../src/lib/events";

function fake(
  state: CarromState,
  pocketed: Array<{ id: string; kind: string }>,
): CarromPhysicsResult {
  return {
    discs: state.discs,
    strikerPocketed: false,
    striker: { x: 0.5, y: 0.75, pocketed: false },
    pocketed: pocketed.map((p, i) => ({
      type: "pocket" as const,
      time: i * 0.1,
      id: p.id,
      kind: p.kind as never,
      pocket: { x: 0.5, y: 0.5 },
    })),
    events: [],
    frames: [],
    duration: 1,
  };
}

function result(state: CarromState, physics: CarromPhysicsResult): CarromShotResult {
  const resolved = resolveShotRules(state, physics, {
    position: 0.5,
    angle: -Math.PI / 2,
    power: 0.8,
  });
  return { ...physics, ...resolved };
}

describe("the events a shot reports", () => {
  it("names the player and the piece for a pocket", () => {
    const state = createInitialState();
    const events = shotEvents(result(state, fake(state, [{ id: "w1", kind: "white" }])), 1);
    expect(events.some((e) => e.kind === "pocket" && e.sound === "pocket")).toBe(true);
    expect(events.some((e) => e.message.includes("PLAYER") && e.message.includes("white"))).toBe(true);
  });

  it("reports the queen with its own sound", () => {
    const state = createInitialState();
    const events = shotEvents(result(state, fake(state, [{ id: "queen", kind: "queen" }])), 1);
    expect(events.some((e) => e.kind === "queen" && e.sound === "queen")).toBe(true);
  });

  it("reports a foul on an opponent's pocket", () => {
    const state = createInitialState();
    const events = shotEvents(result(state, fake(state, [{ id: "b1", kind: "black" }])), 1);
    expect(events.some((e) => e.kind === "foul" && e.sound === "foul")).toBe(true);
  });

  it("tells the next player when the turn passes", () => {
    const state = createInitialState();
    const events = shotEvents(result(state, fake(state, [])), 1);
    expect(events.some((e) => e.kind === "turn" && e.sound === "turn")).toBe(true);
  });
});
