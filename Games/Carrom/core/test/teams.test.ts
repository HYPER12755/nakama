import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  createInitialState,
  resolveShotRules,
  teamOf,
  teammateOf,
  teamsFor,
  type CarromPhysicsResult,
  type CarromState,
} from "../src";

const shot = { position: 0.5, angle: -Math.PI / 2, power: 0.8 };

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
    duration: 100,
  };
}

function doublesState(): CarromState {
  return createInitialState(["white", "yellow", "black", "green"], {
    teams: true,
  });
}

/** Pocket a number of a colour's men by faking hits on their ids. */
function pocketMen(state: CarromState, colour: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${colour[0]}${index + 1}`);
}

describe("doubles teams", () => {
  it("partners sit opposite and the turn crosses teams", () => {
    expect(teamOf("white")).toBe("A");
    expect(teamOf("black")).toBe("A");
    expect(teamOf("yellow")).toBe("B");
    expect(teamOf("green")).toBe("B");
    expect(teammateOf("white")).toBe("black");
    expect(teammateOf("yellow")).toBe("green");
    const teams = teamsFor(doublesState().players);
    expect(teams).toHaveLength(2);
    expect(teams[0]?.players).toEqual(["white", "black"]);
  });

  it("treats a partner's piece as our own", () => {
    const state = doublesState();
    const { outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ["b1"]),
      shot,
    );
    expect(outcome.foul).toBe(false);
    expect(outcome.turnContinued).toBe(true);
  });

  it("still fouls on an opponent's piece", () => {
    const state = doublesState();
    const { outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ["y1"]),
      shot,
    );
    expect(outcome.foul).toBe(true);
    expect(outcome.turnContinued).toBe(false);
  });

  it("lets a partner's piece cover the queen", () => {
    const state = doublesState();
    const first = resolveShotRules(
      state,
      fabricatePhysics(state, ["queen"]),
      shot,
    );
    expect(first.state.queen.status).toBe("pending");
    const covered = resolveShotRules(
      first.state,
      fabricatePhysics(first.state, ["b1"]),
      shot,
    );
    expect(covered.state.queen.status).toBe("covered");
    expect(covered.state.queen.owner).toBe("white");
  });

  it("needs both partners' pieces to win", () => {
    let state = doublesState();
    // Clear white's nine men; team A must not win while black still has men.
    const whiteMen = pocketMen(state, "white", 9);
    for (const id of whiteMen) {
      state = resolveShotRules(state, fabricatePhysics(state, [id]), shot).state;
    }
    expect(state.scores.white).toBe(9);
    expect(state.status).toBe("aiming");

    // Cover the queen and clear black's men as well.
    state = resolveShotRules(
      state,
      fabricatePhysics(state, ["queen"]),
      shot,
    ).state;
    state = resolveShotRules(
      state,
      fabricatePhysics(state, ["w1"]),
      shot,
    ).state;
    for (const id of pocketMen(state, "black", 9)) {
      const next = resolveShotRules(
        state,
        fabricatePhysics(state, [id]),
        shot,
      ).state;
      if (next.status === "finished") {
        state = next;
        break;
      }
      state = next;
    }
    expect(state.status).toBe("finished");
    expect(state.winnerTeam).toBe("A");
  });

  it("leaves singles games unaffected", () => {
    const state = createInitialState();
    const { outcome } = resolveShotRules(
      state,
      fabricatePhysics(state, ["b1"]),
      shot,
    );
    expect(outcome.foul).toBe(true);
  });
});
