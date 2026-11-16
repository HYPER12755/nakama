/**
 * The tournaments.
 *
 * A tournament is a number of rounds in which everybody plays one game in
 * every round. The server keeps the rounds and the standings, so every
 * player sees the same one.
 */

/** A player in a tournament. */
export interface TournamentPlayer {
  userId: string;
  username: string;
  rating: number;
  /** The points of the player: one for a win, half for a draw. */
  points: number;
  /** The place of the player in the standings. */
  position: number;
  /** The players the player has played. */
  opponents: string[];
  /** The results of the player: w, l, d or b for a round with no game. */
  results: string[];
  /** The game of the player in this round, when there is one. */
  matchId: string | null;
  /** The colour of the player in this round. */
  color: "w" | "b" | null;
  /** The rounds the player had no game in. */
  byes: number;
}

/** A game of a round. */
export interface TournamentGame {
  white: string;
  black: string;
  /** The winner, or "draw", when the game is done. */
  result: string | null;
  matchId: string | null;
}

/** A round that has been played. */
export interface TournamentRound {
  number: number;
  games: TournamentGame[];
}

/** A tournament, as the server gives it. */
export interface Tournament {
  id: string;
  name: string;
  host: string;
  hostName: string;
  status: "open" | "running" | "finished";
  /** The round being played. */
  round: number;
  /** How many rounds there are. */
  rounds: number;
  timeControl: { initialMs: number; incrementMs: number };
  players: TournamentPlayer[];
  roundsDone: TournamentRound[];
  createdAt: number;
}

function readPlayer(value: unknown): TournamentPlayer | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const player = value as Record<string, unknown>;
  if (typeof player.userId !== "string") {
    return null;
  }
  return {
    userId: player.userId,
    username:
      typeof player.username === "string" ? player.username : "Player",
    rating: Number(player.rating) || 0,
    points: Number(player.points) || 0,
    position: Number(player.position) || 0,
    opponents: Array.isArray(player.opponents)
      ? player.opponents.filter((id): id is string => typeof id === "string")
      : [],
    results: Array.isArray(player.results)
      ? player.results.filter((result): result is string =>
          typeof result === "string",
        )
      : [],
    matchId: typeof player.matchId === "string" ? player.matchId : null,
    color: player.color === "w" || player.color === "b" ? player.color : null,
    byes: Number(player.byes) || 0,
  };
}

/**
 * Read a tournament, without trusting the shape of it.
 */
export function readTournament(value: unknown): Tournament | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string") {
    return null;
  }

  const players: TournamentPlayer[] = Array.isArray(raw.players)
    ? raw.players.flatMap((entry) => {
        const player = readPlayer(entry);
        return player === null ? [] : [player];
      })
    : [];

  const roundsDone: TournamentRound[] = Array.isArray(raw.roundsDone)
    ? raw.roundsDone.flatMap((entry) => {
        if (entry === null || typeof entry !== "object") {
          return [];
        }
        const round = entry as Record<string, unknown>;
        const games: TournamentGame[] = Array.isArray(round.games)
          ? round.games.flatMap((game) => {
              if (game === null || typeof game !== "object") {
                return [];
              }
              const entryGame = game as Record<string, unknown>;
              if (typeof entryGame.white !== "string") {
                return [];
              }
              return [
                {
                  white: entryGame.white,
                  black:
                    typeof entryGame.black === "string" ? entryGame.black : "",
                  result:
                    typeof entryGame.result === "string" ? entryGame.result : null,
                  matchId:
                    typeof entryGame.matchId === "string"
                      ? entryGame.matchId
                      : null,
                },
              ];
            })
          : [];
        return [{ number: Number(round.number) || 0, games }];
      })
    : [];

  const timeControl =
    raw.timeControl !== null && typeof raw.timeControl === "object"
      ? (raw.timeControl as Record<string, unknown>)
      : {};

  return {
    id: raw.id,
    name: typeof raw.name === "string" ? raw.name : "A tournament",
    host: typeof raw.host === "string" ? raw.host : "",
    hostName: typeof raw.hostName === "string" ? raw.hostName : "Player",
    status:
      raw.status === "running" || raw.status === "finished"
        ? raw.status
        : "open",
    round: Number(raw.round) || 0,
    rounds: Number(raw.rounds) || 0,
    timeControl: {
      initialMs: Number(timeControl.initialMs) || 0,
      incrementMs: Number(timeControl.incrementMs) || 0,
    },
    players,
    roundsDone,
    createdAt: Number(raw.createdAt) || 0,
  };
}

/**
 * Read the list of the tournaments.
 */
export function readTournamentList(value: unknown): Tournament[] {
  if (value === null || typeof value !== "object") {
    return [];
  }
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.tournaments)) {
    return [];
  }
  return raw.tournaments.flatMap((entry) => {
    const tournament = readTournament(entry);
    return tournament === null ? [] : [tournament];
  });
}

/** The points of a player, written the way a score sheet writes them. */
export function pointsText(points: number): string {
  return Number.isInteger(points) ? `${points}` : points.toFixed(1);
}
