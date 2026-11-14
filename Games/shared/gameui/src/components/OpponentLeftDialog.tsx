import { Icon } from "./Icon";

export interface OpponentLeftDialogProps {
  /** The name of the player who left, when it is known. */
  name: string | null;
  onLeave: () => void;
  onStay: () => void;
}

/**
 * Shown when the other player leaves a table. The room closes with one tap,
 * so the player is never left staring at a table that cannot continue.
 */
export function OpponentLeftDialog({
  name,
  onLeave,
  onStay,
}: OpponentLeftDialogProps) {
  return (
    <div className="dialog-backdrop">
      <section
        className="dialog result-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="opponent-left-title"
      >
        <span className="result-dialog__mark result-dialog__mark--black">
          <Icon name="user" size={30} strokeWidth={1.6} />
        </span>
        <p className="eyebrow">Table closed</p>
        <h2 id="opponent-left-title">
          {name !== null ? `${name} left` : "Your opponent left"}
        </h2>
        <p className="result-dialog__copy">
          The table cannot continue. Leaving keeps your score, your rating, and
          your history.
        </p>
        <div className="result-dialog__actions">
          <button type="button" className="button button--primary" onClick={onLeave}>
            Leave the table
          </button>
          <button type="button" className="button button--ghost" onClick={onStay}>
            Stay
          </button>
        </div>
      </section>
    </div>
  );
}
