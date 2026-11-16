import { evalWinningChances, winningPercent } from "../lib/engine/winningChances";

export interface EngineEvalBarProps {
  /** The number of hundredths of a pawn, when the game is not a mate. */
  cp?: number;
  /** The number of moves to the mate, when the game is a mate. */
  mate?: number;
  /** Whose side the bar is about. */
  color: "w" | "b";
  /** Whether the bar is turned about. */
  reversed?: boolean;
  /** Whether there is anything to show yet. */
  empty?: boolean;
}

/**
 * The bar that says who is better.
 *
 * The bar is lichess's: the number the engine gives is turned into the
 * chances of a win, and the bar is filled to that share.
 */
export function EngineEvalBar({
  cp,
  mate,
  color,
  reversed = false,
  empty = false,
}: EngineEvalBarProps) {
  const chances = evalWinningChances({ cp, mate });
  const percent = winningPercent(chances);
  const shown = color === "w" ? percent : 1 - percent;

  return (
    <div
      className={`eval-gauge${empty ? " empty" : ""}${
        reversed ? " reverse" : ""
      }`}
      style={
        { "--eval-percent": `${Math.round(shown * 100)}%` } as React.CSSProperties
      }
      role="img"
      aria-label={
        empty
          ? "The engine has not said yet"
          : mate !== undefined
            ? `Mate in ${Math.abs(mate)}`
            : `${(shown * 100).toFixed(0)} percent for ${color === "w" ? "white" : "black"}`
      }
    >
      <span className="eval-gauge__zero" />
    </div>
  );
}
