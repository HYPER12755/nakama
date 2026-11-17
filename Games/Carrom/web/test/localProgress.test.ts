import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalProgress,
  readLocalProgress,
  recordLocalGame,
  type ProgressStorage,
} from "../src/lib/localProgress";

function memoryStorage(): ProgressStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe("the record of a local table", () => {
  let storage: ProgressStorage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it("gives every seat a rating on a finished board", () => {
    const progress = recordLocalGame(
      {
        seats: ["white", "black", "green", "yellow"],
        variant: "classic",
        winner: "white",
        shots: 18,
      },
      storage,
    );
    expect(Object.keys(progress.ratings)).toHaveLength(4);
    expect(progress.ratings.white?.after).toBeGreaterThan(1200);
    expect(progress.ratings.black?.after).toBeLessThan(1200);
    expect(progress.history).toHaveLength(1);
  });

  it("rates against all the other seats, not just one", () => {
    const first = recordLocalGame(
      {
        seats: ["white", "black"],
        variant: "classic",
        winner: "black",
        shots: 5,
      },
      storage,
    );
    const again = recordLocalGame(
      {
        seats: ["white", "green"],
        variant: "classic",
        winner: "green",
        shots: 5,
      },
      storage,
    );
    const third = recordLocalGame(
      {
        seats: ["white", "black", "green"],
        variant: "classic",
        winner: "white",
        shots: 9,
      },
      storage,
    );
    const change = third.ratings.white;
    expect(change).toBeDefined();
    const average =
      ((first.ratings.black?.after ?? 1200) +
        (again.ratings.green?.after ?? 1200)) /
      2;
    expect(average).toBeGreaterThan(1200);
    // The change is worked out from that average, not from one fixed seat.
    const expected = 32 * (1 - 1 / (1 + Math.pow(10, (average - change!.before) / 400)));
    expect(change!.after - change!.before).toBe(Math.floor(expected + 0.5));
  });

  it("keeps the record between reads", () => {
    recordLocalGame(
      {
        seats: ["white", "black"],
        variant: "freestyle",
        winner: "white",
        shots: 7,
      },
      storage,
    );
    const read = readLocalProgress(storage);
    expect(read.history).toHaveLength(1);
    expect(read.history[0]?.variant).toBe("freestyle");
    expect(read.history[0]?.shots).toBe(7);
  });

  it("records a draw without moving the rating", () => {
    const progress = recordLocalGame(
      {
        seats: ["white", "black"],
        variant: "classic",
        winner: null,
        shots: 12,
      },
      storage,
    );
    expect(progress.ratings.white?.after).toBe(1200);
    expect(progress.history[0]?.winner).toBeNull();
  });

  it("clears the record", () => {
    recordLocalGame(
      {
        seats: ["white", "black"],
        variant: "classic",
        winner: "black",
        shots: 3,
      },
      storage,
    );
    clearLocalProgress(storage);
    expect(readLocalProgress(storage).history).toHaveLength(0);
  });
});
