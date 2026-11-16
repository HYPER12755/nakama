import { ChessEngine } from "@moongames/chess-core";
import {
  ExternalEngine,
  readEngineOutput,
  type EngineMode,
} from "./externalEngine";
import { povChances } from "./winningChances";

/**
 * The puzzles of a game.
 *
 * The engine looks at every position of the game, and the moves where a
 * player gave away the most become puzzles: the position before the
 * mistake, and the move that should have been played there. The lines are
 * the ones lichess draws them at, so a move that is a mistake here is a
 * mistake there.
 */

/** The most a move may give away and still be a puzzle. */
export const PUZZLE_LOSS_THRESHOLD = 0.2;

/** How many puzzles are taken from one game. */
export const PUZZLE_MAX_PER_GAME = 5;

/** One puzzle, as it is offered to the server. */
export interface MinedPuzzle {
  /** The position the player is given. */
  fen: string;
  /** The move that should have been played, in the engine's way. */
  solution: string;
  /** How much the mistake gave away, in the chances of winning. */
  loss: number;
  /** What the position was worth before the mistake. */
  cp: number;
  /** Where in the game the mistake was made. */
  ply: number;
}

export interface MinePuzzlesOptions {
  /** The position the game started from. */
  initialFen: string;
  /** The positions of the game, with the move that was played from each. */
  positions: Array<{ fen: string; uci: string }>;
  /** The kind of game, which decides whether the engine may be asked. */
  mode: EngineMode;
  /** The token of the session, so the server knows who is asking. */
  token?: string;
  /** How deep the engine should look. */
  depth?: number;
  /** Called for every position that was looked at. */
  onProgress?: (done: number, total: number) => void;
}

export interface MinedPuzzles {
  puzzles: MinedPuzzle[];
  /** What went wrong, when something did. */
  error: string | null;
}

/**
 * The positions of a game, with the move that was played from each of them.
 */
export function gamePositions(
  initialFen: string,
  steps: string[],
): Array<{ fen: string; uci: string }> {
  const engine = new ChessEngine();
  engine.load(initialFen);

  const positions: Array<{ fen: string; uci: string }> = [];
  for (const san of steps) {
    const fen = engine.getState().fen;
    const move = engine.moveSan(san);
    positions.push({ fen, uci: move.uci });
  }
  return positions;
}

/**
 * The engine looks at every position of the game, and the mistakes become
 * puzzles.
 */
export async function minePuzzles(
  options: MinePuzzlesOptions,
): Promise<MinedPuzzles> {
  const {
    initialFen,
    positions,
    mode,
    token,
    depth = 12,
    onProgress,
  } = options;

  if (positions.length === 0) {
    return { puzzles: [], error: "That game has no moves." };
  }

  const engine = new ExternalEngine("");
  const chances: number[] = [];
  const best: string[] = [];

  try {
    for (let index = 0; index < positions.length; index += 1) {
      const ply = index;
      // The side to move is black when the number of moves so far is odd.
      const flipped = ply % 2 === 1;
      const latest: { cp?: number; mate?: number } = {};
      let seen = false;
      let bestMove: string | undefined;

      await engine.analyse(
        {
          initialFen,
          moves: positions.slice(0, ply).map((position) => position.uci),
          depth,
          multiPv: 1,
          threads: 1,
          hash: 16,
          mode,
          token,
        },
        (line) => {
          const read = readEngineOutput(line, flipped);
          if (read !== null) {
            latest.cp = read.cp;
            latest.mate = read.mate;
            seen = true;
            const first = read.moves[0];
            if (first !== undefined) {
              bestMove = first;
            }
          }
        },
      );

      const white: { cp?: number; mate?: number } = {};
      if (seen) {
        if (typeof latest.cp === "number") {
          white.cp = flipped ? -latest.cp : latest.cp;
        }
        if (typeof latest.mate === "number") {
          white.mate = flipped ? -latest.mate : latest.mate;
        }
      }
      chances.push(povChances("w", white));
      best.push(bestMove ?? "");
      onProgress?.(index + 1, positions.length);
    }
  } catch (cause) {
    return {
      puzzles: [],
      error:
        cause instanceof Error
          ? cause.message
          : "The engine could not be reached.",
    };
  }

  const puzzles: MinedPuzzle[] = [];
  for (let index = 0; index < positions.length; index += 1) {
    const before = chances[index];
    const after = index + 1 < chances.length ? chances[index + 1] : null;
    if (before === undefined || after === null) {
      continue;
    }
    // The move was made by the side whose turn it was.
    const mover = index % 2 === 0 ? "w" : "b";
    // Lichess measures how much a move gave away as half the difference of
    // the winning chances, so a puzzle is found at the same line there.
    const loss =
      mover === "w" ? (before - after) / 2 : (after - before) / 2;
    const solution = best[index];

    // A position that is already won, or already lost, is not worth a
    // puzzle: the engine would rather shuffle a king than win.
    const chancesOfMover = mover === "w" ? before : -before;
    if (chancesOfMover > 0.8 || chancesOfMover < -0.8) {
      continue;
    }
    if (loss <= PUZZLE_LOSS_THRESHOLD || solution === undefined || solution === "") {
      continue;
    }
    puzzles.push({
      fen: positions[index].fen,
      solution,
      loss: Math.max(0, Math.min(1, loss)),
      cp: Math.round(((before + 1) / 2) * 100),
      ply: index,
    });
  }

  puzzles.sort((left, right) => right.loss - left.loss);
  return { puzzles: puzzles.slice(0, PUZZLE_MAX_PER_GAME), error: null };
}
