/**
 * The challenge table. A challenge is a solo table with a target: pocket a
 * number of your pieces inside a number of shots. It is the trick-shot mode
 * the mobile carrom apps are built around.
 */
export interface CarromChallenge {
  id: string;
  /** The name of the challenge. */
  label: string;
  /** One line the picker shows under the name. */
  hint: string;
  /** How many of your own pieces have to be pocketed. */
  target: number;
  /** How many shots you are allowed. */
  shots: number;
}

export const CARROM_CHALLENGES: readonly CarromChallenge[] = [
  {
    id: "opening-three",
    label: "Opening three",
    hint: "Pocket three of your pieces in four shots.",
    target: 3,
    shots: 4,
  },
  {
    id: "queen-hunter",
    label: "Queen hunter",
    hint: "Pocket four pieces in five shots.",
    target: 4,
    shots: 5,
  },
  {
    id: "clean-run",
    label: "Clean run",
    hint: "Pocket six pieces in eight shots.",
    target: 6,
    shots: 8,
  },
  {
    id: "long-haul",
    label: "Long haul",
    hint: "Pocket all nine of your pieces in twelve shots.",
    target: 9,
    shots: 12,
  },
];

export function challengeById(id: string): CarromChallenge | null {
  return CARROM_CHALLENGES.find((challenge) => challenge.id === id) ?? null;
}

/** The progress of a challenge table. */
export interface CarromChallengeProgress {
  challenge: CarromChallenge;
  /** Pieces of your colour pocketed so far. */
  pocketed: number;
  /** Shots taken so far. */
  shots: number;
  finished: boolean;
  /** The challenge is met. */
  won: boolean;
}

export function challengeProgress(
  challenge: CarromChallenge,
  pocketed: number,
  shots: number,
): CarromChallengeProgress {
  const won = pocketed >= challenge.target;
  const finished = won || shots >= challenge.shots;
  return { challenge, pocketed, shots, finished, won };
}
