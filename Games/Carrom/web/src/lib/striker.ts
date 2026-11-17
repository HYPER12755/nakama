import type { CarromPlayer } from "@moongames/carrom-core";

/** The striker starts in the middle of every player's baseline. */
export const CENTER_POSITION = 0.5;

export type Positions = Partial<Record<CarromPlayer, number>>;

/**
 * The positions of the striker after the turn has changed.
 *
 * A new player takes the table with the striker in the middle of their own
 * baseline. Keeping the last player's position makes the striker jump to a
 * corner of the line, which is both unfair and confusing. A player who keeps
 * the turn after pocketing a piece keeps their own position.
 */
export function positionsForTurn(
  current: Positions,
  previousTurn: CarromPlayer,
  nextTurn: CarromPlayer,
): Positions {
  if (previousTurn === nextTurn) {
    return current;
  }
  return {};
}

export function positionFor(
  positions: Positions,
  player: CarromPlayer,
): number {
  return positions[player] ?? CENTER_POSITION;
}
