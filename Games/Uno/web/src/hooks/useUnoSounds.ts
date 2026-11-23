import { useEffect, useRef } from "react";
import type { BoardView } from "../lib/view";
import { configureSound, playSound, startMusic, stopMusic } from "../lib/audio";

interface UnoAudioState {
  view: BoardView;
  dealKey: number;
  error: string | null;
  enabled: boolean;
  musicEnabled: boolean;
  set: string;
  volume: number;
}

interface PreviousState {
  dealKey: number;
  topId: string | null;
  topKind: string | null;
  color: string | null;
  direction: number;
  flipSide: string;
  deckCount: number;
  turn: number;
  counts: string;
  outs: string;
  result: string | null;
  error: string | null;
}

const ACTION_KINDS = new Set([
  "skip", "reverse", "draw2", "draw4", "skipEveryone", "wild4", "wildDraw2",
  "wildDrawColor", "wildDraw6", "wildDraw10", "wildReverse4", "wildRoulette",
  "wildAttack", "wildPowerReverse", "wildNoU", "wildDoubleSpeed", "wildShowdown",
  "wildGrabTower", "modCard", "dare", "wildDare", "showdownNumber", "stack1",
  "stack2", "wildStack3", "wildStackNumber", "grab2Towers", "awSkip", "awSkipTwo",
  "awDrawTwo", "awDrawFour", "awReverse", "awForcedSwap", "awTargetDrawTwo",
  "reverseDraw2", "reverseSkip", "speedUp", "draw1", "draw5",
]);

const SKIP_KINDS = new Set([
  "skip", "skipEveryone", "awSkip", "awSkipTwo", "reverseSkip", "wildRoulette",
]);

const REVERSE_KINDS = new Set([
  "reverse", "wildReverse4", "wildPowerReverse", "awReverse", "reverseDraw2", "reverseSkip",
]);

function stateOf({ view, dealKey, error }: UnoAudioState): PreviousState {
  return {
    dealKey,
    topId: view.topCard?.id ?? null,
    topKind: view.topCard?.kind ?? null,
    color: view.currentColor,
    direction: view.direction,
    flipSide: view.flipSide,
    deckCount: view.deckCount,
    turn: view.turn,
    counts: view.players.map((player) => player.count).join(","),
    outs: view.players.map((player) => (player.out ? "1" : "0")).join(""),
    result: view.result === null ? null : `${view.result.status}:${view.result.winnerUserId ?? ""}`,
    error,
  };
}

function sumCounts(counts: string): number {
  return counts.split(",").filter((value) => value !== "").reduce((total, value) => (
    total + (Number(value) || 0)
  ), 0);
}

export function useUnoSounds(state: UnoAudioState): void {
  const { view, dealKey, error, enabled, musicEnabled, set, volume } = state;
  const previous = useRef<PreviousState>(stateOf(state));

  useEffect(() => {
    configureSound({ set, volume, enabled, musicEnabled });
    if (enabled && musicEnabled) startMusic();
    else stopMusic();
  }, [set, volume, enabled, musicEnabled]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const button = target.closest("button");
      if (button === null) return;
      if (button.closest(".uno-colour") !== null) playSound("colorPick");
      else if (button.closest(".uno-target-choice") !== null) playSound("target");
      else if (button.closest(".uno-call") !== null) playSound("call");
      else playSound("button");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const current = stateOf(state);

  useEffect(() => {
    const before = previous.current;
    previous.current = current;
    if (current.dealKey !== before.dealKey) {
      playSound("round");
      playSound("deal");
      startMusic();
    }
    if (current.topId !== before.topId && current.topId !== null) {
      const kind = current.topKind;
      if (kind !== null && REVERSE_KINDS.has(kind)) playSound("reverse");
      else if (kind !== null && SKIP_KINDS.has(kind)) playSound("freeze");
      else if (kind !== null && ACTION_KINDS.has(kind)) playSound("action");
      else playSound("flip");
    }
    if (current.color !== before.color && before.color !== null) playSound("color");
    if (current.direction !== before.direction) playSound("direction");
    if (current.flipSide !== before.flipSide && before.flipSide !== "") playSound("flip");
    if (current.deckCount > before.deckCount) playSound("shuffle");
    if (sumCounts(current.counts) > sumCounts(before.counts) && current.topId !== null) playSound("draw");
    if (current.outs !== before.outs && current.outs.includes("1")) playSound("eliminated");
    if (current.turn !== before.turn && view.started) playSound("alert");
    if (current.result !== before.result && current.result !== null) {
      stopMusic();
      playSound("result");
      playSound("point");
      if (!current.result.endsWith(":")) playSound("winner");
    }
    if (current.error !== before.error && current.error !== null) playSound("warning");
  }, [
    current.dealKey, current.topId, current.topKind, current.color, current.direction,
    current.flipSide, current.deckCount, current.turn, current.counts, current.outs,
    current.result, current.error, view.started,
  ]);

  useEffect(() => () => stopMusic(), []);
}
