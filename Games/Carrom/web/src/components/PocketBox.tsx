import { PLAYER_LABEL, type CarromPlayer } from "@moongames/carrom-core";

export interface PocketBoxProps {
  /** The pocketed pieces per colour. */
  pocketed: Record<CarromPlayer, number>;
  /** The order the players are shown in. */
  players: CarromPlayer[];
  /** The colour that currently owns the queen. */
  queenOwner?: CarromPlayer | null;
  queenPocketed: boolean;
}

/**
 * The pocket box. Every pocketed piece sits in the box of its colour, so a
 * player can read the table at a glance while the game is running.
 */
export function PocketBox({
  pocketed,
  players,
  queenOwner,
  queenPocketed,
}: PocketBoxProps) {
  return (
    <div className="pocket-box">
      <div className="pocket-box__header">
        <span className="pocket-box__title">Pocket box</span>
        <span className="pocket-box__hint">
          {queenPocketed
            ? "Queen pocketed"
            : "Queen on the board"}
        </span>
      </div>
      <div className="pocket-box__rows">
        {players.map((player) => {
          const count = pocketed[player] ?? 0;
          return (
            <div className="pocket-box__row" key={player}>
              <span className={`pocket-box__disc pocket-box__disc--${player}`} />
              <span className="pocket-box__name">{PLAYER_LABEL[player]}</span>
              <span className="pocket-box__pieces" aria-hidden="true">
                {Array.from({ length: count }, (_, index) => (
                  <span
                    key={index}
                    className={`pocket-box__piece pocket-box__piece--${player}`}
                  />
                ))}
              </span>
              <span className="pocket-box__count">{count}</span>
              {queenOwner === player ? (
                <span className="pocket-box__queen" title="The queen is covered">
                  <span className="queen-dot" />
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
