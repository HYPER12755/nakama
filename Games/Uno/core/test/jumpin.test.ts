import { describe, expect, it } from "vitest";
import {
  JUMP_WINDOW_MS,
  UNO_ERROR,
  UNO_MODE,
  UNO_MODES,
  applyAction,
  clearJumpWindow,
  createGame,
  isGameMode,
  legalMoves,
  normalizeMode,
  type Action,
  type Card,
  type GameState,
} from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

const yellowSeven: Card = { id: "yellow-7-0", color: "yellow", kind: "number", value: 7 };
const secondYellowSeven: Card = { id: "yellow-7-1", color: "yellow", kind: "number", value: 7 };
const redSeven: Card = { id: "red-7-0", color: "red", kind: "number", value: 7 };
const yellowSix: Card = { id: "yellow-6-0", color: "yellow", kind: "number", value: 6 };
const thirdYellowSeven: Card = { id: "yellow-7-2", color: "yellow", kind: "number", value: 7 };
const yellowSkip: Card = { id: "yellow-skip-0", color: "yellow", kind: "skip" };
const blueSix: Card = { id: "blue-6-0", color: "blue", kind: "number", value: 6 };
const greenSix: Card = { id: "green-6-0", color: "green", kind: "number", value: 6 };

function staged(hand: Card[] = [yellowSeven, blueSix], mode: "jumpIn" | "classic" = "jumpIn"): GameState {
  const game = createGame(424242, players, 0, mode);
  game.turn = 0;
  game.direction = 1;
  game.currentColor = "yellow";
  game.drawnCardId = null;
  game.pendingChallenge = null;
  game.pendingStack = null;
  game.jumpWindow = null;
  game.finished = false;
  game.winner = null;
  game.players[0].hand = hand.slice();
  game.players[1].hand = [secondYellowSeven];
  game.players[2].hand = [greenSix];
  return game;
}

function openWindow(game: GameState, now = 1000): GameState {
  const result = applyAction(game, { type: "play", playerId: "p1", cardId: yellowSeven.id }, now);
  expect(result.ok).toBe(true);
  return result.state;
}

