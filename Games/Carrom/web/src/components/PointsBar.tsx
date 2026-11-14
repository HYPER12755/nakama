import { PLAYER_LABEL, type CarromPlayer } from "@moongames/carrom-core";

export interface PointsBarProps {
  players: CarromPlayer[];
  scores: Record<CarromPlayer, number>;
  active?: CarromPlayer | null;
  target?: number;
}

/**
 * The points bar. It sits above the table so the race to the last piece is
 * the first thing a player sees, on every screen size.
 */
export function PointsBar({
  players,
  scores,
  active = null,
  target = 9,
}: PointsBarProps) {
  return (
    <div className="points-bar">
      {players.map((player) => {
        const score = scores[player] ?? 0;
        return (
          <div
            className={`points-bar__row${
              active === player ? " points-bar__row--active" : ""
            }`}
            key={player}
          >
            <span className={`points-bar__disc points-bar__disc--${player}`} />
            <span className="points-bar__name">{PLAYER_LABEL[player]}</span>
            <span className="points-bar__track">
              <span
                className={`points-bar__fill points-bar__fill--${player}`}
                style={{ width: `${Math.min(100, (score / target) * 100)}%` }}
              />
            </span>
            <span className="points-bar__count">
              {score}
              <small>/{target}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
