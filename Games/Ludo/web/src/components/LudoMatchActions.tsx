import { Icon } from "./Icon";

export interface LudoMatchActionsProps {
  mode: "local" | "ai" | "online";
  spectating: boolean;
  phase: "roll" | "move" | "over";
  awaiting: boolean;
  canMove: boolean;
  canUndo: boolean;
  hasReplay: boolean;
  replaying: boolean;
  onRoll: () => void;
  onUndo: () => void;
  onPass: () => void;
  onNewGame: () => void;
  onReplay: () => void;
  onLeave: () => void;
  onResign: () => void;
}

/** The Ludo match panel, built like Chess/Carrom's dedicated action toolbar. */
export function LudoMatchActions({
  mode, spectating, phase, awaiting, canMove, canUndo, hasReplay, replaying,
  onRoll, onUndo, onPass, onNewGame, onReplay, onLeave, onResign,
}: LudoMatchActionsProps) {
  const online = mode === "online";
  const inProgress = phase !== "over";
  const hint = online
    ? spectating
      ? "You are watching this table. Actions return when you join a seat."
      : awaiting
        ? "Your die is live. Roll to start your turn."
        : canMove
          ? "Choose one of the glowing tokens."
          : "Waiting for the other player."
    : replaying
      ? "Watching the recorded race."
      : canMove
        ? "Tap a glowing token to move it."
        : awaiting
          ? "Roll the die to start your turn."
          : "Waiting for the next player.";

  return (
    <section className="panel toolbar-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Table</p>
          <h2>Match actions</h2>
        </div>
        {inProgress ? (
          <span className="live-badge">{online ? (spectating ? "Watching" : "Live") : "Playing"}</span>
        ) : (
          <span className="live-badge live-badge--done">Finished</span>
        )}
      </div>

      <div className="toolbar-grid">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={onRoll}
          disabled={replaying || !awaiting}
        >
          <Icon name="sparkles" size={14} />
          {awaiting ? "Roll dice" : phase === "move" ? "Choose a token" : "Waiting…"}
        </button>

        {online ? null : (
          <>
            <button type="button" className="action-button" onClick={onUndo} disabled={replaying || !canUndo}>
              <Icon name="skip-back" size={14} /> Undo
            </button>
            <button
              type="button"
              className="action-button"
              onClick={onPass}
              disabled={replaying || phase !== "move" || canMove}
              title="Use this when the roll cannot move a token"
            >
              <Icon name="check" size={14} /> Pass turn
            </button>
            <button type="button" className="action-button" onClick={onNewGame}>
              <Icon name="refresh" size={14} /> New game
            </button>
            <button type="button" className="action-button" onClick={onReplay} disabled={!hasReplay || replaying}>
              <Icon name="skip-back" size={14} /> Replay
            </button>
          </>
        )}
      </div>

      <p className="toolbar-note">{hint}</p>

      {online ? (
        <>
          <button type="button" className="text-button" onClick={onLeave}>
            {spectating ? "Stop watching" : "Leave online table"}
          </button>
          {spectating || phase === "over" ? null : (
            <button type="button" className="text-button text-button--danger" onClick={onResign}>
              Resign
            </button>
          )}
        </>
      ) : null}
    </section>
  );
}
