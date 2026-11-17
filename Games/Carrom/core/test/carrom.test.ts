import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  baselineOf,
  chooseAiShot,
  chooseAiShotAsync,
  createInitialState,
  findPocketAt,
  nextPlayerInTurnOrder,
  nearestValidStrikerPosition,
  pickWithRealism,
  playersInTurnOrder,
  resolveShotRules,
  simulateShot,
  strikerFits,
  strikerPoint,
  validateShot,
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
    striker: {
      x: strikerPoint(state.turn, shot.position).x,
      y: strikerPoint(state.turn, shot.position).y,
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
    expect(state.players).toEqual(["white", "black"]);
    expect(state.striker).toMatchObject({
      x: 0.5,
      y: baselineOf("white").linePosition,
      pocketed: false,
    });
  });

  it("detects pocket centres", () => {
    expect(findPocketAt(0.018, 0.018)).toEqual({ x: 0.018, y: 0.018 });
    expect(findPocketAt(0.5, 0.5)).toBeNull();
  });

  it("follows the ICF board proportions", () => {
    // 74 cm playing surface: a 3.1 cm man, a 4.13 cm striker, a 4.45 cm
    // pocket, and baselines a quarter of the way in from each side.
    expect(CARROM_BOARD.discRadius).toBeCloseTo(0.0216, 3);
    expect(CARROM_BOARD.strikerRadius).toBeCloseTo(0.0279, 3);
    expect(CARROM_BOARD.pocketRadius).toBeCloseTo(0.0301, 3);
    expect(baselineOf("white").linePosition).toBeCloseTo(0.75, 3);
    expect(baselineOf("black").linePosition).toBeCloseTo(0.25, 3);
    expect(CARROM_BOARD.baselineMin).toBeCloseTo(0.25, 3);
    expect(CARROM_BOARD.baselineMax).toBeCloseTo(0.75, 3);
    expect(CARROM_BOARD.baseCircles).toHaveLength(4);
    // A striker is roughly three times the weight of a carrom man.
    expect(CARROM_BOARD.strikerMass).toBeGreaterThan(2.5);
  });

  it("opens with the medallion in the ICF layout", () => {
    const state = createInitialState();
    const queen = state.discs.find((disc) => disc.kind === "queen")!;
    expect(queen.x).toBeCloseTo(0.5, 5);
    expect(queen.y).toBeCloseTo(0.5, 5);

    const inner = state.discs.filter(
      (disc) =>
        disc.kind !== "queen" &&
        Math.hypot(disc.x - 0.5, disc.y - 0.5) < 0.06,
    );
    const outer = state.discs.filter(
      (disc) =>
        disc.kind !== "queen" &&
        Math.hypot(disc.x - 0.5, disc.y - 0.5) >= 0.06,
    );
    expect(inner).toHaveLength(6);
    expect(outer).toHaveLength(12);
    expect(inner.filter((disc) => disc.kind === "white")).toHaveLength(3);

    // The first player sits at the bottom, so a white man from each ring
    // points straight down the board on the queen's axis.
    const axisWhite = state.discs.filter(
      (disc) =>
        disc.kind === "white" && Math.abs(disc.x - 0.5) < 0.001 && disc.y > 0.5,
    );
    expect(axisWhite).toHaveLength(2);

    // Nobody may start on top of anybody else.
    for (let left = 0; left < state.discs.length; left += 1) {
      for (let right = left + 1; right < state.discs.length; right += 1) {
        const a = state.discs[left]!;
        const b = state.discs[right]!;
        expect(
          Math.hypot(a.x - b.x, a.y - b.y),
        ).toBeGreaterThan(CARROM_BOARD.discRadius * 1.9);
      }
    }
  });

  it("moves the striker around a piece sitting on the baseline", () => {
    const state = createInitialState();
    const piece = state.discs.find((disc) => disc.kind === "white")!;
    piece.x = 0.5;
    piece.y = baselineOf("white").linePosition;
    const placed = nearestValidStrikerPosition(state, 0.5);
    expect(placed).not.toBeCloseTo(0.5, 4);
    expect(strikerFits(state, placed)).toBe(true);
    expect(validateShot(state, { ...shot, position: 0.5 })).toContain(
      "blocked",
    );
  });
});

