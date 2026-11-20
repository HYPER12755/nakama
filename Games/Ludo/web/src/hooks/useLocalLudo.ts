import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyMove as applyCoreMove,
  chooseMove,
  cloneState,
  createGame,
  legalMoves,
  passTurn,
  recordReplay,
  replaySteps,
  rollDice,
  type LudoColor,
  type LudoDifficulty,
  type LudoMove,
  type LudoRules,
  type LudoState,
} from "@moongames/ludo-core";
import { recordLocalGame, type LocalGameRecord } from "../lib/localProgress";
import { playLudoSound } from "../lib/sound";
import { isSafeSquare } from "@moongames/ludo-core";

export interface LocalGameOptions {
  seats: number;
  humanSeats: number;
  difficulty: LudoDifficulty;
  seed?: number;
  sound?: boolean;
  enabled?: boolean;
  aiDelay?: number;
  rules?: Partial<LudoRules>;
  animationMs?: number;
  colors?: LudoColor[];
  names?: string[];
  tokensPerPlayer?: number;
  /** Explicit per-seat roles override the simple human-count control. */
  seatHuman?: boolean[];
  seatDifficulty?: LudoDifficulty[];
  /** Seat that takes the first turn; omit for the default seat 1. */
  startSeat?: number;
  startMode?: "normal" | "reverse" | "random";
}

/** A computer player should feel like someone thinking at the table, not a
 * script burning through turns. Each action gets a deliberate pause. */
const DEFAULT_AI_DELAY_MS = 850;

function aiFlags(options: Pick<LocalGameOptions, "seats" | "humanSeats" | "seatHuman">): boolean[] {
  return Array.from({ length: options.seats }, (_, seat) => options.seatHuman
    ? !(options.seatHuman[seat] ?? seat < options.humanSeats)
    : seat >= options.humanSeats);
}

function withStartSeat(state: LudoState, start: number | undefined): LudoState {
  if (start !== undefined && start >= 0 && start < state.playerCount) state.current = start;
  return state;
}

function startingSeat(options: Pick<LocalGameOptions, "seats" | "startSeat" | "startMode">): number | undefined {
  if (options.startMode === "random") return Math.floor(Math.random() * options.seats);
  return options.startSeat;
}

