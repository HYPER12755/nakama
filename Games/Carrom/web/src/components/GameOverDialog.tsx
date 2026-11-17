import {
  PLAYER_LABEL,
  type CarromPlayer,
  type GameVariant,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

interface GameOverDialogProps {
  winner: CarromPlayer;
  /** The name the winner is known by. */
  winnerName?: string;
  /** The rules this table played, so the copy describes the right finish. */
  variant?: GameVariant;
  /** How many seats were at the table. */
  seats?: number;
  /** The winning side of a doubles table. */
  winnerTeam?: "A" | "B" | null;
  /** The label of the winning side. */
  winnerTeamLabel?: string;
  onNewGame: () => void;
  onClose: () => void;
  /** Offers a rematch, which is how every carrom app handles a finished board. */
  onRematch?: () => void;
}

export function GameOverDialog({
  winner,
  winnerName,
  variant = "classic",
  seats = 2,
  winnerTeam,
  winnerTeamLabel,
  onNewGame,
  onClose,
  onRematch,
}: GameOverDialogProps) {
  const name = winnerName ?? PLAYER_LABEL[winner];
  const teamName = winnerTeamLabel ?? (winnerTeam ? `Team ${winnerTeam}` : "");
  const finish = winnerTeam
    ? `${teamName} cleared both partners' pieces and won the board together.`
    : variant === "freestyle"
      ? `All of ${PLAYER_LABEL[winner].toLowerCase()}'s pieces are pocketed. The queen plays as an ordinary piece here.`
      : variant === "practice"
        ? `${PLAYER_LABEL[winner]} cleared their pieces. Practice tables keep no score and call no fouls.`
        : seats > 2
          ? `${PLAYER_LABEL[winner]} cleared their pieces first at this table, with the queen covered.`
          : `Every piece of ${PLAYER_LABEL[winner].toLowerCase()} colour is in a pocket and the queen is covered. A clean finish.`;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="dialog result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="icon-button result-dialog__close"
          onClick={onClose}
          aria-label="View the board"
        >
          <Icon name="close" size={18} />
        </button>
        <span className={`result-dialog__mark result-dialog__mark--${winner}`}>
          <Icon name="trophy" size={34} strokeWidth={1.6} />
        </span>
        <p className="eyebrow">{winnerTeam ? "Doubles" : "Board cleared"}</p>
        <h2 id="result-title">{winnerTeam ? teamName : name} wins</h2>
        <p className="result-dialog__copy">{finish}</p>
        <div className="result-dialog__actions">
          {onRematch === undefined ? (
            <button
              type="button"
              className="button button--primary"
              onClick={onNewGame}
            >
              <Icon name="refresh" size={17} />
              New board
            </button>
          ) : null}
          {onRematch !== undefined ? (
            <button type="button" className="button button--primary" onClick={onRematch}>
              <Icon name="sparkles" size={17} />
              Rematch
            </button>
          ) : null}
          <button type="button" className="button button--ghost" onClick={onClose}>
            View board
          </button>
        </div>
      </section>
    </div>
  );
}
