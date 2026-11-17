import { tablePlayers, type CarromPlayer } from "@moongames/carrom-core";

export type BoardMode = "local" | "ai" | "online";

/**
 * The seats of the board that is about to be built.
 *
 * A mode change and the picker state arrive in the same React render, so the
 * board cannot read the mode from state: it would still be the old one. The
 * caller passes the mode it intends to use and this is the one place that
 * decides how many seats the new board has.
 */
export function boardPlayers(
  mode: BoardMode,
  tableSize: number,
  solo = false,
): CarromPlayer[] {
  if (solo) {
    return tablePlayers(2);
  }
  return tablePlayers(tableSize);
}

/**
 * The seats the computer is allowed to play at a local table.
 *
 * New seats are people until the player hands them over, so a four player
 * table does not silently become a game against three computers.
 */
export function allowedComputerSeats(seats: CarromPlayer[]): CarromPlayer[] {
  return seats;
}
