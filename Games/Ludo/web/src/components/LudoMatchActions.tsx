import { copyText, MatchActionsPanel } from "@moongames/game-ui";
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

/** Ludo's table actions, built on the same shared panel Chess uses. */
export function LudoMatchActions({
  mode, spectating, phase, awaiting, canMove, canUndo, hasReplay, replaying,
  roomCode, onRoll, onUndo, onPass, onNewGame, onReplay, onLeave, onResign,
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

  const actions = online ? [
    {
      id: "roll",
      label: awaiting ? "Roll dice" : phase === "move" ? "Choose a token" : "Waiting…",
      accent: true,
      disabled: replaying || !awaiting,
      onClick: onRoll,
      icon: <Icon name="sparkles" size={14} />,
    },
    {
      id: "invite",
      label: "Invite friend",
      disabled: !inProgress || spectating,
      onClick: () => window.dispatchEvent(new CustomEvent("ludo:open-invite")),
      icon: <Icon name="users" size={14} />,
    },
    {
      id: "copy",
      label: "Copy room code",
      disabled: !roomCode,
      onClick: () => { if (roomCode) void copyText(roomCode); },
      icon: <Icon name="copy" size={14} />,
    },
  ] : [
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
      disabled: replaying || !canUndo,
      onClick: onUndo,
      icon: <Icon name="skip-back" size={14} />,
    },
    {
      id: "pass",
      label: "Pass turn",
      disabled: replaying || phase !== "move" || canMove,
      onClick: onPass,
      title: "Use this when the roll cannot move a token",
      icon: <Icon name="check" size={14} />,
    },
    {
      id: "new",
      label: "New game",
      onClick: onNewGame,
      icon: <Icon name="refresh" size={14} />,
    },
    {
      id: "replay",
      label: "Replay",
      disabled: !hasReplay || replaying,
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
      footer={
        <>
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
        </>
      }
    />
  );
}
