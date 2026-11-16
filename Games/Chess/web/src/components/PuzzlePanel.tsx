import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChessEngine, type Square } from "@moongames/chess-core";
import { minePuzzles } from "../lib/engine/puzzleMining";
import type { EngineMode } from "../lib/engine/externalEngine";
import type { Puzzle, PuzzleAnswer, PuzzleNext } from "../lib/puzzles";
import { ChessBoard } from "./ChessBoard";
import { Icon } from "./Icon";

export interface PuzzlePanelProps {
  /** Ask the server for a puzzle, and for the game to make more of them. */
  onNext: () => Promise<PuzzleNext>;
  /** Give the puzzles the engine found to the server. */
  onSave: (input: {
    gameId: string;
    initialFen: string;
    steps: string[];
    puzzles: Array<{
      fen: string;
      solution: string;
      loss: number;
      cp: number;
      ply: number;
    }>;
  }) => Promise<{ ok: boolean; kept: number; message: string | null }>;
  /** Give the move the player made to the server. */
  onAnswer: (id: string, move: string) => Promise<PuzzleAnswer>;
  /** The kind of game, which decides whether the engine may be asked. */
  mode: EngineMode;
  /** The token of the session, so the server knows who is asking. */
  token?: string;
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
 * The puzzles.
 *
 * This is lichess's puzzle board: a position is given and the player has
 * to find the move. The positions come from the games that were played
 * here, and the engine finds the mistakes in them. The puzzles solved in a
 * row are kept, the way lichess keeps them.
 */
export function PuzzlePanel({
  onNext,
  onSave,
  onAnswer,
  mode,
  token,
  theme,
  pieceSet,
  coordinates,
  onClose,
}: PuzzlePanelProps) {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [solved, setSolved] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [selected, setSelected] = useState<Square | null>(null);
  const [legalTargets, setLegalTargets] = useState<Square[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mining, setMining] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [busy, setBusy] = useState(false);

  const engineRef = useRef<ChessEngine | null>(null);
  const startedRef = useRef(false);

  const loadPuzzle = useCallback((next: Puzzle) => {
    const engine = new ChessEngine();
    try {
      engine.load(next.fen);
    } catch {
      engine.reset();
    }
    engineRef.current = engine;
    setPuzzle(next);
    setSelected(null);
    setLegalTargets([]);
    setMessage(null);
    setNotice(null);
  }, []);

  /** The engine looks at a game, and the mistakes in it become puzzles. */
  const mine = useCallback(
    async (source: NonNullable<PuzzleNext["game"]>) => {
      setMining("The engine is looking at the game…");
      setProgress({ done: 0, total: source.steps.length });
      const mined = await minePuzzles({
        initialFen: source.initialFen,
        positions: source.positions,
        mode,
        token,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setMining(null);

      if (mined.error !== null) {
        setMessage(mined.error);
        return;
      }
      if (mined.puzzles.length === 0) {
        setMessage("The engine did not find a mistake worth a puzzle in that game.");
        return;
      }

      const kept = await onSave({
        gameId: source.gameId,
        initialFen: source.initialFen,
        steps: source.steps,
        puzzles: mined.puzzles,
      });
      if (!kept.ok) {
        setMessage(kept.message ?? "The puzzles could not be kept.");
        return;
      }

      const after = await onNext();
      setStreak(after.streak);
      setBest(after.best);
      setSolved(after.solved);
      setRemaining(after.remaining);
      if (after.puzzle !== null) {
        loadPuzzle(after.puzzle);
      } else {
        setMessage("There is nothing to solve just now.");
      }
    },
    [loadPuzzle, mode, onNext, onSave, token],
  );

  const ask = useCallback(async () => {
    setBusy(true);
    const next = await onNext();
    setStreak(next.streak);
    setBest(next.best);
    setSolved(next.solved);
    setRemaining(next.remaining);
    setBusy(false);

    if (next.puzzle !== null) {
      loadPuzzle(next.puzzle);
      return;
    }
    if (next.game !== null) {
      void mine(next.game);
      return;
    }
    setMessage("There is nothing to solve just now.");
  }, [loadPuzzle, mine, onNext]);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    void ask();
  }, [ask]);

  const state = useMemo(() => engineRef.current?.getState() ?? null, [puzzle]);

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

  /** The move the player made, and what the server says about it. */
  const answer = async (move: string) => {
    const current = puzzle;
    if (current === null) {
      return;
    }
    setSelected(null);
    setLegalTargets([]);
    const result = await onAnswer(current.id, move);
    setStreak(result.streak);
    setBest(result.best);

    if (result.solved) {
      setNotice("That is the move. The streak goes on.");
      setSolved((count) => count + 1);
      setRemaining((count) => Math.max(0, count - 1));
      return;
    }
    setNotice("Not that one. Try again.");
    // The board is put back the way it was, so the move can be tried again.
    const engine = new ChessEngine();
    engine.load(current.fen);
    engineRef.current = engine;
  };

  return (
    <section className="panel puzzle-panel">
      <div className="panel-heading">
        <h2>Puzzles</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Close the puzzles"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="puzzle-score">
        <span className="puzzle-score__streak">
          <strong>{streak}</strong> in a row
        </span>
        <span className="puzzle-score__best">best {best}</span>
        <span className="puzzle-score__solved">{solved} solved</span>
      </div>

      {state !== null && (
        <div className="puzzle-board">
          <ChessBoard
            board={state.board}
            selected={selected}
            legalTargets={legalTargets}
            lastMove={state.lastMove ?? null}
            checkSquare={null}
            flipped={false}
            pieceSet={pieceSet}
            theme={theme}
            coordinates={coordinates}
            onSquareClick={pick}
          />
        </div>
      )}

      {mining !== null && (
        <p className="puzzle-progress">
          {mining} {progress.total > 0 ? `${progress.done} of ${progress.total}` : ""}
        </p>
      )}

      {message !== null && (
        <p className="replay-error" role="alert">
          {message}
        </p>
      )}

      {notice !== null && (
        <p className="puzzle-notice" role="status">
          {notice}
        </p>
      )}

      <div className="puzzle-actions">
        <button
          type="button"
          className="action-button action-button--primary"
          onClick={() => void ask()}
          disabled={busy || mining !== null}
        >
          {puzzle === null ? "Look for a puzzle" : "Another puzzle"}
        </button>
        {puzzle !== null && notice !== null && (
          <span className="puzzle-answer">
            {notice.startsWith("That is the move")
              ? `the answer was ${puzzle.solutionSan}`
              : ""}
          </span>
        )}
      </div>
    </section>
  );
}
