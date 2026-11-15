import type { ChessState, Color, PieceSymbol } from "@moongames/chess-core";
import { PieceArtwork } from "./Piece";

export interface ChessCapturedProps {
  state: ChessState;
}

/**
 * The pieces that have been taken.
 *
 * A chess player reads the board by the pieces that are missing, so the
 * pieces each side has taken are shown next to their clock.
 */
export function ChessCaptured({ state }: ChessCapturedProps) {
  // The piece that was taken belongs to the side that was not moving.
  const taken: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const move of state.history) {
    if (move.captured === undefined) {
      continue;
    }
    taken[move.color === "w" ? "b" : "w"].push(move.captured);
  }

  const row = (color: Color, pieces: PieceSymbol[]) =>
    pieces.length === 0 ? null : (
      <div className={`captured-tray captured-tray--${color}`} key={color}>
        {pieces.map((piece, index) => (
          <span className="captured-tray__piece" key={`${piece}-${index}`}>
            <PieceArtwork type={piece} color={color} />
          </span>
        ))}
      </div>
    );

  return (
    <section className="panel captured-panel">
      <div className="panel-heading">
        <h2>Taken pieces</h2>
        <span className="panel-count">
          {taken.w.length + taken.b.length}
        </span>
      </div>
      <div className="captured-trays">
        {row("w", taken.w)}
        {row("b", taken.b)}
        {taken.w.length + taken.b.length === 0 ? (
          <p className="empty-state">Nothing has been taken yet.</p>
        ) : null}
      </div>
    </section>
  );
}
