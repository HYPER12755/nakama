import { useEffect, useRef, useState } from "react";
import {
  analyseGame,
  type GameReport,
  type ReportMove,
} from "../lib/engine/report";
import type { EngineMode } from "../lib/engine/externalEngine";
import { Icon } from "./Icon";

export interface GameReportProps {
  /** The moves of the game, in the engine's way. */
  uciMoves: string[];
  /** The moves of the game, written the way a player writes them. */
  sanMoves: string[];
  /** The position the game started from. */
  initialFen: string;
  /** Whose side the report is about. */
  color: "w" | "b";
  /** The kind of game, which decides whether the engine may be asked. */
  mode: EngineMode;
  /** The token of the session, so the server knows who is asking. */
  token?: string;
  /** Called when the report is closed. */
  onClose: () => void;
}

function emptyReport(): GameReport {
  return {
    moves: [],
    worst: null,
    done: false,
    analysed: 0,
    error: null,
  };
}

/**
 * The report of a finished game.
 *
 * The engine looks at every position, and the moves where the player gave
 * the most away are marked, the way lichess marks them.
 */
export function GameReportDialog({
  uciMoves,
  sanMoves,
  initialFen,
  color,
  mode,
  token,
  onClose,
}: GameReportProps) {
  const [report, setReport] = useState<GameReport>(emptyReport);
  const [hovered, setHovered] = useState<ReportMove | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void analyseGame({
      uciMoves,
      sanMoves,
      initialFen,
      color,
      mode,
      token,
      onProgress: setReport,
    }).then(setReport);
  }, [uciMoves, sanMoves, initialFen, color, mode, token]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const played = report.moves.length;

  return (
    <div className="replay-overlay" role="presentation" onClick={onClose}>
      <div
        className="replay-dialog report-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="The report of the game"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replay-heading">
          <div>
            <p className="replay-kicker">The report</p>
            <h2>Where the game was won and lost</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the report"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {report.error !== null ? (
          <p className="replay-error" role="alert">
            {report.error}
          </p>
        ) : !report.done ? (
          <p className="report-progress">
            The engine is looking at the game… {report.analysed} of{" "}
            {uciMoves.length}
          </p>
        ) : (
          <p className="report-summary">
            {report.worst !== null && report.worst.loss > 0.1 ? (
              <>
                The biggest mistake was{" "}
                <strong>{report.worst.san}</strong>, which gave away{" "}
                {Math.round(report.worst.loss * 100)} percent.
              </>
            ) : (
              "A clean game. The engine did not find a mistake worth marking."
            )}
          </p>
        )}

        <ol className="report-moves">
          {report.moves.map((move, index) => (
            <li
              key={`${move.uci}-${index}`}
              className={`report-move${
                move.glyph !== null ? " report-move--marked" : ""
              }`}
              onMouseEnter={() => setHovered(move)}
              onMouseLeave={() => setHovered(null)}
            >
              <span className="report-move__number">
                {Math.floor(index / 2) + 1}
                {index % 2 === 0 ? "." : ""}
              </span>
              <span className="report-move__san">{move.san}</span>
              {move.glyph !== null && (
                <span className="report-move__glyph">{move.glyph.trim()}</span>
              )}
              {move.before !== null && (
                <span className="report-move__chance">
                  {Math.round(move.before * 100)}%
                </span>
              )}
            </li>
          ))}
        </ol>

        {hovered !== null &&
          hovered.after !== null &&
          hovered.before !== null && (
            <p className="report-detail">
              {hovered.san} left {Math.round(hovered.before * 100)} percent and{" "}
              {Math.round(hovered.after * 100)} percent.
            </p>
          )}
      </div>
    </div>
  );
}
