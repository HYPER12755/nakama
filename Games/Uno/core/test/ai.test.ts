import { describe, expect, it } from "vitest";
import {
  applyAction,
  chooseAction,
  cloneState,
  createGame,
  legalMoves,
  type Action,
  type Card,
  type GameState,
} from "../src/index";

const players = [
  { id: "p1", name: "One" },
  { id: "p2", name: "Two" },
  { id: "p3", name: "Three" },
];

describe("Uno classic AI", () => {
  it("always chooses a legal action", () => {
    let state = createGame(123456789, [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
    ]);
    for (let step = 0; step < 200 && !state.finished; step += 1) {
      const actorId = state.pendingChallenge !== null
        ? state.pendingChallenge.targetId
        : state.players[state.turn].id;
      const action = chooseAction(state, actorId);
      expect(action).not.toBeNull();
      if (action === null) break;
      const moves = legalMoves(state, action.playerId);
      if (action.type === "play") {
        expect(moves.cards).toContain(action.cardId);
      }
      const result = applyAction(state, action);
      expect(result.ok).toBe(true);
      state = result.state;
    }
  });

  it("picks the same card for the same state", () => {
    const state = createGame(42, [
      { id: "p1", name: "One" },
      { id: "p2", name: "Two" },
    ]);
    expect(chooseAction(state, "p1")).toEqual(chooseAction(state, "p1"));
  });
});

describe("Uno Seven-O AI", () => {
  const seven: Card = { id: "red-7-0", color: "red", kind: "number", value: 7 };
  const filler = (index: number): Card => ({
    id: `blue-${index}-0`,
    color: "blue",
    kind: "number",
    value: index,
  });

  function staged(twoCounts: number[], threeCounts: number[]) {
    const state = createGame(7, players, 0, "sevenO");
    state.turn = 0;
    state.direction = 1;
    state.currentColor = "red";
    state.drawnCardId = null;
    state.pendingChallenge = null;
    state.players[0].hand = [seven];
    state.players[1].hand = twoCounts.map(filler);
    state.players[2].hand = threeCounts.map(filler);
    return state;
  }

  it("targets the opponent with the most cards", () => {
    const state = staged([1, 2, 3], [1, 2]);
    const action = chooseAction(state, "p1");
    expect(action).toEqual({ type: "play", playerId: "p1", cardId: seven.id, targetId: "p2" });
    expect(applyAction(state, action as Action).ok).toBe(true);
  });

  it("breaks target ties by player order", () => {
    const state = staged([1, 2], [3, 4]);
    const action = chooseAction(state, "p1");
    expect(action).toEqual({ type: "play", playerId: "p1", cardId: seven.id, targetId: "p2" });
  });

  it("never returns an invalid seven target", () => {
    const state = staged([1, 2], [1]);
    const action = chooseAction(state, "p1");
    if (action?.type === "play") {
      expect(state.players.some((player) => player.id === action.targetId && player.id !== "p1")).toBe(true);
    }
    expect(applyAction(state, action as Action).ok).toBe(true);
  });
});

describe("Uno Jump-In AI", () => {
  const yellowSeven: Card = { id: "yellow-7-0", color: "yellow", kind: "number", value: 7 };
  const matchingSeven: Card = { id: "yellow-7-1", color: "yellow", kind: "number", value: 7 };
  const otherCard: Card = { id: "blue-3-0", color: "blue", kind: "number", value: 3 };

  function stagedWindow(p2Hand: Card[]): GameState {
    const state = createGame(555, players, 0, "jumpIn");
    state.turn = 0;
    state.direction = 1;
    state.currentColor = "yellow";
    state.drawnCardId = null;
    state.players[0].hand = [yellowSeven, otherCard];
    state.players[1].hand = p2Hand;
    state.players[2].hand = [otherCard];
    const played = applyAction(state, {
      type: "play", playerId: "p1", cardId: yellowSeven.id,
    }, 1000);
    expect(played.ok).toBe(true);
    return played.state;
  }

  it("jumps with an exact matching card during an open window", () => {
    const state = stagedWindow([matchingSeven, otherCard]);
    expect(chooseAction(state, "p2", 1100)).toEqual({
      type: "play", playerId: "p2", cardId: matchingSeven.id, jump: true,
    });
    expect(chooseAction(state, "p1", 1100)).toBeNull();
    expect(chooseAction(state, "p3", 1100)).toBeNull();
  });

  it("waits without a match and resumes normal play after the window", () => {
    const state = stagedWindow([otherCard]);
    expect(chooseAction(state, "p2", 1100)).toBeNull();
    expect(chooseAction(state, "p2", 3000)).toEqual({ type: "draw", playerId: "p2" });
  });
});

