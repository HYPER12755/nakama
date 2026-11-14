import {
  CARROM_BOARD,
  PLAYER_LABEL,
  type CarromPlayer,
  type CarromSide,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

/** How far one step of the slider moves the striker. */
const POSITION_STEP = 0.005;

export interface StrikerDockProps {
  /** The colour whose baseline the striker belongs to. */
  player: CarromPlayer;
  /** The edge of the screen that baseline is on, after the table is turned. */
  side: CarromSide;
  /** The striker's position along that baseline. */
  position: number;
  onChange: (value: number) => void;
  onNudge: (direction: -1 | 1) => void;
  disabled?: boolean;
}

/**
 * The striker control. It lives on the board, on the edge of the player whose
 * turn it is, so the control is always where the striker is and only the
 * player who is shooting sees one.
 */
export function StrikerDock({
  player,
  side,
  position,
  onChange,
  onNudge,
  disabled = false,
}: StrikerDockProps) {
  return (
    <div className={`striker-dock striker-dock--${side}`}>
      <span className="striker-dock__label">
        <span className={`striker-dock__disc striker-dock__disc--${player}`} />
        {PLAYER_LABEL[player]}
      </span>
      <span className="striker-dock__controls">
        <button
          type="button"
          className="stepper"
          onClick={() => onNudge(-1)}
          disabled={disabled}
          aria-label={`Move the ${PLAYER_LABEL[player]} striker back`}
        >
          <Icon name="chevron-left" size={15} strokeWidth={2.2} />
        </button>
        <input
          type="range"
          min={CARROM_BOARD.baselineMin}
          max={CARROM_BOARD.baselineMax}
          step={POSITION_STEP}
          value={position}
          disabled={disabled}
          aria-label={`${PLAYER_LABEL[player]} striker position along the baseline`}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          className="stepper"
          onClick={() => onNudge(1)}
          disabled={disabled}
          aria-label={`Move the ${PLAYER_LABEL[player]} striker forward`}
        >
          <Icon name="chevron-right" size={15} strokeWidth={2.2} />
        </button>
      </span>
    </div>
  );
}