export function useLocalLudo(options: LocalGameOptions) {
  const [game, setGame] = useState<LudoState>(() => withStartSeat(createGame({
    playerCount: options.seats,
    seed: options.seed,
    ai: aiFlags(options),
    rules: options.rules,
    colors: options.colors,
    names: options.names,
    tokensPerPlayer: options.tokensPerPlayer,
  }), startingSeat(options)));
  const [lastMove, setLastMove] = useState<LudoMove | null>(null);
  const [steps, setSteps] = useState<LocalGameRecord["steps"]>([]);
  const [replayFrames, setReplayFrames] = useState<LudoState[] | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The token animation owns the board until its last hop has landed. */
  const busyUntil = useRef(0);
  const history = useRef<LudoState[]>([]);
  const stepsRef = useRef<LocalGameRecord["steps"]>([]);
  const gameRef = useRef(game);
  const optionsRef = useRef(options);
  gameRef.current = game;
  optionsRef.current = options;

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  const newGame = useCallback((overrides: Partial<LocalGameOptions> = {}) => {
    clearTimer();
    busyUntil.current = 0;
    history.current = [];
    setCanUndo(false);
    const next = { ...optionsRef.current, ...overrides };
    optionsRef.current = next;
    const fresh = withStartSeat(createGame({
      playerCount: next.seats,
      seed: next.seed,
      ai: aiFlags(next),
      rules: next.rules,
      colors: next.colors,
      names: next.names,
      tokensPerPlayer: next.tokensPerPlayer,
    }), startingSeat(next));
    gameRef.current = fresh;
    setGame(fresh);
    setLastMove(null);
    setSteps([]);
    stepsRef.current = [];
    setReplayFrames(null);
    setReplayIndex(0);
  }, [clearTimer]);

  const roll = useCallback(() => {
    clearTimer();
    const previous = gameRef.current;
    if (previous.phase !== "roll" || previous.winner !== null) return;
    history.current = [...history.current, cloneState(previous)].slice(-40);
    setCanUndo(true);
    const next = cloneState(previous);
    try {
      rollDice(next);
    } catch {
      return;
    }
    if (optionsRef.current.sound !== false) playLudoSound("roll");
    if (next.phase === "move" && legalMoves(next).length === 0) {
      if (optionsRef.current.sound !== false) playLudoSound("foul");
      passTurn(next);
      if (optionsRef.current.sound !== false) playLudoSound("turn");
    }
    gameRef.current = next;
    setGame(next);
  }, [clearTimer]);

  const move = useCallback((token: number) => {
    clearTimer();
    const previous = gameRef.current;
    if (previous.phase !== "move") return;
    if (token < 0) {
      history.current = [...history.current, cloneState(previous)].slice(-40);
    setCanUndo(true);
      const passed = cloneState(previous);
      passTurn(passed);
      gameRef.current = passed;
      setGame(passed);
      return;
    }
    const chosen = legalMoves(previous).find((entry) => entry.token === token);
    if (!chosen) return;
    history.current = [...history.current, cloneState(previous)].slice(-40);
    setCanUndo(true);
    const next = cloneState(previous);
    const result = applyCoreMove(next, token);
    gameRef.current = next;
    setGame(next);
    setLastMove(chosen);
    const stepCount = chosen.leavesHome ? 1 : Math.max(1, chosen.to - Math.max(0, chosen.from));
    busyUntil.current = Date.now() + stepCount * (optionsRef.current.animationMs ?? 135) + 80;
    const record = { color: previous.players[previous.current]!.color, token, to: chosen.to };
    stepsRef.current = [...stepsRef.current, record];
    setSteps(stepsRef.current);
    if (optionsRef.current.sound !== false) {
      if (chosen.captures.length > 0) playLudoSound("capture");
      else if (chosen.finishes) playLudoSound("home");
      else playLudoSound("move");
      if (!chosen.leavesHome && chosen.to >= 0 && isSafeSquare(chosen.to)) {
        playLudoSound("safe");
      }
      if (result.won) playLudoSound("win");
    }
    if (result.won) recordLocalGame(next, stepsRef.current);
  }, [clearTimer]);

  useEffect(() => {
    clearTimer();
    const current = game;
    if (options.enabled === false || current.winner !== null || current.phase === "over") return;
    const player = current.players[current.current];
    if (!player?.ai) return;
    timer.current = setTimeout(() => {
      if (current.phase === "roll") roll();
      else {
        const level = optionsRef.current.seatDifficulty?.[current.current] ?? optionsRef.current.difficulty;
        const token = chooseMove(current, level);
        if (token === null) {
          const previous = gameRef.current;
          const next = cloneState(previous);
          passTurn(next);
          gameRef.current = next;
          setGame(next);
        } else move(token);
      }
    }, Math.max(
      optionsRef.current.aiDelay ?? DEFAULT_AI_DELAY_MS,
      busyUntil.current - Date.now(),
    ));
    return clearTimer;
  }, [game, clearTimer, move, roll, options.enabled]);

  const legalTokens = useMemo(
    () => game.phase === "move" ? legalMoves(game).map((entry) => entry.token) : [],
    [game],
  );

  const undo = useCallback(() => {
    clearTimer();
    const previous = history.current.pop();
    if (!previous) return;
    gameRef.current = previous;
    setGame(previous);
    setCanUndo(history.current.length > 0);
    setLastMove(null);
    stepsRef.current = stepsRef.current.slice(0, -1);
    setSteps(stepsRef.current);
    busyUntil.current = 0;
  }, [clearTimer]);

  const startReplay = useCallback(() => {
    const frames = replaySteps(game, recordReplay(game));
    if (frames.length < 2) return;
    setReplayFrames(frames);
    setReplayIndex(0);
  }, [game]);

  const stopReplay = useCallback(() => {
    setReplayFrames(null);
    setReplayIndex(0);
  }, []);

  const replayGame = replayFrames ? replayFrames[Math.min(replayIndex, replayFrames.length - 1)]! : game;

  return {
    game: replayGame,
    realGame: game,
    legalTokens,
    lastMove,
    steps,
    isReplaying: replayFrames !== null,
    replayIndex,
    replayCount: replayFrames?.length ?? 0,
    setReplayIndex,
    startReplay,
    stopReplay,
    roll,
    move,
    undo,
    canUndo,
    newGame,
  };
}