describe("Uno Jump-In mode", () => {
  it("exposes jumpIn as a valid authoritative mode", () => {
    expect(JUMP_WINDOW_MS).toBe(1800);
    expect(UNO_MODE.JUMP_IN).toBe("jumpIn");
    expect(UNO_MODES).toContain("jumpIn");
    expect(isGameMode("jumpIn")).toBe(true);
    expect(normalizeMode("jumpIn")).toBe("jumpIn");
    expect(normalizeMode("bogus")).toBe("classic");
    expect(UNO_ERROR.JUMP_WINDOW_OPEN).toBe("jump_window_open");
    expect(UNO_ERROR.BAD_JUMP).toBe("bad_jump");
    expect(createGame(1, players, 0, "jumpIn").mode).toBe("jumpIn");
    expect(createGame(1, players, 0, "jumpIn").jumpWindow).toBeNull();
  });

  it("opens a window when a number card is played", () => {
    const state = openWindow(staged());
    expect(state.jumpWindow).toEqual({ cardId: yellowSeven.id, ownerId: "p1", expiresAt: 2800 });
    expect(state.finished).toBe(false);
    expect(state.turn).toBe(1);
  });

  it("lets another player jump with an exact number-card match", () => {
    const state = openWindow(staged());
    state.players[1].hand.push(blueSix);
    expect(legalMoves(state, "p2")).toEqual({ cards: [secondYellowSeven.id], canDraw: false });
    expect(legalMoves(state, "p3")).toEqual({ cards: [], canDraw: false });
    const result = applyAction(state, {
      type: "play", playerId: "p2", cardId: secondYellowSeven.id, jump: true,
    }, 1100);
    expect(result.ok).toBe(true);
    expect(result.state.players[1].hand).toEqual([blueSix]);
    expect(result.state.discard.map((card) => card.id)).toEqual([
      expect.any(String), yellowSeven.id, secondYellowSeven.id,
    ]);
    expect(result.state.turn).toBe(2);
    expect(result.state.jumpWindow).toEqual({
      cardId: secondYellowSeven.id, ownerId: "p2", expiresAt: 1100 + JUMP_WINDOW_MS,
    });
    expect(result.state.replay[result.state.replay.length - 1]).toEqual({
      playerId: "p2", action: "jump", cardId: secondYellowSeven.id,
    });
  });

  it("rejects a jump with a non-matching number card", () => {
    const state = openWindow(staged());
    state.players[1].hand = [redSeven, yellowSix];
    for (const card of [redSeven, yellowSix]) {
      const result = applyAction(state, {
        type: "play", playerId: "p2", cardId: card.id, jump: true,
      }, 1100);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("bad_jump");
      expect(result.state).toBe(state);
    }
  });

  it("rejects action-card jumps and jumps without a window", () => {
    const state = openWindow(staged());
    state.players[1].hand = [yellowSkip];
    const actionJump = applyAction(state, {
      type: "play", playerId: "p2", cardId: yellowSkip.id, jump: true,
    }, 1100);
    expect(actionJump.ok).toBe(false);
    expect(actionJump.error).toBe("bad_jump");

    const noWindow = applyAction(staged(), {
      type: "play", playerId: "p2", cardId: secondYellowSeven.id, jump: true,
    }, 1100);
    expect(noWindow.ok).toBe(false);
    expect(noWindow.error).toBe("bad_jump");
  });

  it("blocks the window owner and non-jump actions while the window is open", () => {
    const state = openWindow(staged());
    expect(legalMoves(state, "p1")).toEqual({ cards: [], canDraw: false });
    for (const action of [
      { type: "draw", playerId: "p1" },
      { type: "play", playerId: "p1", cardId: blueSix.id },
      { type: "play", playerId: "p2", cardId: secondYellowSeven.id },
      { type: "draw", playerId: "p2" },
    ] as Action[]) {
      const result = applyAction(state, action, 1100);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("jump_window_open");
      expect(result.state).toBe(state);
    }
  });

  it("clears only an expired window and resumes normal play", () => {
    const state = openWindow(staged());
    expect(clearJumpWindow(state, 2799)).toBe(state);
    const cleared = clearJumpWindow(state, 2800);
    expect(cleared.jumpWindow).toBeNull();
    expect(state.jumpWindow).not.toBeNull();
    expect(cleared.turn).toBe(1);
    expect(legalMoves(cleared, "p2").canDraw).toBe(true);
    const normal = applyAction(cleared, { type: "draw", playerId: "p2" }, 2801);
    expect(normal.ok).toBe(true);
    expect(normal.state.jumpWindow).toBeNull();
    const implicit = applyAction(state, { type: "draw", playerId: "p2" }, 2801);
    expect(implicit.ok).toBe(true);
    expect(implicit.state.jumpWindow).toBeNull();
  });

  it("finishes immediately when a jumper empties their hand", () => {
    const state = staged([yellowSeven, blueSix]);
    state.players[1].hand = [secondYellowSeven];
    const opened = openWindow(state);
    const result = applyAction(opened, {
      type: "play", playerId: "p2", cardId: secondYellowSeven.id, jump: true,
    }, 1100);
    expect(result.ok).toBe(true);
    expect(result.state.finished).toBe(true);
    expect(result.state.winner).toBe("p2");
    expect(result.state.jumpWindow).toBeNull();
  });

  it("allows chained jumps and keeps existing modes unchanged", () => {
    const state = openWindow(staged());
    state.players[1].hand.push(blueSix);
    state.players[2].hand = [thirdYellowSeven, greenSix];
    const first = applyAction(state, {
      type: "play", playerId: "p2", cardId: secondYellowSeven.id, jump: true,
    }, 1100);
    expect(first.ok).toBe(true);
    const second = applyAction(first.state, {
      type: "play", playerId: "p3", cardId: thirdYellowSeven.id, jump: true,
    }, 1200);
    expect(second.ok).toBe(true);
    expect(second.state.turn).toBe(0);
    expect(second.state.jumpWindow).toEqual({
      cardId: thirdYellowSeven.id, ownerId: "p3", expiresAt: 1200 + JUMP_WINDOW_MS,
    });

    const classic = staged([yellowSeven, blueSix], "classic");
    const classicResult = applyAction(classic, {
      type: "play", playerId: "p1", cardId: yellowSeven.id, jump: true,
    }, 1000);
    expect(classicResult.ok).toBe(true);
    expect(classicResult.state.jumpWindow).toBeNull();
    expect(classicResult.state.turn).toBe(1);

    const actionCard = staged([yellowSkip, blueSix]);
    const skipResult = applyAction(actionCard, {
      type: "play", playerId: "p1", cardId: yellowSkip.id,
    }, 1000);
    expect(skipResult.ok).toBe(true);
    expect(skipResult.state.jumpWindow).toBeNull();
    expect(skipResult.state.turn).toBe(2);
  });
});
