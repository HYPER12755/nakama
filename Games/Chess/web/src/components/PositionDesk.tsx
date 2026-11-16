import { useEffect, useMemo, useState } from "react";
import { copyText } from "@moongames/game-ui";
import {
  deskPgn,
  openGame,
  openPosition,
  readDeskInput,
  readDeskTags,
  type DeskPosition,
} from "../lib/desk";
import { ChessBoard } from "./ChessBoard";
import { Icon } from "./Icon";
import { MoveList } from "./MoveList";
import { PositionEditor } from "./PositionEditor";

export interface PositionDeskProps {
  /** The game that is already open at the desk, if there is one. */
  initial?: DeskPosition | null;
  /** The pieces of the board, as the player has chosen them. */
  pieceSet?: string;
  /** The colouring of the board. */
  theme?: Parameters<typeof ChessBoard>[0]["theme"];
  /** The coordinates, as the player has chosen them. */
  coordinates?: Parameters<typeof ChessBoard>[0]["coordinates"];
  /** Called when the game at the desk is added to the player's games. */
  onImport?: (input: {
    steps: string[];
    result?: string;
    color?: "w" | "b";
    opponent?: string;
  }) => Promise<{ ok: boolean; message: string | null }>;
  /** Called when the player wants to play from the position on the board. */
  onPlayFrom: (fen: string) => void;
  /** Called when the desk is closed. */
  onClose: () => void;
}

/**
 * The desk: a place to open a game or a position.
 *
 * A player brings a game in the way it is written down, or a position, and
 * walks through it on the board. From a position the player can start a
 * game of their own.
 */
