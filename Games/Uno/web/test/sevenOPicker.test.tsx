import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import type { BoardView } from "../src/lib/view";
import { UnoBoardStage } from "../src/components/UnoBoardStage";

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
    { seat: 0, userId: "me", username: "You", connected: true, count: 2, hand: [
      { id: "red-7-0", color: "red", kind: "number", value: 7 },
    ] },
    { seat: 1, userId: "a", username: "Ana", connected: true, count: 3 },
    { seat: 2, userId: "b", username: "Ben", connected: true, count: 4 },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "yellow-1-0", color: "yellow", kind: "number", value: 1 },
  currentColor: "yellow",
  flipSide: "light",
  turn: 0,
  direction: 1,
  deckCount: 10,
  pendingChallenge: null,
  legalCards: ["red-7-0"],
  canDraw: true,
  result: null,
  myUserId: "me",
  started: true,
  mode: "sevenO",
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

describe("Uno Seven-O target picker", () => {
  it("offers other players for a 7 and forwards the picked target", async () => {
    const onPlay = vi.fn();
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view,
        cardSet: "classic",
        dealKey: 1,
        activeColor: "yellow",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay,
        onDraw: () => undefined,
        onChallenge: () => undefined,
        onUno: () => undefined,
      }));
    });

    const seven = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Play red-7-0",
    );
    expect(seven).toBeDefined();
    await act(async () => {
      seven?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });

    const dialog = container.querySelector('[role="dialog"][aria-label="Choose a target player"]');
    expect(dialog).not.toBeNull();
    const choices = Array.from(dialog?.querySelectorAll(".uno-target-choice") ?? []);
    expect(choices.map((choice) => choice.textContent)).toEqual(["Ana3 cards", "Ben4 cards"]);

    await act(async () => {
      choices[1]?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(onPlay).toHaveBeenCalledWith("red-7-0", undefined, "b", undefined);

    await act(async () => {
      root.unmount();
    });
  });

  it("does not open a picker for a 0 in Seven-O", async () => {
    const onPlay = vi.fn();
    const zeroView: BoardView = {
      ...view,
      players: [
        { ...view.players[0], hand: [
          { id: "red-0-0", color: "red", kind: "number", value: 0 },
        ] },
        view.players[1],
      ],
      legalCards: ["red-0-0"],
    };
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view: zeroView,
        cardSet: "classic",
        dealKey: 2,
        activeColor: "yellow",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay,
        onDraw: () => undefined,
        onChallenge: () => undefined,
        onUno: () => undefined,
      }));
    });

    const zero = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Play red-0-0",
    );
    await act(async () => {
      zero?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector(".uno-target-choice")).toBeNull();
    expect(onPlay).toHaveBeenCalledWith("red-0-0");

    await act(async () => {
      root.unmount();
    });
  });
});
