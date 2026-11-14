import { describe, expect, it } from "vitest";
import {
  CARROM_BOARD,
  createInitialState,
  tablePlayers,
} from "../src";

/**
 * The tables a game can be played at. These tests exist because the seat
 * helper once handed out the wrong number of seats: a two player table was
 * built with three seats, and the piece count and the seat list were never
 * checked against each other.
 */
describe("the tables a game is played at", () => {
  it("gives every table the seats it asked for", () => {
    expect(tablePlayers(2)).toHaveLength(2);
    expect(tablePlayers(3)).toHaveLength(3);
    expect(tablePlayers(4)).toHaveLength(4);
  });

  it("never seats more players than the table holds", () => {
    expect(tablePlayers(1)).toHaveLength(2);
    expect(tablePlayers(0)).toHaveLength(2);
    expect(tablePlayers(9)).toHaveLength(4);
  });

  it("keeps the first seat of every table", () => {
    for (const count of [2, 3, 4]) {
      expect(tablePlayers(count)[0]).toBe("white");
    }
  });

  it("builds a table with the right seats and the right pieces", () => {
    const expected = [
      { seats: 2, pieces: 19 },
      { seats: 3, pieces: 28 },
      { seats: 4, pieces: 37 },
    ];
    for (const table of expected) {
      const players = tablePlayers(table.seats);
      expect(players).toHaveLength(table.seats);
      const state = createInitialState(players);
      expect(state.players).toHaveLength(table.seats);
      expect(state.discs).toHaveLength(table.pieces);
      // Every player has a full set of men, plus the queen on the table.
      for (const player of players) {
        expect(
          state.discs.filter((disc) => disc.kind === player),
        ).toHaveLength(CARROM_BOARD.piecesPerPlayer);
      }
      expect(state.discs.filter((disc) => disc.kind === "queen")).toHaveLength(1);
    }
  });

  it("turns around the table in the seating order", () => {
    const state = createInitialState(tablePlayers(4));
    // The state lists the players in the order the turn goes round the
    // table, clockwise from the bottom.
    expect(state.players).toEqual([
      "white",
      "yellow",
      "black",
      "green",
    ]);
    expect(state.turn).toBe("white");
  });
});
