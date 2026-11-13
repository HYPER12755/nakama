import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  baselineY,
  chooseAiShot,
  chooseAiShotAsync,
  createInitialState,
  findPocketAt,
  nearestValidStrikerX,
  resolveShotRules,
  simulateShot,
  strikerFits,
  validateShot,
  type CarromPhysicsResult,
  type CarromState,
} from "../src";

const shot = {
  strikerX: 0.5,
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
    striker: {
      x: shot.strikerX,
      y: baselineY(state.turn),
      pocketed: strikerPocketed,
    },
    pocketed,
    events: pocketed,
    frames: [],
    duration: 1,
  };
}

function ownIds(state: CarromState): string[] {
  return state.discs
    .filter((disc) => disc.kind === "white")
    .map((disc) => disc.id);
}

describe("carrom setup", () => {
  it("creates a standard 19-piece board", () => {
    const state = createInitialState();
    expect(state.discs.filter((disc) => disc.kind === "white")).toHaveLength(9);
    expect(state.discs.filter((disc) => disc.kind === "black")).toHaveLength(9);
    expect(state.discs.filter((disc) => disc.kind === "queen")).toHaveLength(1);
    expect(state.discs.find((disc) => disc.kind === "queen")).toMatchObject({
      x: 0.5,
      y: 0.5,
      pocketed: false,
    });
    expect(state.turn).toBe("white");
    expect(state.striker).toMatchObject({
      x: 0.5,
      y: baselineY("white"),
      pocketed: false,
    });
  });

  it("detects pocket centres", () => {
    expect(findPocketAt(0.058, 0.058)).toEqual({ x: 0.058, y: 0.058 });
    expect(findPocketAt(0.5, 0.5)).toBeNull();
  });

  it("moves the striker around a piece sitting on the baseline", () => {
    const state = createInitialState();
    const piece = state.discs.find((disc) => disc.kind === "white")!;
    piece.x = 0.5;
    piece.y = baselineY("white");
    const placed = nearestValidStrikerX(state, 0.5);
    expect(placed).not.toBeCloseTo(0.5, 4);
    expect(strikerFits(state, placed)).toBe(true);
    expect(validateShot(state, { ...shot, strikerX: 0.5 })).toContain(
      "blocked",
    );
  });
});

describe("carrom physics", () => {
  it("is deterministic for the same shot", () => {
    const first = simulateShot(createInitialState(), shot);
    const second = simulateShot(createInitialState(), shot);
    expect(second.state).toEqual(first.state);
    expect(second.frames).toEqual(first.frames);
    expect(second.pocketed).toEqual(first.pocketed);
    expect(second.frames.length).toBeGreaterThan(2);
    expect(second.duration).toBeGreaterThan(0);
  });

  it("rejects shots outside the baseline", () => {
    const state = createInitialState();
    expect(validateShot(state, { ...shot, strikerX: 0.1 })).toContain(
      "baseline",
    );
    expect(() => simulateShot(state, { ...shot, strikerX: 0.1 })).toThrow();
  });
});

describe("carrom rules", () => {
  it("scores an own pocket and keeps the turn", () => {
    const state = createInitialState();
    const { state: next, outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ["w1"]),
      shot,
    );
    expect(next.scores.white).toBe(1);
    expect(next.turn).toBe("white");
    expect(outcome.turnContinued).toBe(true);
    expect(outcome.foul).toBe(false);
  });

  it("awards an opponent pocket to the opponent and ends the turn", () => {
    const state = createInitialState();
    const { state: next, outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ["b1"]),
      shot,
    );
    expect(next.scores.black).toBe(1);
    expect(next.turn).toBe("black");
    expect(outcome.foul).toBe(true);
    expect(outcome.turnContinued).toBe(false);
  });

  it("returns one piece after a striker foul", () => {
    const state = createInitialState();
    const { state: next, outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ["w1"], true),
      shot,
    );
    expect(next.scores.white).toBe(0);
    expect(next.turn).toBe("black");
    expect(outcome.returnedDisc).toBe("white");
    expect(outcome.foul).toBe(true);
  });

  it("requires the queen to be covered", () => {
    const state = createInitialState();
    const queenShot = resolveShotRules(
      state,
      fabricatePhysics(state, ["queen"]),
      shot,
    );
    expect(queenShot.state.queen).toEqual({
      status: "pending",
      owner: "white",
    });
    expect(queenShot.state.turn).toBe("white");
    expect(queenShot.outcome.turnContinued).toBe(true);

    const coverShot = resolveShotRules(
      queenShot.state,
      fabricatePhysics(queenShot.state, ["w1"]),
      shot,
    );
    expect(coverShot.state.queen).toEqual({
      status: "covered",
      owner: "white",
    });
    expect(coverShot.state.scores.white).toBe(1);
    expect(coverShot.state.turn).toBe("white");
  });

  it("returns an uncovered queen to the centre", () => {
    const state = createInitialState();
    const queenShot = resolveShotRules(
      state,
      fabricatePhysics(state, ["queen"]),
      shot,
    );
    const missedCover = resolveShotRules(
      queenShot.state,
      fabricatePhysics(queenShot.state, []),
      shot,
    );
    expect(missedCover.state.queen).toEqual({ status: "board" });
    expect(missedCover.outcome.queenReturned).toBe(true);
    expect(missedCover.state.turn).toBe("black");
    expect(
      missedCover.state.discs.find((disc) => disc.kind === "queen")?.pocketed,
    ).toBe(false);
  });

  it("protects the final piece until the queen is covered", () => {
    const state = createInitialState();
    const { state: next, outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ownIds(state)),
      shot,
    );
    expect(next.winner).toBeNull();
    expect(next.scores.white).toBe(8);
    expect(next.turn).toBe("black");
    expect(outcome.message).toContain("queen");
  });

  it("declares a winner once the queen is covered and the colour is clear", () => {
    const state = createInitialState();
    state.queen = { status: "covered", owner: "white" };
    const { state: next, outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ownIds(state)),
      shot,
    );
    expect(next.status).toBe("finished");
    expect(next.winner).toBe("white");
    expect(outcome.winner).toBe("white");
  });

  it("offers a valid deterministic AI shot", () => {
    const state = createInitialState();
    const aiShot = chooseAiShot(state, { difficulty: "easy" });
    expect(validateShot(state, aiShot)).toBeNull();
    const result = simulateShot(state, aiShot, { frames: false });
    expect(result.state.shotNumber).toBe(1);
  });

  it("resolves the same AI shot when the search yields between batches", async () => {
    const state = createInitialState();
    const syncShot = chooseAiShot(state, { difficulty: "easy" });
    const asyncShot = await chooseAiShotAsync(state, { difficulty: "easy" });
    expect(asyncShot).toEqual(syncShot);
  });
});