export function PositionDesk({
  initial = null,
  pieceSet = "moongames",
  theme,
  coordinates,
  onImport,
  onPlayFrom,
  onClose,
}: PositionDeskProps) {
  const [text, setText] = useState("");
  const [position, setPosition] = useState<DeskPosition | null>(initial);
  const [ply, setPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  /** The side the player was in the game that was brought in. */
  const [importColor, setImportColor] = useState<"w" | "b">("w");
  /** The names the game carries in its tags. */
  const [importTags, setImportTags] = useState({
    result: "*",
    white: "",
    black: "",
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key === "ArrowLeft") {
        setPly((current) => Math.max(0, current - 1));
        return;
      }
      if (event.key === "ArrowRight") {
        setPly((current) =>
          Math.min((position?.frames.length ?? 1) - 1, current + 1),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, position]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const frames = position?.frames ?? [];
  const lastPly = Math.max(0, frames.length - 1);
  const frame = frames[Math.min(ply, lastPly)];
  const steps = useMemo(() => position?.steps ?? [], [position]);
  const importResult = importTags.result;
  const importOpponent =
    importColor === "w" ? importTags.black : importTags.white;

  const open = () => {
    const input = readDeskInput(text);
    if (input.kind === "none") {
      setPosition({
        frames: [],
        steps: [],
        fen: "",
        error:
          "That is neither a game nor a position. A game is written in moves, and a position has six fields.",
      });
      setPly(0);
      return;
    }
    const loaded =
      input.kind === "fen" ? openPosition(input.fen) : openGame(input.pgn);
    setPosition(loaded);
    setPly(0);
    setImportTags(readDeskTags(input.kind === "pgn" ? input.pgn : ""));
  };

  const copyFen = async () => {
    const fen = frame?.state.fen ?? "";
    if (fen.length === 0) {
      return;
    }
    const copied = await copyText(fen);
    setNotice(copied ? "Position copied" : "Could not copy the position");
  };

  const copyMoves = async () => {
    const pgn = deskPgn(steps);
    if (pgn.length === 0) {
      return;
    }
    const copied = await copyText(pgn);
    setNotice(copied ? "Game copied" : "Could not copy the game");
  };

  /** Put a position that was built by hand on the desk. */
  const useBuiltPosition = (fen: string) => {
    const loaded = openPosition(fen);
    setPosition(loaded);
    setPly(0);
    setEditing(false);
  };

  /**
   * Add the game at the desk to the player's own games.
   *
   * The server plays the moves out again with its own rules, so a game
   * that cannot be played is refused there and not here.
   */
  const importGame = async () => {
    if (onImport === undefined || steps.length === 0) {
      return;
    }
    const result = await onImport({
      steps,
      result: importResult,
      color: importColor,
      opponent: importOpponent,
    });
    setNotice(
      result.ok ? "The game is in your games now." : result.message,
    );
  };

  return (
    <div className="replay-overlay" role="presentation" onClick={onClose}>
      <div
        className="replay-dialog desk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="The desk"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replay-heading">
          <div>
            <p className="replay-kicker">The desk</p>
            <h2>Open a game or a position</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the desk"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="desk-body">
          <div className="desk-board">
            {frame === undefined ? (
              <p className="desk-empty">
                Bring a game or a position, and it is shown here.
              </p>
            ) : (
              <ChessBoard
                board={frame.state.board}
                selected={null}
                legalTargets={[]}
                lastMove={frame.state.lastMove ?? null}
                checkSquare={null}
                flipped={flipped}
                pieceSet={pieceSet}
                theme={theme}
                coordinates={coordinates}
                onSquareClick={() => undefined}
              />
            )}

            {frames.length > 1 && (
              <div className="replay-controls">
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setPly(0)}
                  aria-label="The first move"
                  title="The first move"
                >
                  <Icon name="skip-back" size={15} />
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setPly((current) => Math.max(0, current - 1))}
                  aria-label="The move before"
                  title="The move before"
                >
                  <Icon name="chevron-left" size={15} />
                </button>
                <span className="replay-count">
                  {ply} / {lastPly}
                </span>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() =>
                    setPly((current) => Math.min(lastPly, current + 1))
                  }
                  aria-label="The next move"
                  title="The next move"
                >
                  <Icon name="chevron-right" size={15} />
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setPly(lastPly)}
                  aria-label="The last move"
                  title="The last move"
                >
                  <Icon name="skip-forward" size={15} />
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setFlipped((current) => !current)}
                  aria-label="Turn the board"
                  title="Turn the board"
                >
                  Turn
                </button>
              </div>
            )}
          </div>

          <div className="desk-side">
            <label className="desk-label" htmlFor="desk-input">
              A game in moves, or a position in six fields
            </label>
            <textarea
              id="desk-input"
              className="desk-input"
              value={text}
              spellCheck={false}
              placeholder={
                "1. e4 e5 2. Nf3 Nc6 3. Bb5 a6\n\nor\n\nrnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
              }
              onChange={(event) => setText(event.target.value)}
            />

            <div className="desk-actions">
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={open}
              >
                Open it
              </button>
              <button
                type="button"
                className="action-button"
                onClick={copyFen}
                disabled={frame === undefined}
              >
                Copy the position
              </button>
              <button
                type="button"
                className="action-button"
                onClick={copyMoves}
                disabled={steps.length === 0}
              >
                Copy the game
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => void importGame()}
                disabled={steps.length === 0 || onImport === undefined}
              >
                Add to my games
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => setEditing(true)}
              >
                Edit the position
              </button>
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => {
                  const fen = frame?.state.fen;
                  if (fen !== undefined && fen.length > 0) {
                    onPlayFrom(fen);
                  }
                }}
                disabled={frame === undefined}
              >
                Play from here
              </button>
            </div>

            {position?.error != null && (
              <p className="replay-error" role="alert">
                {position.error}
              </p>
            )}

            {steps.length > 0 && (
              <>
                <div className="editor-turn">
                  <span className="editor-label">You were</span>
                  {(["w", "b"] as const).map((side) => (
                    <button
                      key={side}
                      type="button"
                      className={`editor-turn__button${
                        importColor === side ? " is-chosen" : ""
                      }`}
                      onClick={() => setImportColor(side)}
                    >
                      <span
                        className={`editor-dot editor-dot--${side}`}
                        aria-hidden="true"
                      />
                      {side === "w" ? "White" : "Black"}
                    </button>
                  ))}
                </div>
                <div className="desk-moves">
                  <MoveList history={frames[lastPly]?.state.history ?? []} />
                </div>
              </>
            )}

            {notice !== null && <p className="desk-notice">{notice}</p>}
          </div>
        </div>

        {editing && (
          <PositionEditor
            fen={frame?.state.fen}
            pieceSet={pieceSet}
            theme={theme}
            coordinates={coordinates}
            onUse={useBuiltPosition}
            onClose={() => setEditing(false)}
          />
        )}
      </div>
    </div>
  );
}
