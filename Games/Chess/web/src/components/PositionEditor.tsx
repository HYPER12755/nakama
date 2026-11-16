import { useEffect, useMemo, useState } from "react";
import { copyText } from "@moongames/game-ui";
import type { Color, PieceSymbol, Square } from "@moongames/chess-core";
import {
  EDITOR_PIECES,
  clearEditorState,
  editorPlace,
  editorToBoard,
  editorToFen,
  fenToEditorState,
  type EditorState,
} from "../lib/editor";
import { ChessBoard } from "./ChessBoard";
import { Icon } from "./Icon";
import { PieceArtwork, PieceImage } from "./Piece";

export interface PositionEditorProps {
  /** The position the editor opens with. */
  fen?: string;
  /** The pieces of the board, as the player has chosen them. */
  pieceSet?: string;
  /** The colouring of the board. */
  theme?: Parameters<typeof ChessBoard>[0]["theme"];
  /** The coordinates, as the player has chosen them. */
  coordinates?: Parameters<typeof ChessBoard>[0]["coordinates"];
  /** Called with the position that was built. */
  onUse: (fen: string) => void;
  /** Called when the editor is closed. */
  onClose: () => void;
}

const PIECE_LABELS: Record<PieceSymbol, string> = {
  k: "King",
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
};

/**
 * The position editor: a position built by hand.
 *
 * A piece is chosen and put on a square, a piece is taken off by choosing
 * the eraser, and the side to move and the rules of the position are set.
 * The position is written down as it is played, so it can be opened at the
 * desk or played from.
 */
