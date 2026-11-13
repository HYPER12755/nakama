import {
  PLAYER_LABEL,
  type CarromPlayer,
  type CarromQueen,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

interface ScoreCardProps {
  player: CarromPlayer;
  score: number;
  active: boolean;
  queen: CarromQueen;
  ai: boolean;
  seat: number;
}

export function ScoreCard({
  player,
  score,
  active,
  queen,
  ai,
  seat,
}: ScoreCardProps) {
  return (
    <div
      className={`score-card score-card--${player}${active ? " score-card--active" : ""}`}
    >
      <div className="score-card__top">
        <span className={`score-card__swatch score-card__swatch--${player}`} />
        <div className="score-card__identity">
          <strong>{PLAYER_LABEL[player]}</strong>
          <span>{ai ? "Moon AI" : `Player ${seat}`}</span>
        </div>
        {active ? (
          <span className="score-card__turn">
            <span className="live-dot" />
            To shoot
          </span>
        ) : null}
        <span className="score-card__count">
          {score}
          <small>/ 9</small>
        </span>
      </div>
      <div className="score-card__pips" aria-label={`${score} of 9 pieces pocketed`}>
        {Array.from({ length: 9 }, (_, index) => (
          <span
            key={index}
            className={`score-pip score-pip--${player}${index < score ? " score-pip--filled" : ""}`}
          />
        ))}
      </div>
      {queen.owner === player ? (
        <span className="score-card__queen">
          <span className="queen-dot" />
          Queen covered
          <Icon name="check" size={12} strokeWidth={2.4} />
        </span>
      ) : null}
    </div>
  );
}
