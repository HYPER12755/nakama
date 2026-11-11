import type { Color } from "@moongames/chess-core";
import { formatClock } from "../lib/onlineProtocol";
import { glyphFor } from "../lib/pieces";

export interface PlayerCardProps {
  color: Color;
  active: boolean;
  finished: boolean;
  name?: string;
  subtitle?: string;
  clockMs?: number | null;
  connected?: boolean;
}

export function PlayerCard({
  color,
  active,
  finished,
  name,
  subtitle,
  clockMs,
  connected,
}: PlayerCardProps) {
  const label = name ?? (color === "w" ? "White" : "Black");
  const resolvedSubtitle =
    subtitle ??
    (connected === false
      ? "Disconnected"
      : finished
        ? "Game over"
        : active
          ? "To move"
          : "Waiting");

  return (
    <div
      className={[
        "player-card",
        active ? "player-card--active" : "",
        connected === false ? "player-card--offline" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div
        className={`player-avatar player-avatar--${color}`}
        aria-hidden="true"
      >
        {glyphFor("k")}
      </div>
      <div className="player-meta">
        <span className="player-name">{label}</span>
        <span className="player-subtitle">{resolvedSubtitle}</span>
      </div>
      <div className="player-trailing">
        {clockMs !== undefined && clockMs !== null && (
          <span
            className={`player-clock ${active ? "player-clock--active" : ""}`}
            aria-label={`${label} clock ${formatClock(clockMs)}`}
          >
            {formatClock(clockMs)}
          </span>
        )}
        {active && <span className="turn-dot" aria-label="Active turn" />}
      </div>
    </div>
  );
}
