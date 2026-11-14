import type { ReactNode } from "react";

export interface ReplayShellProps {
  title: string;
  kicker?: string;
  /** The replay steps, one label per position. */
  steps: string[];
  step: number;
  playing: boolean;
  /** The board rendered at the current step. */
  board: ReactNode;
  /** Extra detail beside the board. */
  side?: ReactNode;
  onStep: (index: number) => void;
  onTogglePlay: () => void;
  onClose: () => void;
  notice?: string | null;
  positionLabel?: string;
}

/**
 * The replay chrome shared by every title. The game supplies the board and the
 * step labels; the overlay, the transport, and the step list are shared.
 */
export function ReplayShell({
  title,
  kicker,
  steps,
  step,
  playing,
  board,
  side,
  onStep,
  onTogglePlay,
  onClose,
  notice,
  positionLabel,
}: ReplayShellProps) {
  const last = Math.max(0, steps.length - 1);
  const current = Math.min(step, last);

  return (
    <div className="replay-overlay">
      <section
        className="replay-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="replay-heading">
          <div>
            {kicker !== undefined ? (
              <p className="replay-kicker">{kicker}</p>
            ) : null}
            <h2>{title}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close the replay"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="replay-body">
          <div className="replay-board">{board}</div>
          <div className="replay-side">
            {side}
            <div className="replay-controls">
              <button
                type="button"
                className="mini-button"
                onClick={() => onStep(Math.max(0, current - 1))}
                disabled={current <= 0}
              >
                Previous
              </button>
              <button
                type="button"
                className="replay-play"
                onClick={onTogglePlay}
              >
                {playing ? "Pause" : "Play"}
              </button>
              <button
                type="button"
                className="mini-button"
                onClick={() => onStep(Math.min(last, current + 1))}
                disabled={current >= last}
              >
                Next
              </button>
            </div>
            <p className="replay-position">
              <span>Position</span>
              <span>
                {current + 1} / {Math.max(1, steps.length)}
                {positionLabel !== undefined ? ` · ${positionLabel}` : ""}
              </span>
            </p>
            <ol className="replay-moves">
              {steps.map((label, index) => (
                <li
                  key={`${index}-${label}`}
                  className={`replay-move${index === current ? " replay-move--active" : ""}`}
                >
                  <button type="button" onClick={() => onStep(index)}>
                    <span className="replay-move-number">{index + 1}</span>
                    <span>{label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {notice !== null && notice !== undefined ? (
          <p className="replay-notice">{notice}</p>
        ) : null}

        <footer className="replay-actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Close
          </button>
        </footer>
      </section>
    </div>
  );
}
