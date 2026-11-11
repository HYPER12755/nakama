import { ChessEngine, type ChessState } from "@moongames/chess-core";
import type { OnlineHistoryEntry } from "./onlineProtocol";

export interface ReplayFrame {
  ply: number;
  state: ChessState;
  san: string | null;
}

export interface ReplayData {
  frames: ReplayFrame[];
  sans: string[];
  error: string | null;
}

function pgnResult(entry: OnlineHistoryEntry): string {
  if (entry.winnerColor === "w") {
    return "1-0";
  }
  if (entry.winnerColor === "b") {
    return "0-1";
  }
  if (
    entry.status === "draw" ||
    entry.status === "stalemate" ||
    entry.outcome === "draw"
  ) {
    return "1/2-1/2";
  }
  return "*";
}

function tag(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function pgnDate(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds <= 0) {
    return "????.??.??";
  }
  const date = new Date(milliseconds);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join(".");
}

export function replayFromHistory(entry: OnlineHistoryEntry): ReplayData {
  const sans = Array.isArray(entry.sans) ? entry.sans : [];
  const engine = new ChessEngine();

  try {
    if (typeof entry.pgn === "string" && entry.pgn.trim().length > 0) {
      engine.loadPgn(entry.pgn);
    } else {
      for (const san of sans) {
        engine.moveSan(san);
      }
    }

    // Older history records may not have the SAN array. The PGN remains the
    // source of truth and can always reconstruct it.
    if (engine.history.length === 0 && sans.length > 0) {
      engine.reset();
      for (const san of sans) {
        engine.moveSan(san);
      }
    }
  } catch (cause) {
    return {
      frames: [
        {
          ply: 0,
          state: new ChessEngine().getState(),
          san: null,
        },
      ],
      sans: [],
      error:
        cause instanceof Error
          ? `Could not replay this game: ${cause.message}`
          : "Could not replay this game.",
    };
  }

  const moves = engine.history;
  const frames: ReplayFrame[] = [
    {
      ply: 0,
      state: engine.getState(),
      san: null,
    },
  ];

  while (engine.history.length > 0) {
    engine.undo();
    frames.unshift({
      ply: 0,
      state: engine.getState(),
      san: null,
    });
  }

  frames.forEach((frame, index) => {
    frame.ply = index;
    frame.san = index === 0 ? null : (moves[index - 1]?.san ?? null);
  });

  return {
    frames,
    sans: moves.map((move) => move.san),
    error: null,
  };
}

export function exportPgn(entry: OnlineHistoryEntry): string {
  const white =
    entry.color === "w" ? "You" : entry.opponent.username || "Opponent";
  const black =
    entry.color === "b" ? "You" : entry.opponent.username || "Opponent";
  const headers = [
    '[Event "MoonGames Chess"]',
    '[Site "MoonGames"]',
    `[Date "${pgnDate(entry.endedAt)}"]`,
    '[Round "-"]',
    `[White "${tag(white)}"]`,
    `[Black "${tag(black)}"]`,
    `[Result "${pgnResult(entry)}"]`,
    `[TimeControl "${Math.round(entry.timeControl.initialMs / 1000)}+${Math.round(entry.timeControl.incrementMs / 1000)}"]`,
  ];

  const body = entry.pgn.trim();
  return `${headers.join("\n")}\n\n${body}${body.length > 0 ? " " : ""}${pgnResult(entry)}\n`;
}
