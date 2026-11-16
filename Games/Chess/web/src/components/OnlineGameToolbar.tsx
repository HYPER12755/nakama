export interface OnlineGameToolbarProps {
  inProgress: boolean;
  spectating: boolean;
  canResign: boolean;
  canOfferDraw: boolean;
  hasMoves: boolean;
  onResign: () => void;
  onOfferDraw: () => void;
  onFlip: () => void;
  onCopyPgn: () => void;
  /** Show the tree of the openings people play here. */
  onOpenings?: () => void;
  onLeave: () => void;
}

export function OnlineGameToolbar({
  inProgress,
  spectating,
  canResign,
  canOfferDraw,
  hasMoves,
  onResign,
  onOfferDraw,
  onFlip,
  onCopyPgn,
  onOpenings,
  onLeave,
}: OnlineGameToolbarProps) {
  return (
    <section className="panel toolbar-panel">
      <div className="panel-heading">
        <h2>Match actions</h2>
        {inProgress && (
          <span className="live-badge">{spectating ? "Watching" : "Live"}</span>
        )}
      </div>
      <div className="toolbar-grid">
        <button
          type="button"
          className="action-button action-button--danger"
          onClick={onResign}
          disabled={!canResign}
        >
          Resign
        </button>
        <button
          type="button"
          className="action-button"
          onClick={onOfferDraw}
          disabled={!canOfferDraw}
        >
          Offer draw
        </button>
        <button type="button" className="action-button" onClick={onFlip}>
          Flip board
        </button>
        <button
          type="button"
          className="action-button"
          onClick={onCopyPgn}
          disabled={!hasMoves}
        >
          Copy PGN
        </button>
        {onOpenings === undefined ? null : (
          <button type="button" className="action-button" onClick={onOpenings}>
            Explore the openings
          </button>
        )}
      </div>
      <button type="button" className="text-button" onClick={onLeave}>
        {spectating ? "Stop watching" : "Leave online match"}
      </button>
    </section>
  );
}
