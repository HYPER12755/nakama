/**
 * The puzzles: the positions to solve.
 *
 * The server keeps the puzzles and the record of each player. The client
 * only shows what the server says, and asks the engine to look at a game
 * when there is nothing to solve yet.
 */

/** A puzzle, as the server gives it. */
export interface Puzzle {
  /** The name of the puzzle. */
  id: string;
  /** The position the player is given. */
  fen: string;
  /** The move that should have been played, in the engine's way. */
  solution: string;
  /** The move that should have been played, the way a player writes it. */
  solutionSan: string;
  /** How much the mistake gave away, in the chances of winning. */
  loss: number;
  /** What the position was worth before the mistake. */
  cp: number;
  /** Where in the game the mistake was made. */
  ply: number;
  /** The game the puzzle came from. */
  game: string;
}

/** A game the engine can look at to make puzzles of. */
export interface PuzzleSource {
  /** The name of the game. */
  gameId: string;
  /** The position the game started from. */
  initialFen: string;
  /** The moves of the game, in the way a player writes them. */
  steps: string[];
  /** The positions of the game, with the move that was played from each. */
  positions: Array<{ fen: string; uci: string }>;
}

/** The answer of the server when a puzzle is asked for. */
export interface PuzzleNext {
  /** The puzzle to solve, when there is one. */
  puzzle: Puzzle | null;
  /** The game to make puzzles of, when there is nothing to solve. */
  game: PuzzleSource | null;
  /** The puzzles solved in a row. */
  streak: number;
  /** The most puzzles solved in a row. */
  best: number;
  /** The puzzles solved altogether. */
  solved: number;
  /** The puzzles that are still to be solved. */
  remaining: number;
}

/** The answer of the server when a move is given. */
export interface PuzzleAnswer {
  /** Whether the move was the answer. */
  solved: boolean;
  /** The puzzles solved in a row. */
  streak: number;
  /** The most puzzles solved in a row. */
  best: number;
  /** The attempts made. */
  played: number;
  /** The answer, given now that the move has been made. */
  solutionSan: string;
  /** The answer in the engine's way, given now that the move was made. */
  solution: string;
}

/** A run of puzzles with a clock on them. */
export interface StormState {
  /** The puzzle to solve, when there is one. */
  puzzle: Puzzle | null;
  /** The puzzles solved in the run. */
  score: number;
  /** Which puzzle of the run this is. */
  index: number;
  /** How many puzzles there are. */
  total: number;
  /** The seconds left on the clock. */
  seconds: number;
  /** Whether the run is over. */
  finished: boolean;
}

/**
 * Read the answer of the server to a run of puzzles.
 */
export function readStormState(payload: unknown): StormState {
  const state: StormState = {
    puzzle: null,
    score: 0,
    index: 0,
    total: 0,
    seconds: 0,
    finished: false,
  };
  if (payload === null || typeof payload !== "object") {
    return state;
  }
  const value = payload as Record<string, unknown>;
  if (value.ok !== true) {
    return state;
  }

  state.score = Number(value.score) || 0;
  state.index = Number(value.index) || 0;
  state.total = Number(value.total) || 0;
  state.seconds = Number(value.seconds) || 0;
  state.finished = value.finished === true;

  const raw = value.puzzle;
  if (raw !== null && typeof raw === "object") {
    const puzzle = raw as Record<string, unknown>;
    if (typeof puzzle.fen === "string" && typeof puzzle.id === "string") {
      state.puzzle = {
        id: puzzle.id,
        fen: puzzle.fen,
        solution: typeof puzzle.solution === "string" ? puzzle.solution : "",
        solutionSan:
          typeof puzzle.solutionSan === "string" ? puzzle.solutionSan : "",
        loss: Number(puzzle.loss) || 0,
        cp: Number(puzzle.cp) || 0,
        ply: Number(puzzle.ply) || 0,
        game: typeof puzzle.game === "string" ? puzzle.game : "",
      };
    }
  }

  return state;
}

function emptyNext(): PuzzleNext {
  return {
    puzzle: null,
    game: null,
    streak: 0,
    best: 0,
    solved: 0,
    remaining: 0,
  };
}

/**
 * Read the answer of the server, without trusting the shape of it.
 */
export function readPuzzleNext(payload: unknown): PuzzleNext {
  const next = emptyNext();
  if (payload === null || typeof payload !== "object") {
    return next;
  }
  const value = payload as Record<string, unknown>;
  if (value.ok !== true) {
    return next;
  }

  next.streak = Number(value.streak) || 0;
  next.best = Number(value.best) || 0;
  next.solved = Number(value.solved) || 0;
  next.remaining = Number(value.remaining) || 0;

  const raw = value.puzzle;
  if (raw !== null && typeof raw === "object") {
    const puzzle = raw as Record<string, unknown>;
    if (typeof puzzle.fen === "string" && typeof puzzle.id === "string") {
      next.puzzle = {
        id: puzzle.id,
        fen: puzzle.fen,
        solution: typeof puzzle.solution === "string" ? puzzle.solution : "",
        solutionSan:
          typeof puzzle.solutionSan === "string" ? puzzle.solutionSan : "",
        loss: Number(puzzle.loss) || 0,
        cp: Number(puzzle.cp) || 0,
        ply: Number(puzzle.ply) || 0,
        game: typeof puzzle.game === "string" ? puzzle.game : "",
      };
    }
  }

  const game = value.game;
  if (game !== null && typeof game === "object") {
    const source = game as Record<string, unknown>;
    if (typeof source.gameId === "string" && Array.isArray(source.steps)) {
      const positions = Array.isArray(source.positions)
        ? source.positions.flatMap((entry) => {
            if (entry === null || typeof entry !== "object") {
              return [];
            }
            const position = entry as Record<string, unknown>;
            if (
              typeof position.fen !== "string" ||
              typeof position.uci !== "string"
            ) {
              return [];
            }
            return [{ fen: position.fen, uci: position.uci }];
          })
        : [];
      next.game = {
        gameId: source.gameId,
        initialFen:
          typeof source.initialFen === "string"
            ? source.initialFen
            : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        steps: source.steps.filter(
          (step): step is string => typeof step === "string",
        ),
        positions,
      };
    }
  }

  return next;
}

/**
 * Read the answer of the server to a move.
 */
export function readPuzzleAnswer(payload: unknown): PuzzleAnswer {
  const answer: PuzzleAnswer = {
    solved: false,
    streak: 0,
    best: 0,
    played: 0,
    solutionSan: "",
    solution: "",
  };
  if (payload === null || typeof payload !== "object") {
    return answer;
  }
  const value = payload as Record<string, unknown>;
  if (value.ok !== true) {
    return answer;
  }
  answer.solved = value.solved === true;
  answer.streak = Number(value.streak) || 0;
  answer.best = Number(value.best) || 0;
  answer.played = Number(value.played) || 0;
  answer.solutionSan =
    typeof value.solutionSan === "string" ? value.solutionSan : "";
  answer.solution = typeof value.solution === "string" ? value.solution : "";
  return answer;
}
