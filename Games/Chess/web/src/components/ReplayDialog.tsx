import { useEffect, useMemo, useState } from "react";
import { copyText } from "../lib/clipboard";
import type { OnlineHistoryEntry } from "../lib/onlineProtocol";
import { exportPgn, replayFromHistory } from "../lib/replay";
import { ChessBoard } from "./ChessBoard";
import { GameStatus } from "./GameStatus";

export interface ReplayDialogProps {
  entry: OnlineHistoryEntry;
  onClose: () => void;
}

export function ReplayDialog({ entry, onClose }: ReplayDialogProps) {
  const replay = useMemo(() => replayFromHistory(entry), [entry]);
  const [ply, setPly] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [flipped, setFlipped] = useState(entry.color === "b");
  const [notice, setNotice] = useState<string | null>(null);

  const lastPly = replay.frames.length - 1;
  const frame = replay.frames[Math.min(ply, lastPly)] ?? replay.frames[0];

  useEffect(() => {
    setPly(0);
    setPlaying(false);
    setFlipped(entry.color === "b");
    setNotice(null);
  }, [entry.matchId, entry.color]);

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
    if (!playing) {
      return;
    }
    if (ply >= lastPly) {
      setPlaying(false);
      return;
    }

    const timer = window.setTimeout(() => setPly((current) => current + 1), 650);
    return () => window.clearTimeout(timer);
  }, [lastPly, playing, ply]);

  useEffect(() => {
    if (notice === null) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const copyPgn = async () => {
    const copied = await copyText(exportPgn(entry));
    setNotice(copied ? "PGN copied" : "Could not copy PGN");
  };

  const downloadPgn = () => {
    const blob = new Blob([exportPgn(entry)], {
      type: "application/x-chess-pgn;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `moongames-chess-${entry.matchId}.pgn`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const finalResult =
    ply === lastPly && lastPly > 0
      ? {
          status: entry.status,
          winnerColor: entry.winnerColor ?? null,
          reason: entry.reason,
        }
      : null;

  return (
    <div
      className="replay-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="replay-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Replay versus ${entry.opponent.username}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="replay-heading">
          <div>
            <p className="replay-kicker">Saved game</p>
            <h2>Replay vs {entry.opponent.username || "Opponent"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close replay"
          >
            ×
          </button>
        </div>

        {replay.error !== null ? (
          <p className="replay-error" role="alert">
            {replay.error}
          </p>
        ) : (
          <div className="replay-body">
            <div className="replay-board">
              <ChessBoard
                board={frame.state.board}
                selected={null}
                legalTargets={[]}
                lastMove={frame.state.lastMove ?? null}
                checkSquare={null}
                flipped={flipped}
                onSquareClick={() => undefined}
              />
            </div>

            <div className="replay-side">
              <div className="replay-controls">
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    setPlaying(false);
                    setPly(0);
                  }}
                  disabled={ply === 0}
                  aria-label="First position"
                >
                  |‹
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    setPlaying(false);
                    setPly((current) => Math.max(0, current - 1));
                  }}
                  disabled={ply === 0}
                  aria-label="Previous move"
                >
                  ‹
                </button>
                <button
                  type="button"
                  className="action-button action-button--primary replay-play"
                  onClick={() => {
                    if (ply >= lastPly) {
                      setPly(0);
                    }
                    setPlaying((current) => !current);
                  }}
                  disabled={lastPly === 0}
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    setPlaying(false);
                    setPly((current) => Math.min(lastPly, current + 1));
                  }}
                  disabled={ply === lastPly}
                  aria-label="Next move"
                >
                  ›
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => {
                    setPlaying(false);
                    setPly(lastPly);
                  }}
                  disabled={ply === lastPly}
                  aria-label="Final position"
                >
                  ›|
                </button>
              </div>

              <div className="replay-position">
                <span>
                  Ply {ply} / {lastPly}
                </span>
                <span>{frame.san ?? "Start position"}</span>
              </div>

              {finalResult !== null && (
                <GameStatus state={frame.state} result={finalResult} />
              )}

              <div className="replay-moves" aria-label="Replay moves">
                <button
                  type="button"
                  className={`replay-move${ply === 0 ? " replay-move--active" : ""}`}
                  onClick={() => setPly(0)}
                >
                  Start
                </button>
                {replay.sans.map((san, index) => (
                  <button
                    key={`${san}-${index}`}
                    type="button"
                    className={`replay-move${ply === index + 1 ? " replay-move--active" : ""}`}
                    onClick={() => {
                      setPlaying(false);
                      setPly(index + 1);
                    }}
                  >
                    {index % 2 === 0 && (
                      <span className="replay-move-number">
                        {Math.floor(index / 2) + 1}.
                      </span>
                    )}
                    {san}
                  </button>
                ))}
              </div>

              <div className="replay-actions">
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => setFlipped((current) => !current)}
                >
                  Flip board
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={() => void copyPgn()}
                >
                  Copy PGN
                </button>
                <button
                  type="button"
                  className="mini-button"
                  onClick={downloadPgn}
                >
                  Download PGN
                </button>
              </div>

              {notice !== null && (
                <p className="replay-notice" role="status">
                  {notice}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
