import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { UNO_CLIENT_OP, applyAction, createGame, type GameState } from "@moongames/uno-core";
import { buildColourChoosePayload, normalizeView } from "../src/hooks/useUnoGame";
import {
  RULES_MODES,
  rulesModeLabel,
  viewFromCore,
  type BoardView,
} from "../src/lib/view";
import { UnoBoardStage, targetCandidates } from "../src/components/UnoBoardStage";

interface TestWindow {
  document: Document;
  MouseEvent: typeof MouseEvent;
  HTMLElement: typeof HTMLElement;
  Element: typeof Element;
  Node: typeof Node;
  getComputedStyle: typeof getComputedStyle;
  navigator: Navigator;
}

let dom: { window: TestWindow };
let createRoot: typeof import("react-dom/client")["createRoot"];
let container: HTMLElement;

const view: BoardView = {
  players: [
    { seat: 0, userId: "me", username: "You", connected: true, count: 8, hand: [
      { id: "red-draw4-0", color: "red", kind: "draw4" },
      { id: "wilddraw6-0", color: null, kind: "wildDraw6" },
      { id: "wilddraw10-0", color: null, kind: "wildDraw10" },
      { id: "blue-draw2-0", color: "blue", kind: "draw2" },
      { id: "red-7-0", color: "red", kind: "number", value: 7 },
      { id: "wildroulette-0", color: null, kind: "wildRoulette" },
      { id: "red-skipeveryone-0", color: "red", kind: "skipEveryone" },
      { id: "blue-discardall-2", color: "blue", kind: "discardAll" },
    ] },
    { seat: 1, userId: "a", username: "Ana", connected: true, count: 3 },
    { seat: 2, userId: "b", username: "Ben", connected: true, count: 4, out: true },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "yellow-1-0", color: "yellow", kind: "number", value: 1 },
  currentColor: "yellow",
  flipSide: "light",
  turn: 0,
  direction: 1,
  deckCount: 153,
  pendingChallenge: null,
  legalCards: [],
  canDraw: true,
  result: null,
  myUserId: "me",
  started: true,
  mode: "noMercy",
  rulesMode: "noMercy",
};

beforeAll(async () => {
  const { JSDOM: Dom } = (await import("jsdom" as string)) as {
    JSDOM: new (html: string, options?: { url?: string }) => { window: TestWindow };
  };
  dom = new Dom("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost/",
  });
  const globals = globalThis as unknown as Record<string, unknown>;
  globals.window = dom.window;
  globals.document = dom.window.document;
  globals.HTMLElement = dom.window.HTMLElement;
  globals.Element = dom.window.Element;
  globals.Node = dom.window.Node;
  globals.MouseEvent = dom.window.MouseEvent;
  globals.getComputedStyle = dom.window.getComputedStyle;
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(globals, "navigator", {
    value: dom.window.navigator,
    configurable: true,
  });
  ({ createRoot } = await import("react-dom/client"));
  container = dom.window.document.getElementById("root") as HTMLElement;
});

async function mount(nextView: BoardView, handlers: {
  onPlay?: (...args: unknown[]) => void;
  onChooseColour?: (color: string) => void;
  onDraw?: () => void;
} = {}) {
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(UnoBoardStage, {
      view: nextView,
      cardSet: "classic",
      dealKey: 1,
      activeColor: "yellow",
      direction: 1,
      highlight: "lift",
      pileStyle: "stack",
      onPlay: handlers.onPlay ?? (() => undefined),
      onChooseColour: handlers.onChooseColour,
      onDraw: handlers.onDraw ?? (() => undefined),
      onChallenge: () => undefined,
      onUno: () => undefined,
    }));
  });
  return root;
}

async function click(target: Element | null | undefined): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (node) => node.getAttribute("aria-label") === label,
  );
}

