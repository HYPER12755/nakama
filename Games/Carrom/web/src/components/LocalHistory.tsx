import {
  CARROM_VARIANTS,
  PLAYER_LABEL,
  type CarromPlayer,
} from "@moongames/carrom-core";
import type { LocalProgress } from "../lib/localProgress";
import { Icon } from "./Icon";

export interface LocalHistoryProps {
  progress: LocalProgress;
  seats: CarromPlayer[];
  onClear: () => void;
}

/** The record a table played on this device keeps for itself. */
export function LocalHistory({ progress, seats, onClear }: LocalHistoryProps) {
  const rated = seats.filter((seat) => progress.ratings[seat] !== undefined);
  return (
    <section className="panel table-settings local-history">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">On this device</p>
          <h2>Local table record</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onClear}
          aria-label="Clear the local record"
          title="Clear the local record"
        >
          <Icon name="refresh" size={15} />
        </button>
      </div>

      {rated.length > 0 ? (
        <div className="local-ratings">
          {rated.map((seat) => (
            <span key={seat} className="local-ratings__seat">
              <i className={`online-seat__disc online-seat__disc--${seat}`} />
              {PLAYER_LABEL[seat]}
              <strong>{Math.round(progress.ratings[seat]?.after ?? 1200)}</strong>
            </span>
          ))}
        </div>
      ) : (
        <p className="setting__note">Finish a local table to start its record.</p>
      )}

      {progress.history.length > 0 ? (
        <ol className="local-history__list">
          {progress.history.slice(0, 5).map((game) => (
            <li key={game.id}>
              <span className="local-history__result">
                {game.winner === null
                  ? "Draw"
                  : `${PLAYER_LABEL[game.winner]} won`}
              </span>
              <span className="local-history__detail">
                {game.seats.length} players · {CARROM_VARIANTS[game.variant]?.label ?? game.variant} · {game.shots} shots
              </span>
              <span className="local-history__change">
                {game.seats
                  .filter((seat) => game.ratings[seat] !== undefined)
                  .map((seat) => {
                    const change = game.ratings[seat];
                    const delta = (change?.after ?? 0) - (change?.before ?? 0);
                    return `${seat[0]?.toUpperCase()}${delta >= 0 ? "+" : ""}${delta}`;
                  })
                  .join(" ")}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
