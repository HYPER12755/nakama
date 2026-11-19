import { PLAYER_COLOR_HEX, type LudoState } from "@moongames/ludo-core";

export interface LudoRaceBarProps {
  players: LudoState["players"];
  names: string[];
  activeSeat: number;
  tokensPerPlayer: number;
}

/**
 * The race bar sits above the Ludo board like Carrom's points bar. It shows
 * who is at the table, whose turn it is, and how close each seat is to home.
 */
export function LudoRaceBar({
  players, names, activeSeat, tokensPerPlayer,
}: LudoRaceBarProps) {
  return (
    <div className="ludo-race-bar" aria-label="Race progress">
      {players.map((player) => {
        const finished = player.finished;
        const percent = Math.min(100, (finished / tokensPerPlayer) * 100);
        return (
          <div
            className={`ludo-race-bar__row${player.seat === activeSeat ? " ludo-race-bar__row--active" : ""}`}
            key={player.seat}
          >
            <span
              className="ludo-race-bar__disc"
              style={{ background: PLAYER_COLOR_HEX[player.color] }}
            />
            <span className="ludo-race-bar__name">
              {names[player.seat]?.trim() || `PLAYER ${player.seat + 1}`}
            </span>
            <span className="ludo-race-bar__track">
              <span
                className="ludo-race-bar__fill"
                style={{
                  width: `${percent}%`,
                  background: PLAYER_COLOR_HEX[player.color],
                }}
              />
            </span>
            <span className="ludo-race-bar__count">
              {finished}
              <small>/{tokensPerPlayer}</small>
            </span>
          </div>
        );
      })}
    </div>
  );
}
