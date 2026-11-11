import type { ChessState, Color } from "@moongames/chess-core";

export interface GameResultSummary {
  status: string;
  winnerColor?: Color | null;
  reason: string;
}

export interface GameStatusProps {
  state: ChessState;
  result?: GameResultSummary | null;
}

function colorLabel(color: Color): string {
  return color === "w" ? "White" : "Black";
}

function describe(
  state: ChessState,
  result: GameResultSummary | null,
): { title: string; detail: string } {
  if (result !== null) {
    if (result.winnerColor) {
      return {
        title: `${colorLabel(result.winnerColor)} wins`,
        detail: `The game ended by ${result.reason.replace(/_/g, " ")}.`,
      };
    }

    if (result.status === "abandoned") {
      return {
        title: "Match ended",
        detail: result.reason.replace(/_/g, " "),
      };
    }

    return {
      title: "Draw",
      detail: `The game ended by ${result.reason.replace(/_/g, " ")}.`,
    };
  }

  const turn = colorLabel(state.turn);
  const winner = state.winner === null ? null : colorLabel(state.winner);

  switch (state.status) {
    case "checkmate":
      return {
        title: `${winner ?? "Winner"} wins`,
        detail: "Checkmate. No legal escape is available.",
      };
    case "stalemate":
      return {
        title: "Draw",
        detail: "Stalemate. The player to move has no legal moves.",
      };
    case "draw":
      return {
        title: "Draw",
        detail: "The game ended in a draw.",
      };
    case "check":
      return {
        title: `${turn} is in check`,
        detail: "Find a legal move that escapes check.",
      };
    case "active":
    default:
      return {
        title: `${turn} to move`,
        detail:
          state.history.length === 0
            ? "White moves first. Tap a piece to begin."
            : "Tap a piece, then tap a highlighted square.",
      };
  }
}

export function GameStatus({ state, result = null }: GameStatusProps) {
  const { title, detail } = describe(state, result);
  const badge = result?.status ?? state.status;

  return (
    <section className="panel status-panel" aria-live="polite">
      <div className="panel-heading">
        <h2>Game status</h2>
        <span className={`status-badge status-badge--${badge}`}>{badge}</span>
      </div>
      <p className="status-title">{title}</p>
      <p className="status-detail">{detail}</p>
      <div className="status-meta">
        <span>Move {state.moveNumber}</span>
        <span>{state.history.length} plies</span>
      </div>
    </section>
  );
}
