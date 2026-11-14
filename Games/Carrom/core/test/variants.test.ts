import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  CARROM_CHALLENGES,
  CARROM_STRIKERS,
  challengeProgress,
  createInitialState,
  pointsFor,
  resolveShotRules,
  simulateShot,
  type CarromPhysicsResult,
  type CarromState,
} from "../src";

const shot = {
  position: 0.5,
  angle: -Math.PI / 2,
  power: 0.8,
};

function fabricatePhysics(
  state: CarromState,
  pocketedIds: string[],
  strikerPocketed = false,
): CarromPhysicsResult {
  const pocket = CARROM_BOARD.pocketCenters[0]!;
  const pocketed = state.discs
    .filter((disc) => pocketedIds.includes(disc.id))
    .map((disc) => ({
      type: "pocket" as const,
      time: 0.5,
      id: disc.id,
      kind: disc.kind,
      pocket,
    }));
  return {
    discs: state.discs.map((disc) =>
      pocketedIds.includes(disc.id)
        ? { ...disc, x: pocket.x, y: pocket.y, pocketed: true }
        : { ...disc },
    ),
    strikerPocketed,
    striker: { x: 0.5, y: 0.75, pocketed: strikerPocketed },
    pocketed,
    events: pocketed,
    frames: [],
    duration: 1,
  };
}

describe("carrom game types", () => {
  it("counts a man as a point and the queen as three", () => {
    const state = createInitialState();
    const queen = state.discs.find((disc) => disc.kind === "queen")!;
    const pending = resolveShotRules(
      state,
      fabricatePhysics(state, [queen.id]),
      shot,
    );
    // The queen waits to be covered, so it is worth nothing yet.
    expect(pending.state.queen.status).toBe("pending");
    expect(pointsFor(pending.state, "white")).toBe(0);

    const white = pending.state.discs
      .filter((disc) => disc.kind === "white")
      .slice(0, 2)
      .map((disc) => disc.id);
    const covered = resolveShotRules(
      pending.state,
      fabricatePhysics(pending.state, white),
      shot,
    );
    expect(covered.state.queen.status).toBe("covered");
    // Two men and the covered queen.
    expect(pointsFor(covered.state, "white")).toBe(5);
  });

  it("plays the queen as an ordinary piece in freestyle", () => {
    const state = createInitialState(["white", "black"], {
      variant: "freestyle",
    });
    const queen = state.discs.find((disc) => disc.kind === "queen")!;
    const resolved = resolveShotRules(
      state,
      fabricatePhysics(state, [queen.id]),
      shot,
    );
    expect(resolved.state.queen.status).toBe("covered");
    expect(resolved.state.queen.owner).toBe("white");
    expect(pointsFor(resolved.state, "white")).toBe(3);
  });

  it("does not punish a foul on a practice table", () => {
    const state = createInitialState(["white", "black"], {
      variant: "practice",
    });
    const black = state.discs.find((disc) => disc.kind === "black")!;
    const resolved = resolveShotRules(
      state,
      fabricatePhysics(state, [black.id], true),
      shot,
    );
    expect(resolved.outcome.foul).toBe(false);
    expect(resolved.state.scores.black).toBe(1);
  });

  it("keeps the turn at a solo table", () => {
    const state = createInitialState(["white", "black"], { solo: true });
    const resolved = resolveShotRules(
      state,
      fabricatePhysics(state, []),
      shot,
    );
    expect(resolved.state.turn).toBe("white");
    expect(resolved.outcome.turnContinued).toBe(false);
  });

  it("sends the shot further with a heavier striker", () => {
    const light = createInitialState(["white", "black"], {
      strikers: { white: "light" },
    });
    const heavy = createInitialState(["white", "black"], {
      strikers: { white: "heavy" },
    });
    const lightShot = simulateShot(light, shot, { frames: false });
    const heavyShot = simulateShot(heavy, shot, { frames: false });
    const lightTravel = Math.max(
      ...lightShot.state.discs.map((disc) =>
        Math.hypot(disc.x - 0.5, disc.y - 0.5),
      ),
    );
    const heavyTravel = Math.max(
      ...heavyShot.state.discs.map((disc) =>
        Math.hypot(disc.x - 0.5, disc.y - 0.5),
      ),
    );
    expect(heavyTravel).toBeGreaterThan(lightTravel);
    expect(CARROM_STRIKERS.length).toBeGreaterThan(1);
  });

  it("keeps a challenge table honest", () => {
    const challenge = CARROM_CHALLENGES[0]!;
    const started = challengeProgress(challenge, 0, 0);
    expect(started.finished).toBe(false);
    const won = challengeProgress(challenge, challenge.target, 1);
    expect(won.finished).toBe(true);
    expect(won.won).toBe(true);
    const lost = challengeProgress(challenge, 1, challenge.shots);
    expect(lost.finished).toBe(true);
    expect(lost.won).toBe(false);
  });
});
