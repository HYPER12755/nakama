export interface EnginePvProps {
  /** The moves of the line, written the way a player writes them. */
  san: string[];
  /** The number of hundredths of a pawn, when the game is not a mate. */
  cp?: number;
  /** The number of moves to the mate, when the game is a mate. */
  mate?: number;
  /** How deep the search has gone. */
  depth: number;
  /** How many positions the engine has looked at. */
  nodes: number;
  /** How long the engine has been thinking, in milliseconds. */
  millis: number;
  /** Called when a move of the line is touched. */
  onShow?: (index: number) => void;
  /** Called when a move of the line is played on the board. */
  onPlay?: (index: number) => void;
}

/**
 * The line the engine is thinking about.
 *
 * This is lichess's principal variation: the moves the engine likes, the
 * number it gives them, and how deep it has looked. A move of the line can
 * be touched to see where the line goes, and the first move of the line can
 * be played on the board.
 */
export function EnginePv({
  san,
  cp,
  mate,
  depth,
  nodes,
  millis,
  onShow,
  onPlay,
}: EnginePvProps) {
  const score =
    mate !== undefined
      ? `mate in ${Math.abs(mate)}`
      : cp !== undefined
        ? `${(cp / 100).toFixed(2)}`
        : "—";

  return (
    <div className="pv-box">
      <div className="pv">
        <strong className="pv__score">{score}</strong>
        <span className="pv__depth">d{depth}</span>
        <span className="pv__nodes">
          {Math.round(nodes / 1000)}k · {Math.round(millis / 1000)}s
        </span>
        {san.length > 0 && (
          <span className="pv__moves">
            {san.map((move, index) => (
              <button
                key={`${move}-${index}`}
                type="button"
                className="pv__move"
                onMouseEnter={() => onShow?.(index)}
                onFocus={() => onShow?.(index)}
                onClick={() => {
                  onShow?.(index);
                  onPlay?.(index);
                }}
                title={
                  index === 0
                    ? "Play this move on the board"
                    : "See where this line goes"
                }
              >
                {move}
              </button>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}
