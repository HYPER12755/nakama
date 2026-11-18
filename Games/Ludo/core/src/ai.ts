import {
  FINISH_PROGRESS,
  HOME_COLUMN_START,
  START_INDEX,
  onTrack,
  playerAt,
  tokensOnSquare,
  trackIndex,
} from "./board";
import { DEFAULT_SEED, aiSeed, nextSeed } from "./rng";
import {
  applyMove,
  createGame,
  legalMoves,
  passTurn,
  rollDice,
} from "./rules";
import type { LudoDifficulty, LudoMove, LudoState } from "./types";

/** A repeatable random stream used only for AI tie-breaks, never for dice. */
function stream(seed: number): () => number {
  let value = seed >>> 0 || DEFAULT_SEED;
  return () => {
    value = nextSeed(value);
    return value / 0x1_0000_0000;
  };
}

/** How exposed a destination is: an opponent within six squares can hit it. */
function threatCount(state: LudoState, move: LudoMove): number {
  if (move.to > 50 || move.safe) return 0;
  const index = trackIndex(playerAt(state, move.player).color, move.to);
  let threats = 0;
  for (const other of state.players) {
    if (other.seat === move.player || other.seat >= state.playerCount) continue;
    for (const token of other.tokens) {
      if (!onTrack(token)) continue;
      const from = trackIndex(other.color, token.progress);
      const distance = (index - from + 52) % 52;
      if (distance >= 1 && distance <= 6) threats += 1;
    }
  }
  return threats;
}

function scoreMove(state: LudoState, move: LudoMove, difficulty: LudoDifficulty, random: () => number): number {
  const player = playerAt(state, move.player);
  let score = random() * (difficulty === "hard" ? 2 : difficulty === "normal" ? 8 : 30);

  if (difficulty === "easy") return score;

  score += move.captures.length * 90;
  if (move.finishes) score += 140;
  if (move.leavesHome) score += 55;
  if (!move.leavesHome && move.to >= HOME_COLUMN_START && move.to < FINISH_PROGRESS) score += 45;
  score += Math.max(0, move.to - move.from);
  if (move.safe) score += 12;
  score += player.finished * 2;

  if (difficulty === "hard") {
    const threats = threatCount(state, move);
    score -= threats * 34;
    const index = move.to <= 50 ? trackIndex(player.color, move.to) : -1;
    if (index >= 0 && tokensOnSquare(state, player.color, index).length >= 1) score += 24;
    if (tokensOnSquare(state, player.color, index).length >= 2) score -= 10;
    // Get the last tokens home before starting new ones when close to winning.
    if (player.finished >= 2 && move.leavesHome) score -= 30;
    if (move.to >= 47 && move.to < FINISH_PROGRESS) score += 18;
  }
  return score;
}

/** Pick a token to move. Returns null when the player must pass. */
export function chooseMove(state: LudoState, difficulty: LudoDifficulty = "normal"): number | null {
  const moves = legalMoves(state);
  if (moves.length === 0) return null;
  const random = stream(aiSeed(state.seed, state.current, state.action));
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = scoreMove(state, move, difficulty, random);
    if (score > bestScore) {
      best = move;
      bestScore = score;
    }
  }
  return best.token;
}

export interface SimulateGameOptions {
  playerCount?: number;
  seed?: number;
  difficulty?: LudoDifficulty;
  ai?: LudoDifficulty[];
  maxActions?: number;
}

/** Play a whole game with AI at every seat. Used for balance and finish tests. */
export function simulateGame(options: SimulateGameOptions = {}): LudoState {
  const playerCount = options.playerCount ?? 4;
  const state = createGame({
    playerCount,
    seed: options.seed,
    ai: Array.from({ length: playerCount }, () => true),
  });
  const levels = options.ai ?? Array.from(
    { length: state.playerCount },
    () => options.difficulty ?? "normal",
  );
  const maxActions = options.maxActions ?? 40_000;
  let steps = 0;
  while (state.phase !== "over" && steps < maxActions) {
    steps += 1;
    if (state.phase === "roll") {
      rollDice(state);
    } else {
      const token = chooseMove(state, levels[state.current] ?? "normal");
      if (token === null) passTurn(state);
      else applyMove(state, token);
    }
  }
  if (state.phase !== "over") throw new Error("Simulated Ludo game did not finish");
  return state;
}

/** The exact starting square of a colour, exposed for board highlights. */
export function homeEntry(color: keyof typeof START_INDEX): number {
  return START_INDEX[color];
}
