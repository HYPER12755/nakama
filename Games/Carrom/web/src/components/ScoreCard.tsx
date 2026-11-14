import {
  PLAYER_LABEL,
  type CarromPlayer,
  type CarromQueen,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

interface ScoreCardProps {
  player: CarromPlayer;
  /** The name the player is known by: the account name or the seat name. */
  name: string;
  /** The pieces of this colour that are still on the board. */
  left: number;
  active: boolean;
  queen: CarromQueen;
  ai: boolean;
  seat: number;
  /** The striker this player brought to the table. */
  striker?: string;
}

/**
 * A seat at the table. It says who is playing and how much is left of their
 * colour; the score itself lives in the points bar above the board, so the
 * table only carries one score display.
 */
export function ScoreCard({
  player,
  name,
  left,
  active,
  queen,
  ai,
  seat,
  striker,
}: ScoreCardProps) {
  const holdsQueen = queen.status === "covered" && queen.owner === player;
  const waiting = queen.status === "pending" && queen.owner === player;
  return (
    <div
      className={`seat-row seat-row--${player}${active ? " seat-row--active" : ""}`}
    >
      <span className={`seat-row__swatch seat-row__swatch--${player}`} />
      <div className="seat-row__identity">
        <strong>{name}</strong>
        <span>
          {ai ? "Computer" : PLAYER_LABEL[player]}
          {ai ? "" : ` · Seat ${seat}`}
        </span>
      </div>
      {striker !== undefined ? (
        <span className="seat-row__striker" title="The striker at this table">
          <Icon name="target" size={12} strokeWidth={2} />
          {striker}
        </span>
      ) : null}
      {holdsQueen ? (
        <span className="seat-row__queen">
          <span className="queen-dot" />
          Queen
          <Icon name="check" size={12} strokeWidth={2.4} />
        </span>
      ) : waiting ? (
        <span className="seat-row__queen seat-row__queen--waiting">
          <span className="queen-dot" />
          To cover
        </span>
      ) : null}
      {active ? (
        <span className="seat-row__turn">
          <span className="live-dot" />
          Shooting
        </span>
      ) : null}
      <span className="seat-row__left">
        {left}
        <small>left</small>
      </span>
    </div>
  );
}
