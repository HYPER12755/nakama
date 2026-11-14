import type { ReactNode } from "react";

export interface ModeOption {
  id: string;
  label: string;
  icon?: ReactNode;
}

export interface ModeSwitchProps {
  modes: ModeOption[];
  mode: string;
  onChange: (mode: string) => void;
  ariaLabel?: string;
}

/** The local, AI, and online switch every game shows in the header. */
export function ModeSwitch({
  modes,
  mode,
  onChange,
  ariaLabel = "Game mode",
}: ModeSwitchProps) {
  return (
    <div className="mode-switch" role="tablist" aria-label={ariaLabel}>
      {modes.map((option) => (
        <button
          type="button"
          role="tab"
          aria-selected={mode === option.id}
          className={`mode-switch__button ${
            mode === option.id ? "mode-switch__button--active" : ""
          }`}
          key={option.id}
          onClick={() => onChange(option.id)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
