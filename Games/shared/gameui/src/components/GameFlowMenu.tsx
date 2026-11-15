import type { ReactNode } from "react";

export interface GameFlowOption {
  id: string;
  label: string;
  /** A line that says what this choice means. */
  description?: string;
  icon?: ReactNode;
}

export interface GameFlowStep {
  /** The name of the step, for example "How do you want to play?". */
  title: string;
  /** A line under the title. */
  subtitle?: string;
  /** The choices this step offers. */
  options: GameFlowOption[];
}

export interface GameFlowMenuProps {
  /** The step that is shown. */
  step: GameFlowStep;
  /** Called with the id of the chosen option. */
  onChoose: (id: string) => void;
  /** Goes back to the previous step, when there is one. */
  onBack?: () => void;
  /** Closes the menu without a choice. */
  onClose: () => void;
  /** The name of the game, shown above the step. */
  gameName?: string;
}

/**
 * The organized menu.
 *
 * It is an extra layer over the plain switch: the game keeps everything it
 * has, and this menu gathers the choices in one place, one step at a time.
 * The menu is used by the launcher when a game is opened, and by the game
 * itself when the player turns on the organized steps.
 */
export function GameFlowMenu({
  step,
  onChoose,
  onBack,
  onClose,
  gameName,
}: GameFlowMenuProps) {
  return (
    <div
      className="flow-menu"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        className="flow-menu__panel"
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
      >
        <header className="flow-menu__header">
          <div>
            {gameName === undefined ? null : (
              <p className="flow-menu__game">{gameName}</p>
            )}
            <h2 className="flow-menu__title">{step.title}</h2>
            {step.subtitle === undefined ? null : (
              <p className="flow-menu__subtitle">{step.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            className="flow-menu__close"
            aria-label="Close the menu"
            onClick={onClose}
          >
            <svg
              className="icon"
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <ol className="flow-menu__options">
          {step.options.map((option, index) => (
            <li key={option.id}>
              <button
                type="button"
                className="flow-menu__option"
                onClick={() => onChoose(option.id)}
              >
                <span className="flow-menu__option-mark" aria-hidden="true">
                  {option.icon ?? <span className="flow-menu__option-number">{index + 1}</span>}
                </span>
                <span className="flow-menu__option-copy">
                  <strong>{option.label}</strong>
                  {option.description === undefined ? null : (
                    <small>{option.description}</small>
                  )}
                </span>
                <svg
                  className="icon flow-menu__option-arrow"
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
              </button>
            </li>
          ))}
        </ol>

        {onBack === undefined ? null : (
          <footer className="flow-menu__footer">
            <button
              type="button"
              className="flow-menu__back"
              onClick={onBack}
            >
              <svg
                className="icon"
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              Back
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
