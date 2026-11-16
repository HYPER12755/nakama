import { useEffect, useMemo, useState } from "react";
import {
  pathPairs,
  resultText,
  type ExplorerResult,
} from "../lib/openingExplorer";
import { replayFrames } from "../lib/replay";
import { ChessBoard } from "./ChessBoard";
import { Icon } from "./Icon";

export interface OpeningExplorerProps {
  /** Ask the server about a place in the tree. */
  onExplore: (path: string[]) => Promise<ExplorerResult>;
  /** The pieces of the board, as the player has chosen them. */
  pieceSet?: string;
  /** The colouring of the board. */
  theme?: Parameters<typeof ChessBoard>[0]["theme"];
  /** The coordinates, as the player has chosen them. */
  coordinates?: Parameters<typeof ChessBoard>[0]["coordinates"];
  /** Called when the explorer is closed. */
  onClose: () => void;
}

/**
 * The opening explorer.
 *
 * The tree is made on the server from the games that were played here. A
 * player walks it by clicking a move, and the board shows the place they
 * have come to. The moves are shown with how many games played them, and
 * the games behind the place are named.
 */
export function OpeningExplorer({
  onExplore,
  pieceSet = "moongames",
  theme,
  coordinates,
  onClose,
}: OpeningExplorerProps) {
  const [path, setPath] = useState<string[]>([]);
  const [result, setResult] = useState<ExplorerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void onExplore(path).then((answer) => {
      if (!cancelled) {
        setResult(answer);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [onExplore, path]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const frame = useMemo(() => {
    try {
      const frames = replayFrames(path);
      return frames[frames.length - 1]?.state ?? null;
    } catch {
      return null;
    }
  }, [path]);

  const moves = result?.ok === true ? result.moves : [];
  const games = result?.ok === true ? result.games : [];
  const biggest = moves.reduce((largest, move) => Math.max(largest, move.count), 1);

  const goBack = (length: number) => setPath(path.slice(0, length));
  const goTo = (san: string) => setPath([...path, san]);

  return (
    <div className="replay-overlay" role="presentation" onClick={onClose}>
      <div
        className="replay-dialog explorer-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="The opening explorer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replay-heading">
          <div>
            <p className="replay-kicker">The openings</p>
            <h2>What people play here</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the explorer"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="explorer-body">
          <div className="explorer-board">
            {frame === null ? (
              <p className="desk-empty">The opening cannot be shown.</p>
            ) : (
              <ChessBoard
                board={frame.board}
                selected={null}
                legalTargets={[]}
                lastMove={frame.lastMove ?? null}
                checkSquare={null}
                flipped={flipped}
                pieceSet={pieceSet}
                theme={theme}
                coordinates={coordinates}
                onSquareClick={() => undefined}
              />
            )}
            <button
              type="button"
              className="mini-button explorer-flip"
              onClick={() => setFlipped((current) => !current)}
            >
              Turn the board
            </button>
          </div>

          <div className="explorer-side">
            <div className="explorer-path">
              <button
                type="button"
                className="explorer-path__start"
                onClick={() => goBack(0)}
                title="The first move"
              >
                Start
              </button>
              {pathPairs(path).map(([number, white, black]) => (
                <span className="explorer-path__pair" key={number}>
                  <span className="explorer-path__number">{number}.</span>
                  <button
                    type="button"
                    className="explorer-path__move"
                    onClick={() => goBack((number - 1) * 2 + 1)}
                  >
                    {white}
                  </button>
                  {black !== undefined && (
                    <button
                      type="button"
                      className="explorer-path__move"
                      onClick={() => goBack(number * 2)}
                    >
                      {black}
                    </button>
                  )}
                </span>
              ))}
            </div>

            <div className="explorer-total">
              {loading ? (
                "Looking at the games…"
              ) : result?.ok === true ? (
                <>
                  <strong>{result.total}</strong> games reached this place
                </>
              ) : (
                <span className="replay-error" role="alert">
                  {result?.error?.message ?? "The openings could not be read."}
                </span>
              )}
            </div>

            <ul className="explorer-moves">
              {moves.map((move) => (
                <li key={move.san}>
                  <button
                    type="button"
                    className="explorer-move"
                    onClick={() => goTo(move.san)}
                  >
                    <span className="explorer-move__san">{move.san}</span>
                    <span className="explorer-move__bar" aria-hidden="true">
                      <span
                        style={{
                          width: `${Math.max(4, Math.round((move.count / biggest) * 100))}%`,
                        }}
                      />
                    </span>
                    <span className="explorer-move__count">{move.count}</span>
                  </button>
                </li>
              ))}
              {!loading && moves.length === 0 && result?.ok === true && (
                <li className="explorer-empty">
                  No game went any further from here.
                </li>
              )}
            </ul>

            {games.length > 0 && (
              <div className="explorer-games">
                <p className="explorer-games__title">Games from here</p>
                <ul>
                  {games.map((game) => (
                    <li key={game.matchId}>
                      <span className="explorer-game__names">
                        {game.white} – {game.black}
                      </span>
                      <span className="explorer-game__result">
                        {resultText(game.result)} · {game.moves} moves
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
