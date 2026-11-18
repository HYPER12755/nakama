import {
  FINISH_PROGRESS,
  HOME_COLUMN_START,
  START_INDEX,
  TOKENS_PER_PLAYER,
  activePlayers,
  isBlockedBy,
  isSafeSquare,
  onTrack,
  playerAt,
  tokensOnSquare,
  trackIndex,
} from "./board";
import { normalizeSeed, rollFromSeed } from "./rng";
import {
  DEFAULT_RULES,
  LUDO_COLORS,
  type LudoColor,
  type LudoEvent,
  type LudoMove,
  type LudoRules,
  type LudoState,
  type MoveResult,
} from "./types";

export class LudoMoveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LudoMoveError";
  }
}

export interface CreateGameOptions {
  playerCount?: number;
  seed?: number;
  ai?: boolean[];
  rules?: Partial<LudoRules>;
  /** Colour assigned to each seat, in seat order. */
  colors?: LudoColor[];
  /** Display name for each seat. */
  names?: string[];
  /** Shorten the race to 1-4 tokens per player. */
  tokensPerPlayer?: number;
}

export function createGame(options: CreateGameOptions = {}): LudoState {
  const playerCount = options.playerCount ?? 4;
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 4) {
    throw new LudoMoveError("A Ludo game needs two to four players");
  }
  const tokensPerPlayer = options.tokensPerPlayer ?? TOKENS_PER_PLAYER;
  if (!Number.isInteger(tokensPerPlayer) || tokensPerPlayer < 1 || tokensPerPlayer > TOKENS_PER_PLAYER) {
    throw new LudoMoveError("A race uses one to four tokens per player");
  }
  const chosen = options.colors ?? LUDO_COLORS.slice(0, playerCount);
  if (
    chosen.length < playerCount ||
    chosen.slice(0, playerCount).some((color) => !LUDO_COLORS.includes(color)) ||
    new Set(chosen.slice(0, playerCount)).size !== playerCount
  ) {
    throw new LudoMoveError("Seats must have four different Ludo colours");
  }
  const players = chosen.slice(0, playerCount).map((color, seat) => ({
    seat,
    color,
    name: options.names?.[seat]?.trim() || undefined,
    tokens: Array.from({ length: tokensPerPlayer }, (_, id) => ({
      id,
      location: "home" as const,
      progress: -1,
    })),
    finished: 0,
    ai: options.ai?.[seat] ?? false,
  }));

  return {
    players,
    playerCount,
    tokensPerPlayer,
    current: 0,
    phase: "roll",
    dice: null,
    seed: normalizeSeed(options.seed),
    sixStreak: 0,
    extraTurn: false,
    winner: null,
    ranking: [],
    action: 0,
    events: [],
    rules: { ...DEFAULT_RULES, ...options.rules },
  };
}

export function cloneState(state: LudoState): LudoState {
  return JSON.parse(JSON.stringify(state)) as LudoState;
}

function log(state: LudoState, event: Omit<LudoEvent, "action">): void {
  state.action += 1;
  state.events.push({ ...event, action: state.action });
}

/** Move the turn pointer to the next player who still has tokens to race. */
export function advanceTurn(state: LudoState): void {
  state.extraTurn = false;
  state.dice = null;
  state.sixStreak = 0;
  state.phase = "roll";
  if (state.winner !== null) return;
  let next = state.current;
  for (let step = 0; step < state.playerCount; step += 1) {
    next = (next + 1) % state.playerCount;
    if (playerAt(state, next).finished < state.tokensPerPlayer) {
      state.current = next;
      return;
    }
  }
  state.current = next;
}

/** Shared by a live roll and by a replay, which supplies its recorded value. */
function applyRoll(state: LudoState, value: number, seed: number): void {
  state.seed = seed;
  state.dice = value;
  state.phase = "move";
  log(state, { type: "roll", player: state.current, value, seed });

  if (value === 6) {
    state.sixStreak += 1;
    if (state.rules.threeSixesFoul && state.sixStreak >= 3) {
      log(state, { type: "six-foul", player: state.current });
      advanceTurn(state);
    }
  } else {
    state.sixStreak = 0;
  }
}

