import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createInitialState, simulateShot, type CarromState } from "../src";

interface Fixture {
  shots: Array<{ position: number; angle: number; power: number }>;
  steps: Array<{
    turn: string;
    scores: Record<string, number>;
    shotNumber: number;
    discs: Array<{
      id: string;
      kind: string;
      x: number;
      y: number;
      pocketed: boolean;
    }>;
  }>;
}

/**
 * The whole-match parity suite. The same ten shots are played on the client
 * and on the authoritative server; each position after each shot must agree.
 * The fixture is read by both sides so there is one shared record of the game.
 */
const fixture = JSON.parse(
  readFileSync(
    new URL("../../server/test/fixtures/whole-match.json", import.meta.url),
    "utf8",
  ),
) as Fixture;

describe("whole match parity", () => {
  it(
    "plays every shot the same way the server does",
    () => {
    let state: CarromState = createInitialState([
      "white",
      "black",
      "green",
      "yellow",
    ]);

    fixture.shots.forEach((shot, index) => {
      const result = simulateShot(state, shot, { frames: false });
      state = result.state;
      const expected = fixture.steps[index]!;

      expect(state.turn, `turn after shot ${index + 1}`).toBe(expected.turn);
      expect(state.shotNumber, `shot count after ${index + 1}`).toBe(
        expected.shotNumber,
      );
      for (const colour of ["white", "black", "green", "yellow"]) {
        expect(state.scores[colour as keyof typeof state.scores]).toBe(
          expected.scores[colour] ?? 0,
        );
      }
      expect(state.discs).toHaveLength(expected.discs.length);
      for (const disc of expected.discs) {
        const actual = state.discs.find((entry) => entry.id === disc.id);
        expect(actual, `disc ${disc.id} after shot ${index + 1}`).toBeDefined();
        expect(actual!.x).toBeCloseTo(disc.x, 5);
        expect(actual!.y).toBeCloseTo(disc.y, 5);
        expect(actual!.pocketed).toBe(disc.pocketed);
      }
    });
    },
    30000,
  );
});