describe("Uno No Mercy mode integration", () => {
  it("labels No Mercy and lists it in the rules selector", () => {
    expect(rulesModeLabel("noMercy")).toBe("No Mercy");
    expect(RULES_MODES).toContain("noMercy");
    expect(new Set(RULES_MODES).size).toBe(RULES_MODES.length);
  });

  it("normalizes noMercy pending state from the online payload", () => {
    const normalized = normalizeView({
      started: true,
      rulesMode: "noMercy",
      pendingStack: {
        ownerId: "a", targetId: "me", kind: "wildDraw6", amount: 12, value: 6,
      },
      pendingRoulette: { chooser_id: "me", owner_id: "a" },
      players: [
        { seat: 0, user_id: "me", count: 2, out: false },
        { seat: 1, user_id: "a", count: 3, out: true },
      ],
    }, "me");
    expect(normalized.rulesMode).toBe("noMercy");
    expect(normalized.mode).toBe("noMercy");
    expect(normalized.pendingStack).toMatchObject({
      kind: "wildDraw6", count: 12, value: 6, targetId: "me",
    });
    expect(normalized.pendingRoulette).toEqual({ chooserId: "me", ownerId: "a" });
    expect(normalized.players[1]?.out).toBe(true);
    expect(normalizeView({ pendingRoulette: null }, null).pendingRoulette).toBeNull();
  });

  it("normalizes noMercy state from a local game", () => {
    const state = createGame(13, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "noMercy");
    const local = viewFromCore(state, "local");
    expect(local.rulesMode).toBe("noMercy");
    expect(local.players.every((player) => player.out === false)).toBe(true);
    const pending = {
      ...state,
      pendingStack: {
        kind: "draw4" as const, amount: 8, value: 4, ownerId: "ai1", targetId: "local",
      },
      pendingRoulette: { chooserId: "local", ownerId: "ai1" },
    } as GameState;
    const pendingView = viewFromCore(pending, "local");
    expect(pendingView.pendingStack).toMatchObject({ kind: "draw4", count: 8, value: 4 });
    expect(pendingView.pendingRoulette).toEqual({ chooserId: "local", ownerId: "ai1" });
  });

  it("supports the deterministic online stack then roulette battle", () => {
    const state = createGame(13, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "noMercy");
    expect(state.drawPile.length).toBe(153);
    expect(state.discard[0].id).toBe("yellow-2-0");
    expect(state.players[0].hand.some((card) => card.id === "wilddraw6-1")).toBe(true);
    expect(state.players[0].hand.some((card) => card.id === "wildroulette-3")).toBe(true);

    const stacked = applyAction(state, {
      type: "play", playerId: "local", cardId: "wilddraw6-1", chosenColor: "red",
    });
    expect(stacked.ok).toBe(true);
    expect(stacked.state.pendingStack).toMatchObject({
      kind: "wildDraw6", amount: 6, value: 6, targetId: "ai1", ownerId: "local",
    });
    const taken = applyAction(stacked.state, { type: "draw", playerId: "ai1" });
    expect(taken.ok).toBe(true);
    expect(taken.state.pendingStack).toBeNull();
    expect(taken.state.turn).toBe(0);

    const roulette = applyAction(taken.state, {
      type: "play", playerId: "local", cardId: "wildroulette-3",
    });
    expect(roulette.ok).toBe(true);
    expect(roulette.state.pendingRoulette).toEqual({ chooserId: "ai1", ownerId: "local" });
    const chosen = applyAction(roulette.state, {
      type: "chooseColour", playerId: "ai1", color: "yellow",
    });
    expect(chosen.ok).toBe(true);
    expect(chosen.state.pendingRoulette).toBeNull();
    expect(chosen.state.turn).toBe(0);
  });

  it("excludes eliminated players from target candidates", () => {
    expect(targetCandidates(view).map((player) => player.userId)).toEqual(["a"]);
  });

  it("uses client opcode 108 with a colour payload for roulette", () => {
    expect(UNO_CLIENT_OP.COLOR_CHOOSE).toBe(108);
    expect(buildColourChoosePayload("red")).toEqual({ colour: "red" });
  });

  it("greys out eliminated players and renders new card art", async () => {
    const root = await mount({
      ...view,
      legalCards: ["red-draw4-0"],
    });
    const html = container.innerHTML;
    expect(html).toContain("uno-opponent-hand--out");
    expect(html).toContain("OUT");
    expect(html).toContain("cards/red-draw4-0.svg");
    expect(html).toContain("cards/wilddraw6-0.svg");
    expect(html).toContain("cards/wilddraw10-0.svg");
    expect(html).toContain("cards/wildroulette-0.svg");
    expect(html).toContain("cards/red-skipeveryone-0.svg");
    expect(html).toContain("cards/blue-discardall-2.svg");
    await act(async () => {
      root.unmount();
    });
  });

  it("uses the normal colour picker for Wild Reverse Four and Wild Draw Ten", async () => {
    const onPlay = vi.fn();
    const root = await mount({
      ...view,
      players: [
        { ...view.players[0], hand: [
          { id: "wildreverse4-0", color: null, kind: "wildReverse4" },
          { id: "wilddraw10-1", color: null, kind: "wildDraw10" },
        ] },
        view.players[1],
      ],
      legalCards: ["wildreverse4-0", "wilddraw10-1"],
    }, { onPlay });

    await click(button("Play wildreverse4-0"));
    expect(container.querySelector('[role="dialog"][aria-label="Choose a colour"]')).not.toBeNull();
    await click(button("Choose blue"));
    expect(onPlay).toHaveBeenCalledWith("wildreverse4-0", "blue");

    await click(button("Play wilddraw10-1"));
    await click(button("Choose green"));
    expect(onPlay).toHaveBeenCalledWith("wilddraw10-1", "green");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows the accumulated stack and required minimum with eligible stack cards", async () => {
    const onPlay = vi.fn();
    const onDraw = vi.fn();
    const root = await mount({
      ...view,
      pendingStack: { ownerId: "a", targetId: "me", kind: "wildDraw6", count: 12, value: 6 },
      legalCards: ["wilddraw6-0", "wilddraw10-0"],
    }, { onPlay, onDraw });

    const dialog = container.querySelector('[role="dialog"][aria-label="Pending draw stack"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("12");
    expect(dialog?.textContent).toContain("Minimum to stack: 6");
    const options = dialog?.querySelectorAll(".uno-stack-option") ?? [];
    expect(Array.from(options).map((option) => option.getAttribute("aria-label"))).toEqual([
      "Stack wilddraw6-0", "Stack wilddraw10-0",
    ]);
    expect(dialog?.innerHTML).toContain("cards/wilddraw6-0.svg");
    expect(dialog?.innerHTML).not.toContain("cards/blue-draw2-0.svg");

    await click(button("Take 12"));
    expect(onDraw).toHaveBeenCalledTimes(1);
    await click(button("Stack wilddraw6-0"));
    expect(container.querySelector('[aria-label="Choose a colour"]')).not.toBeNull();
    await click(button("Choose blue"));
    expect(onPlay).toHaveBeenCalledWith("wilddraw6-0", "blue");

    await act(async () => {
      root.unmount();
    });
  });

  it("requires a target for a 7 in No Mercy without offering out players", async () => {
    const onPlay = vi.fn();
    const root = await mount({
      ...view,
      legalCards: ["red-7-0"],
    }, { onPlay });

    await click(button("Play red-7-0"));
    const dialog = container.querySelector('[role="dialog"][aria-label="Choose a target player"]');
    expect(dialog).not.toBeNull();
    const choices = Array.from(dialog?.querySelectorAll(".uno-target-choice") ?? []);
    expect(choices.map((choice) => choice.textContent)).toEqual(["Ana3 cards"]);
    await click(choices[0]);
    expect(onPlay).toHaveBeenCalledWith("red-7-0", undefined, "a", undefined);

    await act(async () => {
      root.unmount();
    });
  });

  it("sends the roulette colour through onChooseColour for the chooser", async () => {
    const onChooseColour = vi.fn();
    const root = await mount({
      ...view,
      pendingRoulette: { chooserId: "me", ownerId: "a" },
    }, { onChooseColour });

    const dialog = container.querySelector('[role="dialog"][aria-label="Choose a colour"]');
    expect(dialog?.textContent).toContain("Wild Colour Roulette");
    await click(button("Choose green"));
    expect(onChooseColour).toHaveBeenCalledWith("green");

    await act(async () => {
      root.unmount();
    });
  });

  it("shows a waiting notice to non-choosers during roulette", async () => {
    const root = await mount({
      ...view,
      pendingRoulette: { chooserId: "a", ownerId: "me" },
    });
    expect(container.innerHTML).toContain("Waiting for a colour");
    expect(container.querySelector('[aria-label="Choose a colour"]')).toBeNull();
    await act(async () => {
      root.unmount();
    });
  });
});