describe("carrom tables", () => {
  it("seats two, three, and four players clockwise", () => {
    expect(playersInTurnOrder(["white", "black"])).toEqual(["white", "black"]);
    expect(playersInTurnOrder(["white", "black", "green"])).toEqual([
      "white",
      "black",
      "green",
    ]);
    expect(
      playersInTurnOrder(["white", "black", "green", "yellow"]),
    ).toEqual(["white", "yellow", "black", "green"]);
  });

  it("moves the turn to the next seated player", () => {
    expect(nextPlayerInTurnOrder(["white", "black"], "white")).toBe("black");
    expect(nextPlayerInTurnOrder(["white", "black"], "black")).toBe("white");
    expect(nextPlayerInTurnOrder(["white", "black", "green"], "black")).toBe(
      "green",
    );
    expect(
      nextPlayerInTurnOrder(["white", "black", "green", "yellow"], "white"),
    ).toBe("yellow");
  });

  it("opens three and four player boards with the right piece count", () => {
    const three = createInitialState(["white", "black", "green"]);
    expect(three.discs.filter((disc) => disc.kind === "queen")).toHaveLength(1);
    expect(three.discs.filter((disc) => disc.kind === "white")).toHaveLength(9);
    expect(three.discs.filter((disc) => disc.kind === "black")).toHaveLength(9);
    expect(three.discs.filter((disc) => disc.kind === "green")).toHaveLength(9);
    expect(three.discs).toHaveLength(28);

    const four = createInitialState(["white", "black", "green", "yellow"]);
    expect(four.discs).toHaveLength(37);
    expect(
      four.discs.filter((disc) => disc.kind === "yellow"),
    ).toHaveLength(9);
  });

  it("keeps every side of a four player board clear of overlaps", () => {
    const state = createInitialState(["white", "black", "green", "yellow"]);
    for (let left = 0; left < state.discs.length; left += 1) {
      for (let right = left + 1; right < state.discs.length; right += 1) {
        const a = state.discs[left]!;
        const b = state.discs[right]!;
        expect(
          Math.hypot(a.x - b.x, a.y - b.y),
        ).toBeGreaterThan(CARROM_BOARD.discRadius * 1.9);
      }
    }
  });

  it("puts each player on their own baseline", () => {
    expect(strikerPoint("white", 0.4)).toEqual({ x: 0.4, y: 0.75 });
    expect(strikerPoint("black", 0.6)).toEqual({ x: 0.6, y: 0.25 });
    expect(strikerPoint("green", 0.4)).toEqual({ x: 0.75, y: 0.4 });
    expect(strikerPoint("yellow", 0.6)).toEqual({ x: 0.25, y: 0.6 });
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
    expect(validateShot(state, { ...shot, position: 0.1 })).toContain(
      "baseline",
    );
    expect(() => simulateShot(state, { ...shot, position: 0.1 })).toThrow();
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

  it("passes the turn around a four player table", () => {
    const state = createInitialState(["white", "black", "green", "yellow"]);
    const { state: next } = resolveShotRules(
      state,
      fabricatePhysics(state, ["g1"]),
      shot,
    );
    expect(next.turn).toBe("yellow");
    expect(next.scores.green).toBe(1);
  });

  it("plays like a person and misses the hard lines", () => {
    const ranked = [
      { shot: { position: 0.4, angle: 0, power: 0.6 }, score: 10 },
      { shot: { position: 0.5, angle: 0.1, power: 0.6 }, score: 6 },
      { shot: { position: 0.6, angle: 0.2, power: 0.6 }, score: 2 },
    ];
    const picks = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      picks.add(JSON.stringify(pickWithRealism(ranked, seed, 0.45)));
    }
    expect(picks.size).toBeGreaterThan(1);
    // The strongest line is still the usual choice.
    expect(picks.has(JSON.stringify(ranked[0]!.shot))).toBe(true);
  });

  it(
    "offers a valid deterministic AI shot",
    () => {
      const state = createInitialState();
      const aiShot = chooseAiShot(state, { difficulty: "easy" });
      expect(validateShot(state, aiShot)).toBeNull();
      const result = simulateShot(state, aiShot, { frames: false });
      expect(result.state.shotNumber).toBe(1);
    },
    30_000,
  );

  it(
    "resolves the same AI shot when the search yields between batches",
    async () => {
      const state = createInitialState();
      const syncShot = chooseAiShot(state, { difficulty: "easy" });
      const asyncShot = await chooseAiShotAsync(state, { difficulty: "easy" });
      expect(asyncShot).toEqual(syncShot);
    },
    30_000,
  );
});
