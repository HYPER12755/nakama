import { useCallback, useEffect, useRef, useState } from "react";
import { ChessEngine } from "@moongames/chess-core";
import {
  addTrainerScore,
  emptyTrainerScores,
  newTrainerKey,
  TRAINER_DURATION,
  TRAINER_FILES,
  TRAINER_RANKS,
  TRAINER_TICK_DELAY,
  trainerFen,
  trainerScorePath,
  type TrainerColor,
  type TrainerMode,
  type TrainerScores,
  type TrainerTimeControl,
} from "../lib/coordinateTrainer";
import { ChessBoard } from "./ChessBoard";
import { Icon } from "./Icon";

export interface CoordinateTrainerProps {
  /** The colouring of the board. */
  theme?: Parameters<typeof ChessBoard>[0]["theme"];
  /** The pieces of the board, as the player has chosen them. */
  pieceSet?: string;
  /** Called when the trainer is closed. */
  onClose: () => void;
}

/**
 * The coordinate trainer.
 *
 * This is lichess's trainer: a coordinate is named and the square is
 * found, or a square is marked and the coordinate is written. The clock
 * runs for thirty seconds unless the time is turned off, and the score of
 * every round is kept.
 */
export function CoordinateTrainer({
  theme,
  pieceSet,
  onClose,
}: CoordinateTrainerProps) {
  const [mode, setMode] = useState<TrainerMode>("findSquare");
  const [timeControl, setTimeControl] = useState<TrainerTimeControl>(
    "thirtySeconds",
  );
  const [colorChoice, setColorChoice] = useState<TrainerColor>("random");
  const [showPieces, setShowPieces] = useState(true);
  const [showCoordinates, setShowCoordinates] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [selectedRanks, setSelectedRanks] = useState<Set<string>>(new Set());

  const [playing, setPlaying] = useState(false);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [currentKey, setCurrentKey] = useState("");
  const [nextKey, setNextKey] = useState("");
  const [score, setScore] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [timeLeft, setTimeLeft] = useState(TRAINER_DURATION);
  const [scores, setScores] = useState<TrainerScores>(emptyTrainerScores);
  const [written, setWritten] = useState("");

  const startedAtRef = useRef<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentRef = useRef("");
  const nextRef = useRef("");

  const advance = useCallback(() => {
    currentRef.current = nextRef.current;
    setCurrentKey(currentRef.current);
    nextRef.current = newTrainerKey(
      nextRef.current.length > 0 ? nextRef.current : currentRef.current,
      selectedFiles,
      selectedRanks,
    );
    setNextKey(nextRef.current);
  }, [selectedFiles, selectedRanks]);

  const stop = useCallback(() => {
    setPlaying(false);
    setWrong(false);
    setWritten("");
    setScores((current) => addTrainerScore(current, mode, orientation, score));
    setScore(0);
  }, [mode, orientation, score]);

  const start = useCallback(() => {
    if (playing) {
      return;
    }
    // The side of the board is chosen again, for it may be random.
    const chosen: "w" | "b" =
      colorChoice === "random"
        ? Math.round(Math.random()) === 0
          ? "w"
          : "b"
        : colorChoice;
    setOrientation(chosen);
    setPlaying(true);
    setScore(0);
    setTimeLeft(TRAINER_DURATION);
    currentRef.current = "";
    nextRef.current = "";
    setCurrentKey("");
    setNextKey("");

    // The coordinates move twice, so the first one is a new one entirely.
    window.setTimeout(() => {
      advance();
      advance();
      startedAtRef.current = Date.now();
    }, 400);
  }, [advance, colorChoice, playing]);

  // The clock of the round.
  useEffect(() => {
    if (!playing || timeControl === "untimed") {
      return;
    }
    const tick = () => {
      const spent = Math.min(TRAINER_DURATION, Date.now() - startedAtRef.current);
      const left = TRAINER_DURATION - spent;
      setTimeLeft(left);
      if (left > 0) {
        window.setTimeout(tick, TRAINER_TICK_DELAY);
        return;
      }
      stop();
    };
    const timer = window.setTimeout(tick, TRAINER_TICK_DELAY);
    return () => window.clearTimeout(timer);
  }, [playing, stop, timeControl]);

  // The mode that names the square takes the keyboard.
  useEffect(() => {
    if (playing && mode === "nameSquare") {
      inputRef.current?.focus();
    }
  }, [mode, playing]);

  const correct = useCallback(() => {
    setScore((current) => current + 1);
    setWrong(false);
    advance();
  }, [advance]);

  const handleSquare = (square: string) => {
    if (!playing || mode !== "findSquare") {
      return;
    }
    if (square === currentKey) {
      correct();
      return;
    }
    setWrong(true);
    window.setTimeout(() => setWrong(false), 500);
  };

  const handleWritten = (text: string) => {
    setWritten(text);
    if (!playing || mode !== "nameSquare") {
      return;
    }
    const written = text.trim().toLowerCase();
    if (written.length === 0) {
      return;
    }
    if (written === currentKey) {
      setWritten("");
      correct();
      return;
    }
    if (written.length >= 2) {
      setWrong(true);
      window.setTimeout(() => setWrong(false), 500);
    }
  };

  const board = useState(() => {
    const engine = new ChessEngine();
    return engine.getState().board;
  })[0];

  const emptyBoard = new ChessEngine(trainerFen(false)).getState().board;
  const shownBoard = showPieces ? board : emptyBoard;

  const chartPath = trainerScorePath(scores[mode][orientation], 120, 30);

  return (
    <div className="replay-overlay" role="presentation" onClick={onClose}>
      <div
        className="replay-dialog desk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="The coordinate trainer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replay-heading">
          <div>
            <p className="replay-kicker">Training</p>
            <h2>Know the board by sight</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the trainer"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="trainer-body">
          <div className="trainer-board">
            <div className="trainer-board__wrap">
              <ChessBoard
                board={shownBoard}
                selected={null}
                legalTargets={[]}
                lastMove={null}
                checkSquare={null}
                flipped={orientation === "b"}
                theme={theme}
                pieceSet={pieceSet}
                coordinates={showCoordinates ? 3 : 0}
                onSquareClick={handleSquare}
              />
              {mode === "nameSquare" && currentKey.length > 0 && (
                <span
                  className={`trainer-target${
                    wrong ? " is-wrong" : ""
                  }`}
                  style={{
                    left: `${(currentKey.charCodeAt(0) - 97) * 12.5}%`,
                    bottom: `${(Number(currentKey[1]) - 1) * 12.5}%`,
                  }}
                />
              )}
            </div>

            <div className="trainer-status">
              {mode === "findSquare" ? (
                <span className="trainer-status__target">
                  {currentKey.length > 0 ? currentKey : "—"}
                </span>
              ) : (
                <input
                  ref={inputRef}
                  className="trainer-input"
                  value={written}
                  maxLength={3}
                  placeholder="the square"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(event) => handleWritten(event.target.value)}
                />
              )}
              <span className="trainer-status__score">{score}</span>
              {timeControl === "thirtySeconds" && (
                <span
                  className={`trainer-status__time${
                    timeLeft < 5000 ? " is-low" : ""
                  }`}
                >
                  {(timeLeft / 1000).toFixed(1)}
                </span>
              )}
            </div>

            <div className="trainer-actions">
              {playing ? (
                <button
                  type="button"
                  className="action-button"
                  onClick={stop}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="action-button action-button--primary"
                  onClick={start}
                >
                  Start
                </button>
              )}
            </div>
          </div>

          <div className="trainer-side">
            <div className="editor-turn">
              <span className="editor-label">The game</span>
              {(
                [
                  ["findSquare", "Find the square"],
                  ["nameSquare", "Name the square"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`editor-turn__button${
                    mode === value ? " is-chosen" : ""
                  }`}
                  onClick={() => setMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="editor-turn">
              <span className="editor-label">The board</span>
              {(
                [
                  ["random", "Random"],
                  ["w", "White"],
                  ["b", "Black"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`editor-turn__button${
                    colorChoice === value ? " is-chosen" : ""
                  }`}
                  onClick={() => setColorChoice(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="editor-turn">
              <span className="editor-label">The time</span>
              {(
                [
                  ["thirtySeconds", "0:30"],
                  ["untimed", "No time"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`editor-turn__button${
                    timeControl === value ? " is-chosen" : ""
                  }`}
                  onClick={() => setTimeControl(value)}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={showPieces}
                onChange={(event) => setShowPieces(event.target.checked)}
              />
              <span>Show the pieces</span>
            </label>
            <label className="pref-toggle">
              <input
                type="checkbox"
                checked={showCoordinates}
                onChange={(event) =>
                  setShowCoordinates(event.target.checked)
                }
              />
              <span>Show the coordinates</span>
            </label>

            <div className="trainer-selection">
              <span className="editor-label">Only these squares</span>
              <div className="trainer-selection__row">
                {TRAINER_FILES.map((file) => (
                  <button
                    key={file}
                    type="button"
                    className={`trainer-selection__button${
                      selectedFiles.has(file) ? " is-chosen" : ""
                    }`}
                    onClick={() =>
                      setSelectedFiles((current) => {
                        const next = new Set(current);
                        if (next.has(file)) {
                          next.delete(file);
                        } else {
                          next.add(file);
                        }
                        return next;
                      })
                    }
                  >
                    {file}
                  </button>
                ))}
              </div>
              <div className="trainer-selection__row">
                {TRAINER_RANKS.map((rank) => (
                  <button
                    key={rank}
                    type="button"
                    className={`trainer-selection__button${
                      selectedRanks.has(rank) ? " is-chosen" : ""
                    }`}
                    onClick={() =>
                      setSelectedRanks((current) => {
                        const next = new Set(current);
                        if (next.has(rank)) {
                          next.delete(rank);
                        } else {
                          next.add(rank);
                        }
                        return next;
                      })
                    }
                  >
                    {rank}
                  </button>
                ))}
              </div>
            </div>

            {chartPath.length > 0 && (
              <div className="trainer-chart">
                <span className="editor-label">The last rounds</span>
                <svg viewBox="0 0 120 30" width="100%" height="30">
                  <path
                    d={chartPath}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
