import { MatchActionsPanel } from "@moongames/game-ui";

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
    <MatchActionsPanel
      badge={inProgress ? (
        <span className="live-badge">{spectating ? "Watching" : "Live"}</span>
      ) : null}
      kicker=""
      actions={[
        {
          id: "resign",
          label: "Resign",
          danger: true,
          onClick: onResign,
          disabled: !canResign,
        },
        {
          id: "draw",
          label: "Offer draw",
          onClick: onOfferDraw,
          disabled: !canOfferDraw,
        },
        { id: "flip", label: "Flip board", onClick: onFlip },
        {
          id: "pgn",
          label: "Copy PGN",
          onClick: onCopyPgn,
          disabled: !hasMoves,
        },
        ...(onOpenings === undefined ? [] : [{
          id: "openings",
          label: "Explore the openings",
          onClick: onOpenings,
        }]),
      ]}
      footer={
        <button type="button" className="text-button" onClick={onLeave}>
          {spectating ? "Stop watching" : "Leave online match"}
        </button>
      }
    />
  );
}
