export type GameMode = "local" | "ai" | "online";

export interface ModeSwitchProps {
  mode: GameMode;
  onlineStatus: "offline" | "connecting" | "connected" | "error";
  onChange: (mode: GameMode) => void;
}

export function ModeSwitch({ mode, onlineStatus, onChange }: ModeSwitchProps) {
  return (
    <div className="mode-switch" role="tablist" aria-label="Game mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "local"}
        className={`mode-switch__button ${mode === "local" ? "mode-switch__button--active" : ""}`}
        onClick={() => onChange("local")}
      >
        Local
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "ai"}
        className={`mode-switch__button ${mode === "ai" ? "mode-switch__button--active" : ""}`}
        onClick={() => onChange("ai")}
      >
        vs AI
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "online"}
        className={`mode-switch__button ${mode === "online" ? "mode-switch__button--active" : ""}`}
        onClick={() => onChange("online")}
      >
        <span
          className={`connection-dot connection-dot--${onlineStatus}`}
          aria-hidden="true"
        />
        Online
      </button>
    </div>
  );
}
