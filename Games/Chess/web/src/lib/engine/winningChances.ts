/**
 * The winning chances of an evaluation.
 *
 * This is the way lichess turns the number an engine gives into something a
 * player can read: how likely the game is to be won. A number of 35 means
 * "a little better", but 60% means something quite different to a player.
 *
 * The port is the same as lichess's, down to the constant, so a number
 * means the same thing here as it does there.
 */

/** The chances, from 1 (certainly won) to -1 (certainly lost). */
export type WinningChances = number;

/** An evaluation, as an engine gives it. */
export interface EvalScore {
  /** The number of hundredths of a pawn, when the game is not a mate. */
  cp?: number;
  /** The number of moves to the mate, when the game is a mate. */
  mate?: number;
}

/**
 * https://github.com/lichess-org/lila/pull/11148
 */
const rawWinningChances = (cp: number): WinningChances => {
  const MULTIPLIER = -0.00368208;
  return 2 / (1 + Math.exp(MULTIPLIER * cp)) - 1;
};

/** The chances of the side the evaluation is about. */
export const cpWinningChances = (cp: number): WinningChances =>
  rawWinningChances(Math.min(Math.max(-1000, cp), 1000));

const mateWinningChances = (mate: number): WinningChances => {
  const cp = (21 - Math.min(10, Math.abs(mate))) * 100;
  const signed = cp * (mate > 0 ? 1 : -1);
  return rawWinningChances(signed);
};

/** The chances of the evaluation, whatever kind it is. */
export const evalWinningChances = (ev: EvalScore): WinningChances =>
  typeof ev.mate !== "undefined"
    ? mateWinningChances(ev.mate)
    : cpWinningChances(ev.cp ?? 0);

/** The chances of the side the evaluation is about. */
export const toPov = (color: "w" | "b", diff: number): number =>
  color === "w" ? diff : -diff;

/** The chances of a side, from an evaluation about the side to move. */
export const povChances = (
  color: "w" | "b",
  ev: EvalScore,
): WinningChances => toPov(color, evalWinningChances(ev));

/** The difference between two evaluations, in winning chances. */
export const povDiff = (
  color: "w" | "b",
  first: EvalScore,
  second: EvalScore,
): number => (povChances(color, first) - povChances(color, second)) / 2;

/** The chances of the side to move, as a number from 0 to 1. */
export function winningPercent(chances: WinningChances): number {
  return (chances + 1) / 2;
}