describe("Uno Progressive AI", () => {
  const drawTwo: Card = { id: "blue-draw2-0", color: "blue", kind: "draw2" };
  const otherDrawTwo: Card = { id: "green-draw2-0", color: "green", kind: "draw2" };
  const wildFour: Card = { id: "wild4-0", color: null, kind: "wild4" };
  const otherWildFour: Card = { id: "wild4-1", color: null, kind: "wild4" };
  const blueZero: Card = { id: "blue-0-0", color: "blue", kind: "number", value: 0 };
  const greenZero: Card = { id: "green-0-0", color: "green", kind: "number", value: 0 };

  function stagedProgressive(hand: Card[], color: string): GameState {
    const state = createGame(9001, players, 0, "progressive");
    state.turn = 0;
    state.direction = 1;
    state.currentColor = color as GameState["currentColor"];
    state.drawnCardId = null;
    state.pendingChallenge = null;
    state.pendingStack = null;
    state.finished = false;
    state.winner = null;
    state.players[0].hand = hand.slice();
    return state;
  }

  function drawStack(): GameState {
    const played = applyAction(stagedProgressive([drawTwo, blueZero], "blue"), {
      type: "play",
      playerId: "p1",
      cardId: drawTwo.id,
    });
    return played.state;
  }

  function wildStack(hand: Card[], color: string, chosenColor: string): GameState {
    const played = applyAction(stagedProgressive(hand, color), {
      type: "play",
      playerId: "p1",
      cardId: wildFour.id,
      chosenColor: chosenColor as GameState["currentColor"],
    });
    return played.state;
  }

  it("stacks a matching Draw Two when responding to a stack", () => {
    const state = cloneState(drawStack());
    state.players[1].hand = [otherDrawTwo];
    expect(chooseAction(state, "p2")).toEqual({
      type: "play",
      playerId: "p2",
      cardId: otherDrawTwo.id,
    });
  });

  it("takes the stack without a matching Draw Two", () => {
    const state = cloneState(drawStack());
    state.players[1].hand = [blueZero];
    expect(chooseAction(state, "p2")).toEqual({ type: "draw", playerId: "p2" });
  });

  it("stacks a Wild Four with a chosen colour when holding one", () => {
    const state = cloneState(wildStack([wildFour, blueZero], "red", "green"));
    state.players[1].hand = [otherWildFour, blueZero];
    const action = chooseAction(state, "p2");
    expect(action?.type).toBe("play");
    if (action?.type === "play") {
      expect(action.cardId).toBe(otherWildFour.id);
      expect(action.chosenColor).toBeDefined();
    }
    expect(applyAction(state, action as Action).ok).toBe(true);
  });

  it("challenges a guilty stacked Wild Four and takes an innocent one", () => {
    const guilty = cloneState(wildStack([wildFour, greenZero], "green", "blue"));
    guilty.players[1].hand = [blueZero];
    expect(chooseAction(guilty, "p2")).toEqual({
      type: "challenge",
      playerId: "p2",
      accept: true,
    });

    const innocent = cloneState(wildStack([wildFour, blueZero], "red", "green"));
    innocent.players[1].hand = [blueZero];
    expect(chooseAction(innocent, "p2")).toEqual({
      type: "challenge",
      playerId: "p2",
      accept: false,
    });
  });
});
