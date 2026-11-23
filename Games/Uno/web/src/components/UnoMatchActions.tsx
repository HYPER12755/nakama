import { MatchActionsPanel, type MatchActionItem } from "@moongames/game-ui";
import { Icon } from "./Icon";

export interface UnoMatchActionsProps {
  mode: "local" | "ai" | "online";
  spectating: boolean;
  isMyTurn: boolean;
  canDraw: boolean;
  started: boolean;
  finished: boolean;
  onDraw: () => void;
  onNewGame: () => void;
  onLeave: () => void;
  onResign: () => void;
}

export function UnoMatchActions({
  mode, spectating, isMyTurn, started, finished, canDraw, onDraw, onNewGame, onLeave, onResign,
}: UnoMatchActionsProps) {
  const online = mode === "online";
  const hint = online
    ? spectating
      ? "You are watching this table. Actions return when you join a seat."
      : isMyTurn
        ? "Play a matching card, or draw from the pile."
        : "Waiting for the other players."
    : isMyTurn
      ? "Play a matching card, or draw from the pile."
      : "Waiting for the computer.";

  const actions: MatchActionItem[] = [
    {
      id: "draw",
      label: isMyTurn ? "Draw card" : "Waiting…",
      accent: true,
      disabled: !started || finished || !isMyTurn || !canDraw,
      onClick: onDraw,
      icon: <Icon name="sparkles" size={14} />,
    },
    {
      id: "new",
      label: "New game",
      disabled: online,
      onClick: onNewGame,
      icon: <Icon name="refresh" size={14} />,
    },
    {
      id: "leave",
      label: "Leave table",
      disabled: !online,
      onClick: onLeave,
      icon: <Icon name="close" size={14} />,
    },
    {
      id: "resign",
      label: "Resign",
      disabled: !online || !started || finished,
      onClick: onResign,
      icon: <Icon name="stop" size={14} />,
    },
  ];

  return (
    <MatchActionsPanel
      badge={
        <span className={`live-badge${started ? "" : " live-badge--done"}`}>
          {online ? (spectating ? "Watching" : "Live") : started ? "Playing" : "Ready"}
        </span>
      }
      actions={actions}
      footer={<p className="toolbar-note">{hint}</p>}
    />
  );
}
