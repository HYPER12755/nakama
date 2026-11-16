import type { EvalScore } from "./winningChances";

/**
 * The client of an engine that runs on the server.
 *
 * This is the way lichess reaches the engines on its own analysis servers:
 * the client sends the position and the search it wants, and the answer
 * comes back as a stream of lines, each one an evaluation that is a little
 * deeper than the last.
 *
 * The engine never runs inside the phone, so it works the same on every
 * device, and a phone that is slow at chess is still good at chess.
 */

/** One line of the answer of the engine. */
export interface EngineOutput {
  /** The line that keeps the connection alive while the engine thinks. */
  keepalive?: boolean;
  /** How long the engine has been thinking, in milliseconds. */
  time?: number;
  /** How deep the search has gone. */
  depth?: number;
  /** How many positions the engine has looked at. */
  nodes?: number;
  /** The move the engine likes best. */
  bestmove?: string;
  /** The move the engine would like to play after that. */
  ponder?: string;
  /** The lines the engine is thinking about. */
  pvs?: Array<{
    depth: number;
    cp?: number;
    mate?: number;
    moves?: string[];
  }>;
}

/** The work the engine is asked to do. */
export interface EngineWork {
  /** The position the game starts from. */
  initialFen: string;
  /** The moves that were played, in the engine's own way. */
  moves: string[];
  /** How deep the search should go. */
  depth: number;
  /** How many lines the engine should think about. */
  multiPv: number;
  /** How many threads the engine may use. */
  threads: number;
  /** How much memory the engine may use. */
  hash: number;
}

/** One evaluation, as the client keeps it. */
export interface EngineEvaluation {
  /** The number of hundredths of a pawn, when the game is not a mate. */
  cp?: number;
  /** The number of moves to the mate, when the game is a mate. */
  mate?: number;
  /** How deep the search has gone. */
  depth: number;
  /** How many positions the engine has looked at. */
  nodes: number;
  /** How long the engine has been thinking, in milliseconds. */
  millis: number;
  /** The moves of the best line, in the engine's own way. */
  moves: string[];
  /** The lines the engine is thinking about. */
  pvs: Array<{ depth: number; score: EvalScore; moves: string[] }>;
  /** The move the engine likes best. */
  bestmove?: string;
}

/**
 * The reading of the answer of the engine.
 *
 * The engine talks about the side to move, so the numbers are turned about
 * when the position is the other side's turn.
 */
export function readEngineOutput(
  line: EngineOutput,
  flipped: boolean,
): EngineEvaluation | null {
  const first = line.pvs?.[0];
  if (first === undefined) {
    return null;
  }

  const score: EvalScore = {};
  if (typeof first.cp === "number") {
    score.cp = flipped ? -first.cp : first.cp;
  }
  if (typeof first.mate === "number") {
    score.mate = flipped ? -first.mate : first.mate;
  }

  return {
    cp: score.cp,
    mate: score.mate,
    depth: line.depth ?? first.depth,
    nodes: line.nodes ?? 0,
    millis: line.time ?? 0,
    moves: first.moves ?? [],
    pvs: (line.pvs ?? []).map((pv) => {
      const pvScore: EvalScore = {};
      if (typeof pv.cp === "number") {
        pvScore.cp = flipped ? -pv.cp : pv.cp;
      }
      if (typeof pv.mate === "number") {
        pvScore.mate = flipped ? -pv.mate : pv.mate;
      }
      return { depth: pv.depth, score: pvScore, moves: pv.moves ?? [] };
    }),
    bestmove: line.bestmove,
  };
}

/**
 * Ask the engine on the server what a position is worth.
 *
 * The answer is given line by line, so the player sees the engine think.
 * The request is stopped when the caller stops listening, so a position
 * that is no longer on the board costs the engine nothing.
 */
export class ExternalEngine {
  private controller: AbortController | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly id = "moongames",
  ) {}

  /**
   * The analysis of a position.
   *
   * The function is called for every line the engine sends.
   */
  async analyse(
    work: EngineWork,
    onEvaluation: (line: EngineOutput) => void,
  ): Promise<void> {
    this.stop();

    const controller = new AbortController();
    this.controller = controller;

    const response = await fetch(
      `${this.endpoint}/api/external-engine/${this.id}/analyse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          clientSecret: "",
          work: {
            sessionId: "moongames",
            threads: work.threads,
            hash: work.hash,
            multiPv: work.multiPv,
            variant: "chess",
            initialFen: work.initialFen,
            moves: work.moves,
            by: "depth",
            value: work.depth,
          },
        }),
      },
    );

    if (!response.ok || response.body === null) {
      throw new Error("the engine could not be reached");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const text = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");

        if (text.length === 0) {
          continue;
        }

        let line: EngineOutput;
        try {
          line = JSON.parse(text) as EngineOutput;
        } catch {
          continue;
        }
        if (line.keepalive === true) {
          continue;
        }
        onEvaluation(line);
      }
    }
  }
  /** Stop the analysis. */
  stop(): void {
    this.controller?.abort();
    this.controller = null;
  }
}
