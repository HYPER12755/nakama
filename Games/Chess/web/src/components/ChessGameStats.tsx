import type { ChessState, Color, PieceSymbol } from "@moongames/chess-core";

export interface ChessGameStatsProps {
  state: ChessState;
  /** The clock of each side in milliseconds, when the game is timed. */
  clockMs?: { whiteMs: number | null; blackMs: number | null } | null;
  /** The name of each side. */
  names?: { white: string; black: string };
}

/** What a piece is worth. A pawn is one, and so on up the board. */
const PIECE_VALUE: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

function formatClock(milliseconds: number | null): string {
  if (milliseconds === null) {
    return "—";
  }
  const total = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * The numbers of the game.
 *
 * A chess player wants to know what has been taken and how much time is
 * left, so those are the numbers shown here.
 */
export function ChessGameStats({
  state,
  clockMs = null,
  names,
}: ChessGameStatsProps) {
  // The pieces that are off the board are the ones that were taken.
  const taken: Record<Color, PieceSymbol[]> = { w: [], b: [] };
  for (const move of state.history) {
    if (move.captured === undefined) {
      continue;
    }
    // The piece that was taken belongs to the side that was not moving.
    taken[move.color === "w" ? "b" : "w"].push(move.captured);
  }

  const material = (color: Color): number =>
    taken[color].reduce((total, piece) => total + PIECE_VALUE[piece], 0);

  const whiteTaken = taken.w.length;
  const blackTaken = taken.b.length;
  const whiteMaterial = material("w");
  const blackMaterial = material("b");
  const advantage = whiteMaterial - blackMaterial;

  const row = (
    color: Color,
    label: string,
    count: number,
    value: number,
    clock: number | null,
  ) => (
    <div className={`game-stats__row game-stats__row--${color}`} key={color}>
      <span className="game-stats__name">{label}</span>
      <span className="game-stats__count">{count} taken</span>
      <span className="game-stats__clock">{formatClock(clock)}</span>
      <span className="game-stats__value">{value}</span>
    </div>
  );

  return (
    <section className="panel game-stats">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Numbers</p>
          <h2>Game stats</h2>
        </div>
        <span className="panel-heading__meta">
          Move {state.moveNumber} · {state.history.length} plies
        </span>
      </div>
      <div className="game-stats__rows">
        {row(
          "w",
          names?.white ?? "White",
          whiteTaken,
          whiteMaterial,
          clockMs?.whiteMs ?? null,
        )}
        {row(
          "b",
          names?.black ?? "Black",
          blackTaken,
          blackMaterial,
          clockMs?.blackMs ?? null,
        )}
      </div>
      <p className="game-stats__note">
        {advantage === 0
          ? "The material is level."
          : advantage > 0
            ? `${names?.white ?? "White"} is up ${advantage} of material.`
            : `${names?.black ?? "Black"} is up ${-advantage} of material.`}
        {taken.w.length > 0 || taken.b.length > 0
          ? ` The pieces taken are ${describeTaken(taken.w)} and ${describeTaken(taken.b)}.`
          : ""}
      </p>
    </section>
  );
}

function describeTaken(pieces: PieceSymbol[]): string {
  if (pieces.length === 0) {
    return "none";
  }
  const counts = new Map<PieceSymbol, number>();
  for (const piece of pieces) {
    counts.set(piece, (counts.get(piece) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([piece, count]) => `${count} ${PIECE_NAMES[piece]}${count === 1 ? "" : "s"}`)
    .join(", ");
}
