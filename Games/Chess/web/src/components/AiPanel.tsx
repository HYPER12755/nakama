import { useState } from "react";
import type { AiDifficulty, Color } from "@moongames/chess-core";
import type { AiGameSettings } from "../hooks/useChessGame";

export interface AiPanelProps {
  settings: AiGameSettings | null;
  thinking: boolean;
  onStart: (settings: AiGameSettings) => void;
}

const DIFFICULTIES: Array<{ id: AiDifficulty; label: string; note: string }> = [
  { id: "easy", label: "Easy", note: "Fast, casual play" },
  { id: "medium", label: "Medium", note: "Looks a couple of moves ahead" },
  { id: "hard", label: "Hard", note: "Deeper search, slower moves" },
];

export function AiPanel({ settings, thinking, onStart }: AiPanelProps) {
  const [humanColor, setHumanColor] = useState<Color>(
    settings?.humanColor ?? "w",
  );
  const [difficulty, setDifficulty] = useState<AiDifficulty>(
    settings?.difficulty ?? "medium",
  );

  return (
    <section className="panel ai-panel">
      <div className="panel-heading">
        <h2>Computer</h2>
        <span className={`ai-state${thinking ? " ai-state--thinking" : ""}`}>
          {thinking ? "Thinking…" : "Ready"}
        </span>
      </div>

      <p className="online-copy online-copy--compact">
        Play a local game against the computer. The engine runs on this device;
        no server connection is needed.
      </p>

      <div className="online-actions">
        <button
          type="button"
          className={`mini-button${humanColor === "w" ? " mini-button--active" : ""}`}
          onClick={() => setHumanColor("w")}
          aria-pressed={humanColor === "w"}
        >
          Play White
        </button>
        <button
          type="button"
          className={`mini-button${humanColor === "b" ? " mini-button--active" : ""}`}
          onClick={() => setHumanColor("b")}
          aria-pressed={humanColor === "b"}
        >
          Play Black
        </button>
      </div>

      <label className="field">
        <span>Difficulty</span>
        <select
          value={difficulty}
          onChange={(event) =>
            setDifficulty(event.target.value as AiDifficulty)
          }
          disabled={thinking}
        >
          {DIFFICULTIES.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label} — {option.note}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        className="action-button action-button--primary"
        onClick={() => onStart({ humanColor, difficulty })}
      >
        Start new game
      </button>
    </section>
  );
}
