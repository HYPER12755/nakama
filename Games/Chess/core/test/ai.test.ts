import { describe, expect, it } from "vitest";
import { ChessEngine, chooseAiMove } from "../src";

function isLegal(fen: string, from: string, to: string): boolean {
  const engine = new ChessEngine(fen);
  return (engine.getState().legalMoves[from] ?? []).some(
    (move) => move.to === to,
  );
}

describe("chooseAiMove", () => {
  it.each(["easy", "medium", "hard"] as const)(
    "returns a legal move at the %s level",
    (difficulty) => {
      const fen = "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3";
      const move = chooseAiMove(fen, {
        difficulty,
        timeLimitMs: 800,
        random: () => 0,
      });

      expect(move).not.toBeNull();
      expect(isLegal(fen, move?.from ?? "", move?.to ?? "")).toBe(true);
    },
  );

  it("finds mate in one", () => {
    const fen = "6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1";
    const move = chooseAiMove(fen, {
      difficulty: "medium",
      timeLimitMs: 3_000,
    });

    expect(move?.san).toBe("Re8#");
    expect(move?.from).toBe("e1");
    expect(move?.to).toBe("e8");
  });

  it("takes a free queen", () => {
    const fen = "q6k/8/8/8/8/8/8/R6K w - - 0 1";
    const move = chooseAiMove(fen, {
      difficulty: "medium",
      timeLimitMs: 3_000,
    });

    expect(move?.from).toBe("a1");
    expect(move?.to).toBe("a8");
    expect(move?.san).toBe("Rxa8+");
  });

  it("returns null when the position is already checkmate", () => {
    const move = chooseAiMove("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1");
    expect(move).toBeNull();
  });
});
