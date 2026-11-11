export interface GameToolbarProps {
  canUndo: boolean;
  onNewGame: () => void;
  onUndo: () => void;
  onFlip: () => void;
  onCopyPgn: () => void;
}

export function GameToolbar({
  canUndo,
  onNewGame,
  onUndo,
  onFlip,
  onCopyPgn,
}: GameToolbarProps) {
  return (
    <section className="panel toolbar-panel">
      <div className="panel-heading">
        <h2>Actions</h2>
      </div>
      <div className="toolbar-grid">
        <button type="button" className="action-button" onClick={onNewGame}>
          New game
        </button>
        <button
          type="button"
          className="action-button"
          onClick={onUndo}
          disabled={!canUndo}
        >
          Undo
        </button>
        <button type="button" className="action-button" onClick={onFlip}>
          Flip board
        </button>
        <button
          type="button"
          className="action-button"
          onClick={onCopyPgn}
          disabled={!canUndo}
        >
          Copy PGN
        </button>
      </div>
    </section>
  );
}
