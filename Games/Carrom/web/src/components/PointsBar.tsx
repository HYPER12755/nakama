import {
  CARROM_BOARD,
  PLAYER_LABEL,
  type CarromPlayer,
  type CarromQueen,
  type CarromRuleSet,
} from "@moongames/carrom-core";

export interface PointsBarProps {
  players: CarromPlayer[];
  scores: Record<CarromPlayer, number>;
  queen: CarromQueen;
  rules: CarromRuleSet;
  active?: CarromPlayer | null;
}

/**
 * The points bar. It sits above the table so the race to the last piece is
 * the first thing a player sees, on every screen size. It is the only score
 * display on the table: the points are counted the way the carrom apps count
 * them, a man is worth one point and the queen is worth three.
 */
export function PointsBar({
  players,
  scores,
  queen,
  rules,
  active = null,
}: PointsBarProps) {
  const target = CARROM_BOARD.piecesPerPlayer;
  return (
    <div className="points-bar">
      {players.map((player) => {
        const men = scores[player] ?? 0;
        const holdsQueen =
          queen.status === "covered" && queen.owner === player;
        const points = men * rules.manPoints + (holdsQueen ? rules.queenPoints : 0);
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
                style={{ width: `${Math.min(100, (men / target) * 100)}%` }}
              />
            </span>
            <span className="points-bar__men">
              {men}
              <small>/{target}</small>
            </span>
            <span className="points-bar__points">
              {points}
              <small>pts</small>
            </span>
            {holdsQueen ? (
              <span
                className="points-bar__queen"
                title={
                  rules.coverQueen ? "Queen covered" : "Queen pocketed"
                }
              >
                +{rules.queenPoints}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
