import type { BoardView } from "../lib/view";

const COLORS = ["red", "yellow", "green", "blue"];

export interface UnoOpponentBarProps {
  view: BoardView;
}

export function UnoOpponentBar({ view }: UnoOpponentBarProps) {
  const max = Math.max(1, ...view.players.map((player) => player.count));
  return (
    <div className="ludo-race-bar" aria-label="Table players">
      {view.players.map((player, index) => (
        <div
          className={`ludo-race-bar__row${player.seat === view.turn ? " ludo-race-bar__row--active" : ""}`}
          key={player.userId || index}
        >
          <span
            className={`ludo-race-bar__disc uno-disc--${COLORS[index] ?? "red"}`}
          />
          <span className="ludo-race-bar__name">
            {player.username.trim() || `PLAYER ${index + 1}`}
          </span>
          <span className="ludo-race-bar__track">
            <span
              className="ludo-race-bar__fill"
              style={{ width: `${(player.count / max) * 100}%` }}
            />
          </span>
          <span className="ludo-race-bar__count">
            {player.count}
            <small> cards</small>
          </span>
        </div>
      ))}
    </div>
  );
}
