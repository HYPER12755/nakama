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
  type LudoDifficulty,
  type LudoMove,
  type LudoState,
} from "@moongames/ludo-core";
import { recordLocalGame, type LocalGameRecord } from "../lib/localProgress";
import { playLudoSound } from "../lib/sound";

export interface LocalGameOptions {
  seats: number;
  humanSeats: number;
  difficulty: LudoDifficulty;
  seed?: number;
  sound?: boolean;
  enabled?: boolean;
}

const AI_DELAY_MS = 520;

export function useLocalLudo(options: LocalGameOptions) {
  const [game, setGame] = useState<LudoState>(() => createGame({
    playerCount: options.seats,
    seed: options.seed,
    ai: Array.from({ length: options.seats }, (_, seat) => seat >= options.humanSeats),
  }));
  const [lastMove, setLastMove] = useState<LudoMove | null>(null);
  const [steps, setSteps] = useState<LocalGameRecord["steps"]>([]);
  const [replayFrames, setReplayFrames] = useState<LudoState[] | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const next = { ...optionsRef.current, ...overrides };
    optionsRef.current = next;
    const fresh = createGame({
      playerCount: next.seats,
      seed: next.seed,
      ai: Array.from({ length: next.seats }, (_, seat) => seat >= next.humanSeats),
    });
    gameRef.current = fresh;
    setGame(fresh);
    setLastMove(null);
    setSteps([]);
    setReplayFrames(null);
    setReplayIndex(0);
  }, [clearTimer]);

  const roll = useCallback(() => {
    clearTimer();
    const previous = gameRef.current;
    if (previous.phase !== "roll" || previous.winner !== null) return;
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
    }
    gameRef.current = next;
    setGame(next);
  }, [clearTimer]);

  const move = useCallback((token: number) => {
    clearTimer();
    const previous = gameRef.current;
    if (previous.phase !== "move") return;
    const chosen = legalMoves(previous).find((entry) => entry.token === token);
    if (!chosen) return;
    const next = cloneState(previous);
    const result = applyCoreMove(next, token);
    gameRef.current = next;
    setGame(next);
    setLastMove(chosen);
    const record = { color: previous.players[previous.current]!.color, token, to: chosen.to };
    setSteps((current) => [...current, record]);
    if (optionsRef.current.sound !== false) {
      if (chosen.captures.length > 0) playLudoSound("capture");
      else if (chosen.finishes) playLudoSound("home");
      else playLudoSound("move");
      if (result.won) playLudoSound("win");
    }
    if (result.won) recordLocalGame(next, [...steps, record]);
  }, [clearTimer, steps]);

  useEffect(() => {
    clearTimer();
    const current = game;
    if (options.enabled === false || current.winner !== null || current.phase === "over") return;
    const player = current.players[current.current];
    if (!player?.ai) return;
    timer.current = setTimeout(() => {
      if (current.phase === "roll") roll();
      else {
        const token = chooseMove(current, optionsRef.current.difficulty);
        if (token === null) {
          setGame((previous) => {
            const next = cloneState(previous);
            passTurn(next);
            return next;
          });
        } else move(token);
      }
    }, AI_DELAY_MS);
    return clearTimer;
  }, [game, clearTimer, move, roll, options.enabled]);

  const legalTokens = useMemo(
    () => game.phase === "move" ? legalMoves(game).map((entry) => entry.token) : [],
    [game],
  );

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
    newGame,
  };
}
