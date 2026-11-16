/**
 * The opening explorer.
 *
 * The tree is made on the server out of the games that were played on this
 * platform. The same tree is shown to everybody: the only thing the client
 * decides is where in the tree to look.
 */

/** A move that was played from a place in the tree. */
export interface OpeningMove {
  /** The move, written the way a player writes it. */
  san: string;
  /** How many games played that move from this place. */
  count: number;
}

/** A game that reached a place in the tree. */
export interface OpeningGame {
  matchId: string;
  white: string;
  black: string;
  /** The result, as it is written on a score sheet. */
  result: string;
  /** Quick, private, or brought from somewhere else. */
  mode: string;
  moves: number;
  endedAt: number;
}

/** The answer the server gives for a place in the tree. */
export interface ExplorerResult {
  ok: boolean;
  /** The moves that lead here. */
  path: string[];
  /** How many games came through this place. */
  total: number;
  /** The moves that were played from here, most played first. */
  moves: OpeningMove[];
  /** The games that came through here. */
  games: OpeningGame[];
  /** What went wrong, when something did. */
  error: { code: string; message: string } | null;
}

function emptyResult(path: string[], message: string): ExplorerResult {
  return {
    ok: false,
    path,
    total: 0,
    moves: [],
    games: [],
    error: { code: "unavailable", message },
  };
}

/**
 * Read the answer of the explorer, without trusting the shape of the answer.
 */
export function readExplorerResult(
  payload: unknown,
  path: string[],
): ExplorerResult {
  if (payload === null || typeof payload !== "object") {
    return emptyResult(path, "The openings could not be read.");
  }

  const value = payload as Record<string, unknown>;
  if (value.ok !== true) {
    const raw = value.error;
    const error =
      raw !== null && typeof raw === "object"
        ? (raw as Record<string, unknown>)
        : {};
    return {
      ok: false,
      path,
      total: 0,
      moves: [],
      games: [],
      error: {
        code: typeof error.code === "string" ? error.code : "failed",
        message:
          typeof error.message === "string"
            ? error.message
            : "The openings could not be read.",
      },
    };
  }

  const moves: OpeningMove[] = Array.isArray(value.moves)
    ? value.moves.flatMap((entry) => {
        if (entry === null || typeof entry !== "object") {
          return [];
        }
        const move = entry as Record<string, unknown>;
        if (typeof move.san !== "string") {
          return [];
        }
        return [{ san: move.san, count: Number(move.count) || 0 }];
      })
    : [];

  const games: OpeningGame[] = Array.isArray(value.games)
    ? value.games.flatMap((entry) => {
        if (entry === null || typeof entry !== "object") {
          return [];
        }
        const game = entry as Record<string, unknown>;
        if (typeof game.matchId !== "string") {
          return [];
        }
        return [
          {
            matchId: game.matchId,
            white: typeof game.white === "string" ? game.white : "Player",
            black: typeof game.black === "string" ? game.black : "Player",
            result: typeof game.result === "string" ? game.result : "*",
            mode: typeof game.mode === "string" ? game.mode : "quick",
            moves: Number(game.moves) || 0,
            endedAt: Number(game.endedAt) || 0,
          },
        ];
      })
    : [];

  return {
    ok: true,
    path: Array.isArray(value.path)
      ? value.path.filter((move): move is string => typeof move === "string")
      : path,
    total: Number(value.total) || 0,
    moves,
    games,
    error: null,
  };
}

/**
 * The path as a list of move pairs, for showing it the way a game is shown.
 */
export function pathPairs(path: string[]): Array<[number, string, string?]> {
  const pairs: Array<[number, string, string?]> = [];
  for (let index = 0; index < path.length; index += 2) {
    pairs.push([
      Math.floor(index / 2) + 1,
      path[index],
      path[index + 1],
    ]);
  }
  return pairs;
}

/** The result written on a score sheet, made friendly to read. */
export function resultText(result: string): string {
  if (result === "1-0") return "White won";
  if (result === "0-1") return "Black won";
  if (result === "1/2-1/2") return "Draw";
  return "Finished";
}
