import { useEffect, useMemo, useRef, useState } from "react";
import { ChessEngine } from "@moongames/chess-core";
import {
  ExternalEngine,
  readEngineOutput,
  type EngineEvaluation,
  type EngineWork,
} from "../lib/engine/externalEngine";

export interface UseEngineAnalysisOptions {
  /** The position the game starts from. */
  initialFen: string;
  /** The moves that were played, in the engine's own way. */
  moves: string[];
  /** Whose turn it is, which turns the numbers about. */
  turn: "w" | "b";
  /** Whether the engine should be asked at all. */
  enabled: boolean;
  /** How deep the search should go. */
  depth?: number;
  /** How many lines the engine should think about. */
  multiPv?: number;
}

export interface EngineAnalysis {
  /** The evaluation of the position. */
  evaluation: EngineEvaluation | null;
  /** The lines of the engine, written the way a player writes them. */
  pvs: Array<{
    depth: number;
    score: { cp?: number; mate?: number };
    san: string[];
    uci: string[];
  }>;
  /** Whether the engine is thinking. */
  thinking: boolean;
  /** What went wrong, when something did. */
  error: string | null;
}

/**
 * The lines of the engine, written the way a player writes them.
 *
 * The engine writes its moves in its own way, and the moves are played out
 * again here so they can be read.
 */
export function movesToSan(
  initialFen: string,
  moves: string[],
): string[] {
  if (moves.length === 0) {
    return [];
  }
  try {
    const engine = new ChessEngine(initialFen);
    const san: string[] = [];
    for (const move of moves) {
      const from = move.slice(0, 2);
      const to = move.slice(2, 4);
      const promotion = move.length > 4 ? move[4] : undefined;
      const record = engine.move({
        from,
        to,
        promotion: promotion as "q" | "r" | "b" | "n" | undefined,
      });
      san.push(record.san);
    }
    return san;
  } catch {
    return [];
  }
}

/**
 * What the engine on the server thinks of the position.
 *
 * The engine is asked again whenever the position changes, and the answer
 * that comes is the one of the position that is on the board now.
 */
export function useEngineAnalysis(
  options: UseEngineAnalysisOptions,
): EngineAnalysis {
  const {
    initialFen,
    moves,
    turn,
    enabled,
    depth = 12,
    multiPv = 1,
  } = options;

  const [evaluation, setEvaluation] = useState<EngineEvaluation | null>(null);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engineRef = useRef<ExternalEngine | null>(null);
  const key = `${initialFen}|${moves.join(" ")}`;

  useEffect(() => {
    if (!enabled) {
      setEvaluation(null);
      setThinking(false);
      return;
    }

    const engine = new ExternalEngine("");
    engineRef.current = engine;
    let alive = true;

    const work: EngineWork = {
      initialFen,
      moves,
      depth,
      multiPv,
      threads: 1,
      hash: 16,
    };

    // The engine is asked a moment after the position settles, so the
    // engine is not asked for every square the finger passes over.
    const timer = window.setTimeout(() => {
      setThinking(true);
      engine
        .analyse(work, (line) => {
          if (!alive) {
            return;
          }
          const read = readEngineOutput(line, turn === "b");
          if (read !== null) {
            setEvaluation(read);
          }
        })
        .catch((cause: unknown) => {
          if (!alive) {
            return;
          }
          setThinking(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "the engine could not be reached",
          );
        });
    }, 250);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      engine.stop();
      engineRef.current = null;
    };
    // The engine is asked again when the position changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, depth, multiPv, turn]);

  const pvs = useMemo(() => {
    if (evaluation === null) {
      return [];
    }
    return evaluation.pvs.map((pv) => ({
      depth: pv.depth,
      score: pv.score,
      san: movesToSan(initialFen, pv.moves),
      uci: pv.moves,
    }));
  }, [evaluation, initialFen]);

  return { evaluation, pvs, thinking, error };
}
