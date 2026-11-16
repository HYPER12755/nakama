/**
 * The coordinate trainer.
 *
 * This is the way lichess trains a player to know the board by sight: a
 * coordinate is named and the square is found, or a square is marked and the
 * coordinate is written.
 *
 * The rules are the same. A new coordinate always changes the file or the
 * rank, never both at once, so the player learns one thing at a time. Only
 * the files and the ranks that were chosen are used.
 */

export type TrainerMode = "findSquare" | "nameSquare";
export type TrainerTimeControl = "untimed" | "thirtySeconds";
export type TrainerColor = "w" | "b" | "random";

export const TRAINER_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;
export const TRAINER_RANKS = ["1", "2", "3", "4", "5", "6", "7", "8"] as const;

/** How long a round of the timed trainer lasts, in milliseconds. */
export const TRAINER_DURATION = 30 * 1000;

/** How often the clock is drawn, in milliseconds. */
export const TRAINER_TICK_DELAY = 50;

/** How many scores are kept for the chart. */
export const TRAINER_SCORE_LIMIT = 20;

function randomChoice(max: number): number {
  return Math.floor(Math.random() * max);
}

/**
 * The next coordinate.
 *
 * Only one of the file and the rank changes, so the player does not have to
 * learn two things at once.
 */
export function newTrainerKey(
  oldKey: string,
  selectedFiles: ReadonlySet<string> = new Set(),
  selectedRanks: ReadonlySet<string> = new Set(),
): string {
  const rand = randomChoice(2);
  let files = selectedFiles.size
    ? TRAINER_FILES.filter((file) => selectedFiles.has(file))
    : [...TRAINER_FILES];
  let ranks = selectedRanks.size
    ? TRAINER_RANKS.filter((rank) => selectedRanks.has(rank))
    : [...TRAINER_RANKS];

  if (files.length > 1 && rand === 0) {
    files = files.filter((file) => file !== oldKey[0]);
  }
  if (ranks.length > 1 && rand === 1) {
    ranks = ranks.filter((rank) => rank !== oldKey[1]);
  }

  return (
    files[randomChoice(files.length)] + ranks[randomChoice(ranks.length)]
  );
}

/** The board the trainer shows, with or without the pieces. */
export function trainerFen(showPieces: boolean): string {
  return showPieces
    ? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR"
    : "8/8/8/8/8/8/8/8";
}

/** The scores of the trainer, by mode and by colour. */
export type TrainerScores = Record<
  TrainerMode,
  Record<"w" | "b", number[]>
>;

export function emptyTrainerScores(): TrainerScores {
  return {
    findSquare: { w: [], b: [] },
    nameSquare: { w: [], b: [] },
  };
}

/**
 * The score of a round is kept, and the oldest is let go when there are too
 * many, the way lichess keeps the last twenty.
 */
export function addTrainerScore(
  scores: TrainerScores,
  mode: TrainerMode,
  color: "w" | "b",
  score: number,
): TrainerScores {
  const list = scores[mode][color];
  const kept = list.length >= TRAINER_SCORE_LIMIT ? list.slice(1) : [...list];
  return {
    ...scores,
    [mode]: {
      ...scores[mode],
      [color]: [...kept, score],
    },
  };
}

/**
 * The path of the scores, for the little chart.
 *
 * The scores are drawn from the oldest to the newest.
 */
export function trainerScorePath(
  scores: number[],
  width: number,
  height: number,
  padding = 4,
): string {
  if (scores.length === 0) {
    return "";
  }
  const highest = Math.max(...scores, 1);
  const usableWidth = Math.max(1, width - padding * 2);
  const usableHeight = Math.max(1, height - padding * 2);
  const step = scores.length > 1 ? usableWidth / (scores.length - 1) : 0;

  return scores
    .map((score, index) => {
      const x = padding + step * index;
      const y = padding + usableHeight * (1 - score / highest);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