export function PositionEditor({
  fen,
  pieceSet = "moongames",
  theme,
  coordinates,
  onUse,
  onClose,
}: PositionEditorProps) {
  const [state, setState] = useState<EditorState>(() =>
    fen === undefined ? fenToEditorState("") : fenToEditorState(fen),
  );
  const [color, setColor] = useState<Color>("w");
  const [piece, setPiece] = useState<PieceSymbol | null>("p");
  const [erasing, setErasing] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const board = useMemo(() => editorToBoard(state), [state]);
  const currentFen = useMemo(() => editorToFen(state), [state]);

  const handleSquare = (square: Square) => {
    if (erasing) {
      setState((current) => editorPlace(current, square, null));
      return;
    }
    if (piece === null) {
      return;
    }
    setState((current) => editorPlace(current, square, { type: piece, color }));
  };

  const copyPosition = async () => {
    const copied = await copyText(currentFen);
    setNotice(copied ? "Position copied" : "Could not copy the position");
  };

  const kingOn = (side: Color): boolean =>
    board.some((piece) => piece.type === "k" && piece.color === side);

  return (
    <div className="replay-overlay" role="presentation" onClick={onClose}>
      <div
        className="replay-dialog desk-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="The position editor"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replay-heading">
          <div>
            <p className="replay-kicker">The editor</p>
            <h2>Build a position</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the editor"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="desk-body">
          <div className="desk-board">
            <ChessBoard
              board={board}
              selected={null}
              legalTargets={[]}
              lastMove={null}
              checkSquare={null}
              flipped={flipped}
              pieceSet={pieceSet}
              theme={theme}
              coordinates={coordinates}
              onSquareClick={handleSquare}
            />

            <div className="editor-turn">
              <span className="editor-label">To move</span>
              {(["w", "b"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  className={`editor-turn__button${
                    state.turn === side ? " is-chosen" : ""
                  }`}
                  onClick={() =>
                    setState((current) => ({ ...current, turn: side }))
                  }
                  title={side === "w" ? "White" : "Black"}
                >
                  <span
                    className={`editor-dot editor-dot--${side}`}
                    aria-hidden="true"
                  />
                  {side === "w" ? "White" : "Black"}
                </button>
              ))}
              <button
                type="button"
                className="mini-button"
                onClick={() => setFlipped((current) => !current)}
                title="Turn the board"
              >
                Turn
              </button>
            </div>
          </div>

          <div className="desk-side">
            <div className="editor-palette">
              {(["w", "b"] as const).map((side) => (
                <div className="editor-palette__side" key={side}>
                  <span className="editor-label">
                    {side === "w" ? "White" : "Black"}
                  </span>
                  <div className="editor-palette__pieces">
                    {EDITOR_PIECES.map((type) => (
                      <button
                        key={`${side}-${type}`}
                        type="button"
                        className={`editor-piece${
                          !erasing &&
                          piece === type &&
                          color === side &&
                          piece !== null
                            ? " is-chosen"
                            : ""
                        }`}
                        onClick={() => {
                          setColor(side);
                          setPiece(type);
                          setErasing(false);
                        }}
                        title={PIECE_LABELS[type]}
                        aria-label={`${PIECE_LABELS[type]} of ${side === "w" ? "white" : "black"}`}
                      >
                        {pieceSet === "moongames" ? (
                          <PieceArtwork type={type} color={side} />
                        ) : (
                          <PieceImage
                            src={pieceImage(type, side, pieceSet)}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="editor-tools">
              <button
                type="button"
                className={`editor-eraser${erasing ? " is-chosen" : ""}`}
                onClick={() => setErasing((current) => !current)}
                aria-pressed={erasing}
              >
                Take a piece off
              </button>
              <button
                type="button"
                className="editor-eraser"
                onClick={() => setState((current) => clearEditorState(current))}
              >
                Empty the board
              </button>
            </div>

            <div className="editor-rules">
              <span className="editor-label">Castling</span>
              {(
                [
                  ["whiteKingSide", "K", "White, king side"],
                  ["whiteQueenSide", "Q", "White, queen side"],
                  ["blackKingSide", "k", "Black, king side"],
                  ["blackQueenSide", "q", "Black, queen side"],
                ] as const
              ).map(([key, mark, title]) => (
                <label className="editor-toggle" key={key} title={title}>
                  <input
                    type="checkbox"
                    checked={state[key]}
                    onChange={(event) =>
                      setState((current) => ({
                        ...current,
                        [key]: event.target.checked,
                      }))
                    }
                  />
                  <span>{mark}</span>
                </label>
              ))}
            </div>

            <div className="editor-counters">
              <label className="editor-counter">
                <span>Half move</span>
                <input
                  type="number"
                  min={0}
                  value={state.halfmove}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      halfmove: Number(event.target.value) || 0,
                    }))
                  }
                />
              </label>
              <label className="editor-counter">
                <span>Move</span>
                <input
                  type="number"
                  min={1}
                  value={state.fullmove}
                  onChange={(event) =>
                    setState((current) => ({
                      ...current,
                      fullmove: Number(event.target.value) || 1,
                    }))
                  }
                />
              </label>
            </div>

            <div className="desk-actions">
              <button
                type="button"
                className="action-button action-button--primary"
                onClick={() => onUse(currentFen)}
                disabled={!kingOn("w") || !kingOn("b")}
              >
                Use this position
              </button>
              <button
                type="button"
                className="action-button"
                onClick={() => void copyPosition()}
              >
                Copy the position
              </button>
            </div>

            {!kingOn("w") || !kingOn("b") ? (
              <p className="editor-note">
                Both sides need a king before the position can be played.
              </p>
            ) : null}

            {notice !== null && <p className="desk-notice">{notice}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

/** The picture of a piece in the set the player has chosen. */
function pieceImage(
  type: PieceSymbol,
  side: Color,
  pieceSet: string,
): string {
  if (typeof document === "undefined") {
    return "";
  }
  const extension = pieceSet === "monarchy" ? "webp" : "svg";
  return new URL(
    `pieces/${pieceSet}/${side}${type.toUpperCase()}.${extension}`,
    document.baseURI,
  ).toString();
}
