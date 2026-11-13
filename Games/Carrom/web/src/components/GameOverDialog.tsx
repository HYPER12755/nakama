import { PLAYER_LABEL, type CarromPlayer } from "@moongames/carrom-core";
import { Icon } from "./Icon";

interface GameOverDialogProps {
  winner: CarromPlayer;
  onNewGame: () => void;
  onClose: () => void;
}

export function GameOverDialog({
  winner,
  onNewGame,
  onClose,
}: GameOverDialogProps) {
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
        <p className="eyebrow">Board cleared</p>
        <h2 id="result-title">{PLAYER_LABEL[winner]} wins</h2>
        <p className="result-dialog__copy">
          Every piece of {PLAYER_LABEL[winner].toLowerCase()} colour is in a
          pocket and the queen is covered. A clean finish.
        </p>
        <div className="result-dialog__actions">
          <button
            type="button"
            className="button button--primary"
            onClick={onNewGame}
          >
            <Icon name="refresh" size={17} />
            New board
          </button>
          <button type="button" className="button button--ghost" onClick={onClose}>
            View board
          </button>
        </div>
      </section>
    </div>
  );
}
