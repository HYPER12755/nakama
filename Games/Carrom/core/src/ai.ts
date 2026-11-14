import {
  CARROM_BOARD,
  baselineOf,
  clampStrikerPosition,
  nearestValidStrikerPosition,
  strikerPoint,
  type CarromBaseline,
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
    shot.position.toFixed(4),
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
    !Number.isFinite(shot.position) ||
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

/**
 * Where the striker must sit so that the target is driven towards the
 * pocket. The striker, the target, and the pocket have to share a line.
 */
function pocketLinePosition(
  target: CarromDisc,
  pocket: { x: number; y: number },
  baseline: CarromBaseline,
): number | null {
  const along = baseline.slideAxis;
  const across = baseline.lineAxis;
  const targetAlong = target[along];
  const targetAcross = target[across];
  const pocketAlong = pocket[along];
  const pocketAcross = pocket[across];
  const acrossDelta = targetAcross - pocketAcross;
  if (Math.abs(acrossDelta) < 0.025) {
    return null;
  }
  const step = (baseline.linePosition - targetAcross) / acrossDelta;
  const position = targetAlong + step * (targetAlong - pocketAlong);
  if (!Number.isFinite(position)) {
    return null;
  }
  return position;
}

function aimAngle(
  striker: { x: number; y: number },
  target: CarromDisc,
): number {
  return Math.atan2(target.y - striker.y, target.x - striker.x);
}

function addAimCandidates(
  state: CarromState,
  target: CarromDisc,
  candidates: Candidate[],
  seen: Set<string>,
  variants: number,
): void {
  const baseline = baselineOf(state.turn);
  const power = targetPower(
    Math.hypot(target.x - 0.5, target.y - 0.5) + 0.2,
  );
  const base = clampStrikerPosition(target[baseline.slideAxis]);
  const positions =
    variants <= 0
      ? [base]
      : [
          base,
          clampStrikerPosition(base - 0.055),
          clampStrikerPosition(base + 0.055),
        ];
  for (const position of positions) {
    if (!Number.isFinite(position)) {
      continue;
    }
    const striker = strikerPoint(state.turn, position);
    const angle = aimAngle(striker, target);
    addCandidate(candidates, seen, { position, angle, power }, 4);
    if (variants > 0) {
      addCandidate(
        candidates,
        seen,
        {
          position,
          angle,
          power: Math.min(1, power + 0.08),
        },
        3.6,
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
  const baseline = baselineOf(state.turn);
  const pockets = [...CARROM_BOARD.pocketCenters].sort(
    (left, right) =>
      Math.hypot(left.x - target.x, left.y - target.y) -
      Math.hypot(right.x - target.x, right.y - target.y),
  );
  const power = targetPower(
    Math.hypot(target.x - 0.5, target.y - 0.5) + 0.2,
  );

  for (const pocket of pockets.slice(0, pocketCount)) {
    const projected = pocketLinePosition(target, pocket, baseline);
    if (projected === null) {
      continue;
    }
    const base = clampStrikerPosition(projected);
    const clampPenalty = Math.abs(projected - base) * 20;
    const baseScore = 12 - clampPenalty;
    const positions =
      variants <= 0
        ? [base]
        : [
            base,
            clampStrikerPosition(base - 0.04),
            clampStrikerPosition(base + 0.04),
          ];
    for (const position of positions) {
      const striker = strikerPoint(state.turn, position);
      const angle = aimAngle(striker, target);
      addCandidate(candidates, seen, { position, angle, power }, baseScore);
      addCandidate(
        candidates,
        seen,
        {
          position,
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
    for (const opponent of state.players) {
      if (opponent === player) {
        continue;
      }
      score += (state.scores[opponent] - result.state.scores[opponent]) * 2;
    }
    // Prefer a controlled shot when two candidates produce the same result.
    score += (1 - shot.power) * 0.01;
    return { score, result };
  } catch {
    return null;
  }
}

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
        Math.hypot(left.x - 0.5, left.y - 0.5) -
        Math.hypot(right.x - 0.5, right.y - 0.5),
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
  const baseline = baselineOf(state.turn);
  for (const raw of [0.35, 0.5, 0.65]) {
    const position = clampStrikerPosition(raw);
    const striker = strikerPoint(state.turn, position);
    const straight =
      baseline.slideAxis === "x"
        ? { x: striker.x, y: baseline.inward > 0 ? 1 : 0 }
        : { x: baseline.inward > 0 ? 1 : 0, y: striker.y };
    addCandidate(
      candidates,
      seen,
      {
        position,
        angle: Math.atan2(straight.y - striker.y, straight.x - striker.x),
        power: 0.58,
      },
      0,
    );
    if (own[0] !== undefined) {
      addCandidate(
        candidates,
        seen,
        {
          position,
          angle: aimAngle(striker, own[0]),
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
        const position = nearestValidStrikerPosition(
          state,
          fallbackTarget[baseline.slideAxis],
        );
        const striker = strikerPoint(state.turn, position);
        return {
          position,
          angle: aimAngle(striker, fallbackTarget),
          power: 0.62,
        };
      }
      const position = nearestValidStrikerPosition(state, 0.5);
      const direction =
        baseline.lineAxis === "y"
          ? { x: 0, y: baseline.inward }
          : { x: baseline.inward, y: 0 };
      return {
        position,
        angle: Math.atan2(direction.y, direction.x),
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

/**
 * A seeded generator, so the same position always produces the same shot while
 * the AI still varies from move to move.
 */
function seededRandom(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  const advance = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  // Warm the generator up so neighbouring seeds land in different places.
  advance();
  advance();
  advance();
  advance();
  return advance;
}

/**
 * Pick a line the way a person would: the strongest line is the most likely
 * choice, but the AI also misses. The decay decides how often.
 */
export function pickWithRealism(
  ranked: { shot: CarromShotInput; score: number }[],
  seed: number,
  decay: number,
): CarromShotInput {
  if (ranked.length === 0) {
    throw new Error("no ranked shots");
  }
  const weights = ranked.map((_, index) => Math.pow(decay, index));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const random = seededRandom(seed);
  let roll = random() * total;
  for (let index = 0; index < ranked.length; index += 1) {
    roll -= weights[index]!;
    if (roll <= 0) {
      return ranked[index]!.shot;
    }
  }
  return ranked[0]!.shot;
}

const REALISM: Record<CarromAiDifficulty, number> = {
  easy: 0.28,
  normal: 0.45,
  hard: 0.62,
};

export function chooseAiShot(
  state: CarromState,
  options: CarromAiOptions = {},
): CarromShotInput {
  const difficulty = options.difficulty ?? "normal";
  const plan = buildAiPlan(state, difficulty);
  const ranked: { shot: CarromShotInput; score: number }[] = [];
  for (const candidate of plan.ordered.slice(0, plan.limit)) {
    const evaluation = shotScore(state, candidate.shot);
    if (evaluation === null) {
      continue;
    }
    ranked.push({ shot: candidate.shot, score: evaluation.score });
  }
  ranked.sort((left, right) => right.score - left.score);
  if (ranked.length === 0) {
    return plan.fallback();
  }
  return pickWithRealism(
    ranked,
    state.shotNumber * 7919 + ranked.length,
    REALISM[difficulty],
  );
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
  const difficulty = options.difficulty ?? "normal";
  const plan = buildAiPlan(state, difficulty);
  const ranked: { shot: CarromShotInput; score: number }[] = [];
  const batch = plan.ordered.slice(0, plan.limit);
  for (let index = 0; index < batch.length; index += 3) {
    for (const candidate of batch.slice(index, index + 3)) {
      const evaluation = shotScore(state, candidate.shot);
      if (evaluation === null) {
        continue;
      }
      ranked.push({ shot: candidate.shot, score: evaluation.score });
    }
    await yieldControl();
  }
  ranked.sort((left, right) => right.score - left.score);
  if (ranked.length === 0) {
    return plan.fallback();
  }
  return pickWithRealism(
    ranked,
    state.shotNumber * 7919 + ranked.length,
    REALISM[difficulty],
  );
}