/** Roll the server-owned dice. The seed in the state fully determines it. */
export function rollDice(state: LudoState): number {
  if (state.phase !== "roll") {
    throw new LudoMoveError(`Cannot roll while the game is in ${state.phase} phase`);
  }
  if (state.winner !== null) throw new LudoMoveError("The game is over");
  const roll = rollFromSeed(state.seed);
  applyRoll(state, roll.value, roll.seed);
  return roll.value;
}

/** All token moves the current player may legally make after a roll. */
export function legalMoves(state: LudoState): LudoMove[] {
  if (state.phase !== "move" || state.dice === null) return [];
  const player = playerAt(state, state.current);
  const die = state.dice;
  const moves: LudoMove[] = [];

  for (const token of player.tokens) {
    if (token.location === "finished") continue;

    if (token.location === "home") {
      if (state.rules.sixToStart && die !== 6) continue;
      moves.push({
        player: player.seat,
        token: token.id,
        from: -1,
        to: 0,
        leavesHome: true,
        finishes: false,
        captures: [],
        safe: isSafeSquare(START_INDEX[player.color]),
      });
      continue;
    }

    const raw = token.progress + die;
    if (state.rules.exactFinish && raw > FINISH_PROGRESS) continue;
    const to = Math.min(raw, FINISH_PROGRESS);
    let safe = false;
    let allowed = true;
    const captures: { player: number; token: number }[] = [];

    if (to <= 50) {
      const index = trackIndex(player.color, to);
      safe = isSafeSquare(index);
      for (const other of state.players) {
        if (other.seat === player.seat || other.seat >= state.playerCount) continue;
        if (isBlockedBy(state, other.color, index)) {
          allowed = false;
          break;
        }
      }
      if (allowed && !(state.rules.safeSquares && safe)) {
        for (const other of state.players) {
          if (other.seat === player.seat || other.seat >= state.playerCount) continue;
          for (const foe of other.tokens) {
            if (onTrack(foe) && trackIndex(other.color, foe.progress) === index) {
              captures.push({ player: other.seat, token: foe.id });
            }
          }
        }
      }
    }
    if (!allowed) continue;

    moves.push({
      player: player.seat,
      token: token.id,
      from: token.progress,
      to,
      leavesHome: false,
      finishes: to === FINISH_PROGRESS,
      captures,
      safe,
    });
  }
  return moves;
}

/** Apply a legal token move, including captures, extra rolls and the win. */
export function applyMove(state: LudoState, tokenId: number): MoveResult {
  if (state.phase !== "move" || state.dice === null) {
    throw new LudoMoveError(`Cannot move while the game is in ${state.phase} phase`);
  }
  const move = legalMoves(state).find((entry) => entry.token === tokenId);
  if (move === undefined) throw new LudoMoveError(`Token ${tokenId} cannot move`);

  const player = playerAt(state, state.current);
  const token = player.tokens[tokenId]!;

  for (const capture of move.captures) {
    const foe = playerAt(state, capture.player).tokens[capture.token]!;
    foe.location = "home";
    foe.progress = -1;
  }
  if (move.captures.length > 0) {
    log(state, {
      type: "capture",
      player: player.seat,
      token: tokenId,
      captured: move.captures,
    });
  }

  if (move.leavesHome) {
    token.location = "track";
    token.progress = 0;
    log(state, { type: "leave-home", player: player.seat, token: tokenId, from: -1, to: 0 });
  } else {
    token.progress = move.to;
    if (move.finishes) {
      token.location = "finished";
      player.finished += 1;
      log(state, { type: "finish", player: player.seat, token: tokenId, from: move.from, to: move.to });
    } else {
      token.location = move.to >= HOME_COLUMN_START ? "column" : "track";
      log(state, { type: "move", player: player.seat, token: tokenId, from: move.from, to: move.to });
    }
  }

  const wasSix = state.dice === 6;
  const extra =
    (wasSix && state.rules.sixExtra) ||
    (move.captures.length > 0 && state.rules.captureExtra);

  if (player.finished === state.tokensPerPlayer) {
    state.winner = player.seat;
    if (!state.ranking.includes(player.seat)) state.ranking.push(player.seat);
    state.phase = "over";
    state.dice = null;
    state.extraTurn = false;
    log(state, { type: "win", player: player.seat });
    return { move, extra: false, foul: false, won: true, nextPlayer: player.seat };
  }

  if (extra) {
    state.extraTurn = true;
    state.phase = "roll";
    state.dice = null;
    if (!wasSix) state.sixStreak = 0;
    log(state, { type: "extra", player: player.seat });
    return { move, extra: true, foul: false, won: false, nextPlayer: player.seat };
  }

  advanceTurn(state);
  return { move, extra: false, foul: false, won: false, nextPlayer: state.current };
}

