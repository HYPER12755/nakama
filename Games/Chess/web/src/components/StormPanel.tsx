import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChessEngine, type Square } from "@moongames/chess-core";
import type { Puzzle, StormState } from "../lib/puzzles";
import { ChessBoard } from "./ChessBoard";
import { Icon } from "./Icon";

export interface StormPanelProps {
  /** Start a run of puzzles with a clock on them. */
  onStart: () => Promise<{ seconds: number; total: number } | null>;
  /** The next puzzle of the run. */
  onNext: () => Promise<StormState>;
  /** Give the move the player made to the server. */
  onAnswer: (
    id: string,
    move: string,
  ) => Promise<{ solved: boolean; score: number; solutionSan: string }>;
  /** The colouring of the board. */
  theme?: Parameters<typeof ChessBoard>[0]["theme"];
  /** The pieces of the board, as the player has chosen them. */
  pieceSet?: string;
  /** The coordinates, as the player has chosen them. */
  coordinates?: Parameters<typeof ChessBoard>[0]["coordinates"];
  /** Called when the panel is closed. */
  onClose: () => void;
}

/**
 * The storm: the puzzles with a clock on them.
 *
 * This is lichess's storm: as many puzzles as can be solved in three
 * minutes. The clock is the only thing that is different from the
 * practice board.
 */
export function StormPanel({
  onStart,
  onNext,
  onAnswer,
  theme,
  pieceSet,
  coordinates,
  onClose,
}: StormPanelProps) {
  const [state, setState] = useState<StormState | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);

  const engineRef = useRef<ChessEngine | null>(null);
  const startedRef = useRef(false);

  const loadPuzzle = useCallback((puzzle: Puzzle) => {
    const engine = new ChessEngine();
    try {
      engine.load(puzzle.fen);
    } catch {
      engine.reset();
    }
    engineRef.current = engine;
    setSelected(null);
    setLegalTargets([]);
    setNotice(null);
  }, []);

  /** The next puzzle of the run. */
  const next = useCallback(async () => {
    const answer = await onNext();
    setState(answer);
    setScore(answer.score);
    if (answer.puzzle !== null) {
      loadPuzzle(answer.puzzle);
    }
  }, [loadPuzzle, onNext]);

  const start = useCallback(async () => {
    const started = await onStart();
    if (started === null) {
      setNotice("There are no puzzles to solve yet.");
      return;
    }
    setSeconds(started.seconds);
    setRunning(true);
    setScore(0);
    await next();
  }, [next, onStart]);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void start();
  }, [start]);

  // The clock.
  useEffect(() => {
    if (!running) {
      return;
    }
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  const puzzle = state?.puzzle ?? null;
  const board = useMemo(
    () => engineRef.current?.getState() ?? null,
    [puzzle],
  );
  const flipped = useMemo(() => {
    if (puzzle === null) {
      return false;
    }
    return puzzle.fen.split(" ")[1] === "b";
  }, [puzzle]);

  /** The player picks a piece. */
  const pick = (square: Square) => {
    const engine = engineRef.current;
    if (engine === null || puzzle === null || notice !== null) {
      return;
    }
    if (selected !== null && legalTargets.includes(square)) {
      const move = engine.move({ from: selected, to: square });
      void answer(move.uci);
      return;
    }
    const targets = engine.legalMoves(square).map((move) => move.to);
    setSelected(targets.length > 0 ? square : null);
    setLegalTargets(targets);
  };

  /** The move the player made. */
  const answer = async (move: string) => {
    const current = puzzle;
    if (current === null) {
      return;
    }
    setSelected(null);
    setLegalTargets([]);
    const result = await onAnswer(current.id, move);
    setScore(result.score);
    if (result.solved) {
      setNotice("That is the move.");
    } else {
      setNotice(`Not that one. The answer was ${result.solutionSan}.`);
      const engine = new ChessEngine();
      engine.load(current.fen);
      engineRef.current = engine;
    }
    await next();
  };

  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;

  return (
    <section className="panel storm-panel">
      <div className="panel-heading">
        <h2>The storm</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close the storm"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="storm-score">
        <span className={`storm-clock${seconds <= 30 ? " storm-clock--low" : ""}`}>
          {minutes}:{rest < 10 ? `0${rest}` : rest}
        </span>
        <span className="storm-score__count">
          <strong>{score}</strong> solved
        </span>
      </div>

      {board !== null && (
        <div className="storm-board">
          <ChessBoard
            board={board.board}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={board.lastMove ?? null}
            checkSquare={null}
            flipped={flipped}
            pieceSet={pieceSet}
            theme={theme}
            coordinates={coordinates}
            onSquareClick={pick}
          />
        </div>
      )}

      {notice !== null && (
        <p className="puzzle-notice" role="status">
          {notice}
        </p>
      )}

      {!running && (
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={() => void start()}
        >
          {score > 0 ? "Again" : "Start"}
        </button>
      )}
    </section>
  );
}
