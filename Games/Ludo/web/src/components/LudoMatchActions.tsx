import { MatchActionsPanel, type MatchActionItem } from "@moongames/game-ui";
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
  roomCode?: string | null;
  onRoll: () => void;
  onUndo: () => void;
  onPass: () => void;
  onNewGame: () => void;
  onReplay: () => void;
  onLeave: () => void;
  onResign: () => void;
}

/** One identical action panel in every mode; unavailable actions stay visible but greyed out. */
export function LudoMatchActions({
  mode, spectating, phase, awaiting, canMove, canUndo, hasReplay, replaying,
  onRoll, onUndo, onPass, onNewGame, onReplay,
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

  const actions: MatchActionItem[] = [
    {
      id: "roll",
      label: awaiting ? "Roll dice" : phase === "move" ? "Choose a token" : "Waiting…",
      accent: true,
      disabled: replaying || !awaiting,
      onClick: onRoll,
      icon: <Icon name="sparkles" size={14} />,
    },
    {
      id: "undo",
      label: "Undo",
      disabled: online || replaying || !canUndo,
      onClick: onUndo,
      icon: <Icon name="skip-back" size={14} />,
    },
    {
      id: "pass",
      label: "Pass turn",
      disabled: online || replaying || phase !== "move" || canMove,
      onClick: onPass,
      title: "Use this when the roll cannot move a token",
      icon: <Icon name="check" size={14} />,
    },
    {
      id: "new",
      label: "New game",
      disabled: online,
      onClick: onNewGame,
      icon: <Icon name="refresh" size={14} />,
    },
    {
      id: "replay",
      label: "Replay",
      disabled: online || !hasReplay || replaying,
      onClick: onReplay,
      icon: <Icon name="skip-back" size={14} />,
    },
  ];

  return (
    <MatchActionsPanel
      badge={inProgress ? (
        <span className="live-badge">
          {online ? (spectating ? "Watching" : "Live") : "Playing"}
        </span>
      ) : (
        <span className="live-badge live-badge--done">Finished</span>
      )}
      actions={actions}
      footer={<p className="toolbar-note">{hint}</p>}
    />
  );
}
