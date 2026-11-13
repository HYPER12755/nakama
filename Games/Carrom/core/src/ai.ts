import {
  CARROM_BOARD,
  baselineY,
  clampStrikerX,
  nearestValidStrikerX,
  oppositePlayer,
} from "./board";
import { validateShot } from "./physics";
import { simulateShot } from "./shot";
import type {
  CarromDisc,
  CarromShotInput,
  CarromState,
} from "./types";

export type CarromAiDifficulty = "easy" | "normal" | "hard";

export interface CarromAiOptions {
  difficulty?: CarromAiDifficulty;
}

interface Candidate {
  shot: CarromShotInput;
  index: number;
  baseScore: number;
}

function targetPower(distance: number): number {
  return Math.min(0.96, Math.max(0.52, 0.5 + distance * 0.44));
}

function candidateKey(shot: CarromShotInput): string {
  return [
    shot.strikerX.toFixed(4),
    shot.angle.toFixed(4),
    shot.power.toFixed(3),
  ].join(":");
}

function addCandidate(
  candidates: Candidate[],
  seen: Set<string>,
  shot: CarromShotInput,
  baseScore: number,
): void {
  if (
    !Number.isFinite(shot.strikerX) ||
    !Number.isFinite(shot.angle) ||
    !Number.isFinite(shot.power) ||
    shot.power < 0.02 ||
    shot.power > 1
  ) {
    return;
  }
  const key = candidateKey(shot);
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  candidates.push({ shot, index: candidates.length, baseScore });
}

function addAimCandidates(
  state: CarromState,
  target: CarromDisc,
  candidates: Candidate[],
  seen: Set<string>,
  variants: number,
): void {
  const baseline = baselineY(state.turn);
  const distance = Math.hypot(target.x - 0.5, target.y - baseline);
  const power = targetPower(distance);
  const baseX = clampStrikerX(target.x);
  const baseScore = 4 - distance * 2.5;
  const positions =
    variants <= 0
      ? [baseX]
      : [baseX, clampStrikerX(baseX - 0.055), clampStrikerX(baseX + 0.055)];
  for (const strikerX of positions) {
    if (!Number.isFinite(strikerX)) {
      continue;
    }
    const angle = Math.atan2(target.y - baseline, target.x - strikerX);
    addCandidate(candidates, seen, { strikerX, angle, power }, baseScore);
    if (variants > 0) {
      addCandidate(
        candidates,
        seen,
        {
          strikerX,
          angle,
          power: Math.min(1, power + 0.08),
        },
        baseScore - 0.4,
      );
    }
  }
}

function addPocketCandidates(
  state: CarromState,
  target: CarromDisc,
  pocketCount: number,
  candidates: Candidate[],
  seen: Set<string>,
  variants: number,
): void {
  const baseline = baselineY(state.turn);
  const pockets = [...CARROM_BOARD.pocketCenters].sort(
    (left, right) =>
      Math.hypot(left.x - target.x, left.y - target.y) -
      Math.hypot(right.x - target.x, right.y - target.y),
  );
  const distance = Math.hypot(target.x - 0.5, target.y - baseline);
  const power = targetPower(distance);

  for (const pocket of pockets.slice(0, pocketCount)) {
    const deltaY = target.y - pocket.y;
    if (Math.abs(deltaY) < 0.025) {
      continue;
    }
    const pocketDistance = Math.hypot(pocket.x - target.x, pocket.y - target.y);
    const t = (baseline - target.y) / deltaY;
    const projectedX = target.x + t * (target.x - pocket.x);
    const baseX = clampStrikerX(projectedX);
    const clampPenalty = Math.abs(projectedX - baseX) * 20;
    const baseScore = 12 - pocketDistance * 7 - clampPenalty;
    const positions =
      variants <= 0
        ? [baseX]
        : [
            baseX,
            clampStrikerX(baseX - 0.04),
            clampStrikerX(baseX + 0.04),
          ];
    for (const strikerX of positions) {
      const angle = Math.atan2(target.y - baseline, target.x - strikerX);
      addCandidate(candidates, seen, { strikerX, angle, power }, baseScore);
      addCandidate(
        candidates,
        seen,
        {
          strikerX,
          angle,
          power: Math.min(1, power + 0.07),
        },
        baseScore - 0.3,
      );
    }
  }
}

function shotScore(
  state: CarromState,
  shot: CarromShotInput,
): { score: number; result: ReturnType<typeof simulateShot> } | null {
  if (validateShot(state, shot) !== null) {
    return null;
  }
  try {
    const result = simulateShot(state, shot, {
      frames: false,
      maxSeconds: 7,
    });
    const outcome = result.outcome;
    const player = state.turn;
    let score = outcome.ownPocketed * 16;
    if (outcome.queenCovered) {
      score += 12;
    } else if (outcome.queenPocketed && !outcome.queenReturned) {
      score += 5;
    }
    if (outcome.turnContinued) {
      score += 3;
    }
    if (outcome.opponentPocketed > 0) {
      score -= 12;
    }
    if (outcome.strikerPocketed) {
      score -= 22;
    }
    if (outcome.foul) {
      score -= 6;
    }
    if (outcome.winner === player) {
      score += 1000;
    } else if (outcome.winner !== null) {
      score -= 1000;
    }
    const opponent = oppositePlayer(player);
    score += (state.scores[opponent] - result.state.scores[opponent]) * 2;
    // Prefer a controlled shot when two candidates produce the same result.
    score += (1 - shot.power) * 0.01;
    return { score, result };
  } catch {
    return null;
  }
}

