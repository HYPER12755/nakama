import type { ReactNode } from "react";

export interface PlayerCardProps {
  name: string;
  subtitle?: string;
  /** The player colour, used for the avatar swatch. */
  accent: string;
  active: boolean;
  finished?: boolean;
  connected?: boolean;
  clockMs?: number | null;
  clockLabel?: string;
  badge?: ReactNode;
}

export function formatSharedClock(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * One seated player. Every title shows the same card: the colour, the name,
 * the connection, and the clock when the game has one.
 */
export function PlayerCard({
  name,
  subtitle,
  accent,
  active,
  finished,
  connected,
  clockMs,
  clockLabel,
  badge,
}: PlayerCardProps) {
  const resolvedSubtitle =
    subtitle ??
    (connected === false
      ? "Disconnected"
      : finished
        ? "Game over"
        : active
          ? "To shoot"
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
        className="player-avatar"
        style={{ "--player-accent": accent } as React.CSSProperties}
        aria-hidden="true"
      >
        <span className="player-avatar__disc" />
      </div>
      <div className="player-meta">
        <span className="player-name">{name}</span>
        <span className="player-subtitle">{resolvedSubtitle}</span>
      </div>
      {badge !== undefined ? <div className="player-badge">{badge}</div> : null}
      <div className="player-trailing">
        {clockMs !== undefined && clockMs !== null ? (
          <span
            className={`player-clock ${active ? "player-clock--active" : ""}`}
            aria-label={`${name} clock ${clockLabel ?? formatSharedClock(clockMs)}`}
          >
            {clockLabel ?? formatSharedClock(clockMs)}
          </span>
        ) : null}
        {active && <span className="turn-dot" aria-label="Active turn" />}
      </div>
    </div>
  );
}
