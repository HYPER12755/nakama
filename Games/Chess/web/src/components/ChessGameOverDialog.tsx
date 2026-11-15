import { Icon } from "@moongames/game-ui";

export interface ChessGameOverDialogProps {
  /** The result of the game. */
  result: {
    status: string;
    winnerColor?: "w" | "b" | null;
    reason: string;
  };
  /** The name of the player who won, when there is one. */
  winnerName?: string | null;
  /** True when the player who is looking won. */
  won: boolean;
  /** True when the game ended in a draw. */
  draw: boolean;
  /** Offers a rematch, which is how every chess app handles a finished game. */
  onRematch?: () => void;
  onClose: () => void;
}

function reasonText(reason: string): string {
  return reason.replace(/_/g, " ");
}

/**
 * The screen that says how the game ended. Without it a player only sees a
 * status line and has to work out that the game is over.
 */
export function ChessGameOverDialog({
  result,
  winnerName,
  won,
  draw,
  onRematch,
  onClose,
}: ChessGameOverDialogProps) {
  const title = draw
    ? "Draw"
    : won
      ? "You win"
      : `${winnerName ?? "Your opponent"} wins`;
  const detail = draw
    ? `The game ended in a ${reasonText(result.reason)}.`
    : won
      ? `You won by ${reasonText(result.reason)}.`
      : `You lost by ${reasonText(result.reason)}.`;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <section
        className="dialog result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chess-result-title"
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
        <span
          className={`result-dialog__mark result-dialog__mark--${won ? "white" : "black"}`}
        >
          <Icon name="trophy" size={34} strokeWidth={1.6} />
        </span>
        <p className="eyebrow">Game over</p>
        <h2 id="chess-result-title">{title}</h2>
        <p className="result-dialog__copy">{detail}</p>
        <div className="result-dialog__actions">
          {onRematch === undefined ? null : (
            <button
              type="button"
              className="button button--primary"
              onClick={onRematch}
            >
              <Icon name="sparkles" size={17} />
              Rematch
            </button>
          )}
          <button
            type="button"
            className="button button--ghost"
            onClick={onClose}
          >
            View board
          </button>
        </div>
      </section>
    </div>
  );
}