/**
 * A deterministic, simulation-backed opponent. It samples a small set of
 * plausible pocket lines and striker positions, then picks the best outcome.
 */
interface AiPlan {
  ordered: Candidate[];
  limit: number;
  fallback: () => CarromShotInput;
}

function buildAiPlan(
  state: CarromState,
  difficulty: CarromAiDifficulty,
): AiPlan {
  const active = state.discs.filter((disc) => !disc.pocketed);
  const own = active
    .filter((disc) => disc.kind === state.turn)
    .sort(
      (left, right) =>
        Math.hypot(left.x - 0.5, left.y - baselineY(state.turn)) -
        Math.hypot(right.x - 0.5, right.y - baselineY(state.turn)),
    );
  const queen = active.find((disc) => disc.kind === "queen");

  const targetLimit = difficulty === "easy" ? 2 : difficulty === "hard" ? 6 : 4;
  const pocketLimit = difficulty === "easy" ? 1 : difficulty === "hard" ? 3 : 2;
  const variants = difficulty === "easy" ? 0 : difficulty === "hard" ? 3 : 2;
  const evaluationLimit =
    difficulty === "easy" ? 7 : difficulty === "hard" ? 18 : 12;
  const targets = own.slice(0, targetLimit);
  if (
    queen !== undefined &&
    state.queen.status === "board" &&
    own.length > 0 &&
    targets.length < targetLimit + 1
  ) {
    targets.push(queen);
  }

  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    addAimCandidates(state, target, candidates, seen, variants);
    addPocketCandidates(
      state,
      target,
      pocketLimit,
      candidates,
      seen,
      variants,
    );
  }

  // A few neutral options keep the AI from freezing when the table is crowded.
  const baseline = baselineY(state.turn);
  for (const strikerX of [0.35, 0.5, 0.65]) {
    addCandidate(
      candidates,
      seen,
      {
        strikerX,
        angle: state.turn === "white" ? -Math.PI / 2 : Math.PI / 2,
        power: 0.58,
      },
      0,
    );
    if (own[0] !== undefined) {
      addCandidate(
        candidates,
        seen,
        {
          strikerX,
          angle: Math.atan2(own[0].y - baseline, own[0].x - strikerX),
          power: 0.66,
        },
        1,
      );
    }
  }

  const ordered = [...candidates].sort(
    (left, right) =>
      right.baseScore - left.baseScore || left.index - right.index,
  );

  return {
    ordered,
    limit: evaluationLimit,
    fallback: () => {
      const fallbackTarget = own[0] ?? queen;
      if (fallbackTarget !== undefined) {
        const strikerX = nearestValidStrikerX(state, fallbackTarget.x);
        return {
          strikerX,
          angle: Math.atan2(
            fallbackTarget.y - baseline,
            fallbackTarget.x - strikerX,
          ),
          power: 0.62,
        };
      }
      return {
        strikerX: nearestValidStrikerX(state, 0.5),
        angle: state.turn === "white" ? -Math.PI / 2 : Math.PI / 2,
        power: 0.5,
      };
    },
  };
}

function defaultYield(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === "function") {
      setTimeout(resolve, 0);
      return;
    }
    resolve();
  });
}

export function chooseAiShot(
  state: CarromState,
  options: CarromAiOptions = {},
): CarromShotInput {
  const plan = buildAiPlan(state, options.difficulty ?? "normal");
  let best: CarromShotInput | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of plan.ordered.slice(0, plan.limit)) {
    const evaluation = shotScore(state, candidate.shot);
    if (evaluation === null) {
      continue;
    }
    if (evaluation.score > bestScore) {
      best = candidate.shot;
      bestScore = evaluation.score;
    }
  }
  return best ?? plan.fallback();
}

/**
 * The same search as {@link chooseAiShot}, but it yields between batches so a
 * phone browser keeps painting while the opponent reads the table.
 */
export async function chooseAiShotAsync(
  state: CarromState,
  options: CarromAiOptions = {},
  yieldControl: () => Promise<void> = defaultYield,
): Promise<CarromShotInput> {
  const plan = buildAiPlan(state, options.difficulty ?? "normal");
  let best: CarromShotInput | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const batch = plan.ordered.slice(0, plan.limit);
  for (let index = 0; index < batch.length; index += 3) {
    for (const candidate of batch.slice(index, index + 3)) {
      const evaluation = shotScore(state, candidate.shot);
      if (evaluation === null) {
        continue;
      }
      if (evaluation.score > bestScore) {
        best = candidate.shot;
        bestScore = evaluation.score;
      }
    }
    await yieldControl();
  }
  return best ?? plan.fallback();
}