/** Give up the turn when the roll cannot move any token. */
export function passTurn(state: LudoState): void {
  if (state.phase !== "move") {
    throw new LudoMoveError(`Cannot pass while the game is in ${state.phase} phase`);
  }
  log(state, { type: "no-move", player: state.current, value: state.dice ?? undefined });
  advanceTurn(state);
}

export interface ReplayStep {
  roll: number;
  seed: number;
  token: number | null;
}

/** Reduce a played game to the only decisions a player makes: which token. */
export function recordReplay(state: LudoState): ReplayStep[] {
  const rolls = state.events.filter((event) => event.type === "roll");
  return rolls.map((roll, index) => {
    const end = index + 1 < rolls.length ? rolls[index + 1]!.action : Number.MAX_SAFE_INTEGER;
    const choice = state.events.find(
      (event) =>
        event.action > roll.action &&
        event.action < end &&
        (event.type === "move" ||
          event.type === "leave-home" ||
          event.type === "finish" ||
          event.type === "no-move" ||
          event.type === "six-foul"),
    );
    return {
      roll: roll.value ?? 1,
      seed: roll.seed ?? state.seed,
      token: choice?.token ?? null,
    };
  });
}

/** Rebuild every intermediate board from a compact recording. */
export function replaySteps(initial: LudoState, steps: ReplayStep[]): LudoState[] {
  const state = cloneState(initial);
  state.events = [];
  state.action = 0;
  const frames: LudoState[] = [cloneState(state)];
  for (const step of steps) {
    if (state.phase !== "roll" || state.winner !== null) break;
    applyRoll(state, step.roll, step.seed);
    // applyRoll mutates the phase; read it through a widened type so the
    // narrowing from the guard above does not hide the live value.
    const phase: string = state.phase;
    if (phase === "move") {
      if (step.token === null) passTurn(state);
      else applyMove(state, step.token);
    }
    frames.push(cloneState(state));
  }
  return frames;
}

/** A short human-readable state summary for logs and tests. */
export function describeState(state: LudoState): string {
  const parts = activePlayers(state).map((seat) => {
    const player = playerAt(state, seat);
    const positions = player.tokens
      .map((token) => (token.location === "home" ? "H" : token.location === "finished" ? "F" : String(trackIndex(player.color, token.progress))))
      .join(",");
    return `P${seat}[${positions}]`;
  });
  return `turn=P${state.current} dice=${state.dice ?? "-"} ${parts.join(" ")}`;
}

/** Number of tokens a player still has on the board or at home. */
export function tokensLeft(state: LudoState, seat: number): number {
  return state.tokensPerPlayer - playerAt(state, seat).finished;
}

/** True when a token occupies the given square, used by the UI for highlights. */
export function squareOccupants(
  state: LudoState,
  color: LudoState["players"][number]["color"],
  index: number,
): number {
  return tokensOnSquare(state, color, index).length;
}
