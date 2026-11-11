import type { Color, PromotionPiece } from "@moongames/chess-core";
import { glyphFor } from "../lib/pieces";

const OPTIONS: Array<{ value: PromotionPiece; label: string }> = [
  { value: "q", label: "Queen" },
  { value: "r", label: "Rook" },
  { value: "b", label: "Bishop" },
  { value: "n", label: "Knight" },
];

export interface PromotionPickerProps {
  color: Color;
  onSelect: (piece: PromotionPiece) => void;
  onCancel: () => void;
}

export function PromotionPicker({
  color,
  onSelect,
  onCancel,
}: PromotionPickerProps) {
  return (
    <div
      className="promotion-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
    >
      <div className="promotion-card">
        <h2>Promote pawn</h2>
        <div className="promotion-options">
          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="promotion-option"
              onClick={() => onSelect(option.value)}
            >
              <span className={`piece piece--${color}`} aria-hidden="true">
                {glyphFor(option.value)}
              </span>
              <span>{option.label}</span>
            </button>
          ))}
        </div>
        <button type="button" className="text-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
