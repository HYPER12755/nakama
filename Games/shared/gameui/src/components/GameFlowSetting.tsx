import { useCallback, useEffect, useState } from "react";

const GLOBAL_KEY = "moongames.flow.all";

/**
 * The choice for every game, set in the menu.
 *
 * A game may choose its own, and that choice wins. A game that has never
 * been changed follows the menu.
 */
export function globalFlowEnabled(): boolean {
  try {
    return window.localStorage.getItem(GLOBAL_KEY) === "1";
  } catch {
    return false;
  }
}

/** Set the choice for every game. */
export function setGlobalFlowEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(GLOBAL_KEY, on ? "1" : "0");
  } catch {
    // Storage can be unavailable.
  }
}

/**
 * True when the organized steps are on for a game. The setting is kept on
 * the device, so the player finds the game the way they left it.
 */
export function flowSettingEnabled(gameId: string): boolean {
  try {
    const own = window.localStorage.getItem(`moongames.flow.${gameId}`);
    if (own !== null) {
      return own === "1";
    }
  } catch {
    // Storage can be unavailable.
  }
  return globalFlowEnabled();
}

export interface GameFlowSettingProps {
  /** The game this setting belongs to. */
  gameId: string;
  /** True when the organized steps are on. */
  onChange: (on: boolean) => void;
}

/**
 * The organized steps setting.
 *
 * The game keeps everything it has. This setting says whether the choices
 * are gathered into the organized menu, or left where they are.
 */
export function GameFlowSetting({ gameId, onChange }: GameFlowSettingProps) {
  const key = `moongames.flow.${gameId}`;
  const [on, setOn] = useState(() => flowSettingEnabled(gameId));

  useEffect(() => {
    try {
      window.localStorage.setItem(key, on ? "1" : "0");
    } catch {
      // Storage can be unavailable.
    }
  }, [key, on]);

  const toggle = useCallback(() => {
    setOn((current) => {
      const next = !current;
      onChange(next);
      return next;
    });
  }, [onChange]);

  return (
    <div className="flow-setting">
      <div className="flow-setting__copy">
        <strong>Organized steps</strong>
        <small>
          Gather the ways to play into one menu, one step at a time. Turn it
          off to see the game the way it always was.
        </small>
        <span className="flow-setting__state">
          {on ? "The organized menu is on" : "The plain menu is on"}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Organized steps"
        className={`flow-switch${on ? " flow-switch--on" : ""}`}
        onClick={toggle}
      >
        <span className="flow-switch__knob" />
      </button>
    </div>
  );
}
