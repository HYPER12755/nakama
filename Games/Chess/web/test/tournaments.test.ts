import { describe, expect, it } from "vitest";
import {
  pointsText,
  readTournament,
  readTournamentList,
} from "../src/lib/tournaments";

/**
 * The tournaments: what the server says, and the way it is shown.
 */

const TOURNAMENT = {
  id: "t1",
  name: "The Cup",
  host: "host",
  hostName: "The host",
  status: "running",
  round: 1,
  rounds: 3,
  timeControl: { initialMs: 300000, incrementMs: 0 },
  createdAt: 1700000000000,
  players: [
    {
      userId: "one",
      username: "One",
      rating: 1500,
      points: 1,
      position: 1,
      opponents: ["two"],
      results: ["w"],
      matchId: "match-1",
      color: "w",
      byes: 0,
      whites: 1,
      blacks: 0,
      buchholz: 0,
      withdrawn: false,
    },
    {
      userId: "two",
      username: "Two",
      rating: 1400,
      points: 0,
      position: 2,
      opponents: ["one"],
      results: ["l"],
      matchId: "match-1",
      color: "b",
      byes: 0,
      whites: 0,
      blacks: 1,
      buchholz: 1,
      withdrawn: false,
    },
  ],
  roundsDone: [
    {
      number: 1,
      games: [
        { white: "one", black: "two", result: "one", matchId: "match-1" },
      ],
    },
  ],
};

describe("a tournament", () => {
  it("is read as it is written", () => {
    const tournament = readTournament(TOURNAMENT);
    expect(tournament).not.toBeNull();
    expect(tournament?.name).toBe("The Cup");
    expect(tournament?.status).toBe("running");
    expect(tournament?.round).toBe(1);
    expect(tournament?.rounds).toBe(3);
    expect(tournament?.timeControl.initialMs).toBe(300000);
    expect(tournament?.players).toHaveLength(2);
    expect(tournament?.players[0].username).toBe("One");
    expect(tournament?.players[0].matchId).toBe("match-1");
    expect(tournament?.players[1].color).toBe("b");
    expect(tournament?.players[0].whites).toBe(1);
    expect(tournament?.players[1].blacks).toBe(1);
    expect(tournament?.players[1].buchholz).toBe(1);
    expect(tournament?.players[1].withdrawn).toBe(false);
    expect(tournament?.roundsDone[0].games[0].result).toBe("one");
  });

  it("reads the cancelled status", () => {
    expect(readTournament({ ...TOURNAMENT, status: "cancelled" })?.status).toBe(
      "cancelled",
    );
  });

  it("does not trust an answer that is not written properly", () => {
    expect(readTournament(null)).toBeNull();
    expect(readTournament({ name: "no id" })).toBeNull();
    expect(readTournament({ id: "t1", players: [7, null] })?.players).toEqual(
      [],
    );
  });

  it("is listed", () => {
    const list = readTournamentList({ tournaments: [TOURNAMENT] });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("t1");
    expect(readTournamentList(null)).toEqual([]);
    expect(readTournamentList({ tournaments: "no" })).toEqual([]);
  });
});

describe("the points of a player", () => {
  it("are written as a score sheet writes them", () => {
    expect(pointsText(1)).toBe("1");
    expect(pointsText(0)).toBe("0");
    expect(pointsText(1.5)).toBe("1.5");
  });
});
