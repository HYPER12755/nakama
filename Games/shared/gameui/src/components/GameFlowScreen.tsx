import type { ReactNode } from "react";

export interface GameFlowScreenProps {
  /** The name of the screen. */
  title: string;
  /** A line under the name. */
  subtitle?: string;
  /** Goes back to the menu the screen was opened from. */
  onBack: () => void;
  /** The screen itself. */
  children: ReactNode;
}

/**
 * One screen of the organized menu.
 *
 * The game keeps everything it has. When the organized steps are on, the
 * panels are opened one at a time like this, instead of all together in the
 * side of the table.
 */
export function GameFlowScreen({
  title,
  subtitle,
  onBack,
  children,
}: GameFlowScreenProps) {
  return (
    <section className="flow-screen">
      <header className="flow-screen__header">
        <button
          type="button"
          className="flow-screen__back"
          onClick={onBack}
        >
          <svg
            className="icon"
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
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back
        </button>
        <div className="flow-screen__copy">
          <h2 className="flow-screen__title">{title}</h2>
          {subtitle === undefined ? null : (
            <p className="flow-screen__subtitle">{subtitle}</p>
          )}
        </div>
      </header>
      <div className="flow-screen__body">{children}</div>
    </section>
  );
}
