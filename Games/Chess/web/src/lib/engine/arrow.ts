/**
 * Whether the engine's arrow may be drawn on the board.
 *
 * The engine always answers for the side to move. In a game against a person
 * that side is often the opponent, and the player must not be shown the
 * opponent's intended move. The arrow is our own hint only.
 */
export interface ArrowVisibility {
  analysisOn: boolean;
  allowed: boolean;
  error: string | null;
  mode: "local" | "ai" | "online";
  /** The side the server says is to move. */
  turn: "w" | "b" | null;
  /** The side the player is playing in an online game. */
  myColor: "w" | "b" | null;
  /** The side the player is playing in a game against the computer. */
  humanColor: "w" | "b";
  /** The first move of the engine's principal variation. */
  bestMove?: string;
}

export function mayShowEngineArrow(input: ArrowVisibility): boolean {
  if (!input.analysisOn || !input.allowed || input.error !== null) {
    return false;
  }
  if (input.mode === "online") {
    if (input.myColor === null || input.turn === null) {
      return false;
    }
    if (input.turn !== input.myColor) {
      return false;
    }
  } else if (input.mode === "ai") {
    if (input.turn !== input.humanColor) {
      return false;
    }
  }
  const move = input.bestMove;
  return typeof move === "string" && move.length >= 4;
}
