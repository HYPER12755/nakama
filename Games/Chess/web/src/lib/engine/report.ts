import { ExternalEngine, readEngineOutput, type EngineMode } from "./externalEngine";
import { povChances } from "./winningChances";

/**
 * The report of a finished game.
 *
 * This is what lichess shows after a game: the engine looks at every
 * position, and the moves where the player gave away the most are marked.
 * The marks and the lines they are drawn at are the ones lichess uses, so a
 * move that is a blunder there is a blunder here.
 */

/** The mark on a move that gave a little away. */
export type ReportGlyph = "?! " | "?" | "??";

/** The lines the marks are drawn at, in the chances of winning. */
export const GLYPH_THRESHOLDS: Array<{ glyph: ReportGlyph; loss: number }> = [
  { glyph: "??", loss: 0.3 },
  { glyph: "?", loss: 0.2 },
  { glyph: "?! ", loss: 0.1 },
];

/** One move of the report. */
export interface ReportMove {
  /** The move, written the way a player writes it. */
  san: string;
  /** The move, in the engine's way. */
  uci: string;
  /** The chances of winning before the move, from the player's side. */
  before: number | null;
  /** The chances of winning after the move, from the player's side. */
  after: number | null;
  /** The mark on the move, when the move gave something away. */
  glyph: ReportGlyph | null;
  /** How much the move gave away, in the chances of winning. */
  loss: number;
}

export interface GameReport {
  /** Every move of the game, with what the engine said about it. */
  moves: ReportMove[];
  /** The move that gave the most away. */
  worst: ReportMove | null;
  /** Whether the report is finished. */
  done: boolean;
  /** How many positions have been looked at. */
  analysed: number;
  /** What went wrong, when something did. */
  error: string | null;
}

export interface AnalyseGameOptions {
  /** The moves of the game, in the engine's way. */
  uciMoves: string[];
  /** The moves of the game, written the way a player writes them. */
  sanMoves: string[];
  /** The position the game started from. */
  initialFen: string;
  /** Whose side the report is about. */
  color: "w" | "b";
  /** The kind of game, which decides whether the engine may be asked. */
  mode: EngineMode;
  /** The token of the session, so the server knows who is asking. */
  token?: string;
  /** How deep the engine should look. */
  depth?: number;
  /** Called for every position that was looked at. */
  onProgress?: (report: GameReport) => void;
}

/**
 * The mark on a move, from how much the move gave away.
 */
export function glyphForLoss(loss: number): ReportGlyph | null {
  for (const threshold of GLYPH_THRESHOLDS) {
    if (loss > threshold.loss) {
      return threshold.glyph;
    }
  }
  return null;
}

/**
 * The chances of winning for a side, from the evaluation of a position.
 *
 * The engine gives its number from the point of view of the side to move,
 * and the chances are wanted for one side, so the number is turned about
 * when it is the other side's turn.
 */
function chancesFor(
  evaluation: { cp?: number; mate?: number } | null,
  color: "w" | "b",
  sideToMoveIsBlack: boolean,
): number | null {
  if (evaluation === null) {
    return null;
  }
  const white: { cp?: number; mate?: number } = {};
  if (typeof evaluation.cp === "number") {
    white.cp = sideToMoveIsBlack ? -evaluation.cp : evaluation.cp;
  }
  if (typeof evaluation.mate === "number") {
    white.mate = sideToMoveIsBlack ? -evaluation.mate : evaluation.mate;
  }
  return povChances(color, white);
}

/**
 * The engine looks at every position of the game and says what it thinks.
 *
 * The positions are looked at one after the other, so the report fills in
 * as it goes.
 */
export async function analyseGame(
  options: AnalyseGameOptions,
): Promise<GameReport> {
  const {
    uciMoves,
    sanMoves,
    initialFen,
    color,
    mode,
    token,
    depth = 12,
    onProgress,
  } = options;

  const engine = new ExternalEngine("");
  const moves: ReportMove[] = [];
  let before: number | null = null;
  let analysed = 0;
  let error: string | null = null;

  const report = (done: boolean): GameReport => ({
    moves: [...moves],
    worst:
      moves.length > 0
        ? moves.reduce((worst, move) => (move.loss > worst.loss ? move : worst))
        : null,
    done,
    analysed,
    error,
  });

  const look = async (count: number): Promise<number | null> => {
    let latest: { cp?: number; mate?: number } | null = null;
    await engine.analyse(
      {
        initialFen,
        moves: uciMoves.slice(0, count),
        depth,
        multiPv: 1,
        threads: 1,
        hash: 16,
        mode,
        token,
      },
      (line) => {
        const read = readEngineOutput(line, count % 2 === 1);
        if (read !== null) {
          latest = { cp: read.cp, mate: read.mate };
        }
      },
    );
    return chancesFor(latest, color, count % 2 === 1);
  };

  try {
    for (let index = 0; index < uciMoves.length; index += 1) {
      const after = await look(index + 1);
      // Lichess measures how much a move gave away as half the difference
      // of the winning chances, so the marks are drawn at the same lines
      // there.
      const loss =
        before !== null && after !== null ? (before - after) / 2 : 0;
      moves.push({
        san: sanMoves[index] ?? uciMoves[index],
        uci: uciMoves[index],
        before,
        after,
        glyph: glyphForLoss(loss),
        loss,
      });
      before = after;
      analysed = index + 1;
      onProgress?.(report(false));
    }
  } catch (cause) {
    error =
      cause instanceof Error ? cause.message : "The engine could not be reached.";
  }

  return report(true);
}
