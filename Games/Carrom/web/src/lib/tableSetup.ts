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
  if (solo || mode === "ai") {
    return tablePlayers(2);
  }
  return tablePlayers(tableSize);
}
