import {
  CARROM_CHALLENGES,
  type CarromChallenge,
  type CarromChallengeProgress,
} from "@moongames/carrom-core";
import { Icon } from "./Icon";

export interface ChallengePanelProps {
  /** The challenge being played, if any. */
  active: CarromChallenge | null;
  /** The progress of the challenge being played. */
  progress: CarromChallengeProgress | null;
  onStart: (challenge: CarromChallenge) => void;
  onQuit: () => void;
  disabled?: boolean;
}

/**
 * The challenge table. A challenge is a solo table with a target: pocket a
 * number of your pieces inside a number of shots.
 */
export function ChallengePanel({
  active,
  progress,
  onStart,
  onQuit,
  disabled = false,
}: ChallengePanelProps) {
  if (active !== null && progress !== null) {
    const shotsLeft = Math.max(0, active.shots - progress.shots);
    return (
      <section className="panel challenge-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Challenge</p>
            <h2>{active.label}</h2>
          </div>
          <span className="panel-heading__meta">
            {progress.pocketed}/{active.target}
          </span>
        </div>
        <div className="challenge-progress">
          <span
            className={`challenge-progress__fill${
              progress.won ? " challenge-progress__fill--done" : ""
            }`}
            style={{
              width: `${Math.min(
                100,
                (progress.pocketed / active.target) * 100,
              )}%`,
            }}
          />
        </div>
        <p className="challenge-panel__note">
          {progress.won
            ? "Challenge complete."
            : `${shotsLeft} shot${shotsLeft === 1 ? "" : "s"} left. ${active.hint}`}
        </p>
        <button
          type="button"
          className="button button--ghost"
          onClick={onQuit}
          disabled={disabled}
        >
          Leave the challenge
        </button>
      </section>
    );
  }

  return (
    <section className="panel challenge-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Challenge</p>
          <h2>Trick shots</h2>
        </div>
      </div>
      <p className="challenge-panel__note">
        A solo table with a target. Pocket the pieces before the shots run
        out.
      </p>
      <ul className="challenge-list">
        {CARROM_CHALLENGES.map((challenge) => (
          <li key={challenge.id}>
            <button
              type="button"
              className="challenge-list__item"
              onClick={() => onStart(challenge)}
              disabled={disabled}
            >
              <span className="challenge-list__label">
                <strong>{challenge.label}</strong>
                <small>{challenge.hint}</small>
              </span>
              <span className="challenge-list__target">
                <Icon name="target" size={14} strokeWidth={2} />
                {challenge.target} in {challenge.shots}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
