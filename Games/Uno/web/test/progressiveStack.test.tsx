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
    { seat: 0, userId: "me", username: "You", connected: true, count: 1, hand: [] },
    { seat: 1, userId: "a", username: "Ana", connected: true, count: 3 },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "red-draw2-0", color: "red", kind: "draw2" },
  currentColor: "red",
  turn: 0,
  direction: 1,
  deckCount: 10,
  pendingChallenge: null,
  pendingStack: null,
  legalCards: [],
  canDraw: true,
  result: null,
  myUserId: "me",
  started: true,
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

function buttonWithText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (button) => button.textContent === text,
  );
}

describe("Uno progressive pending stack", () => {
  it("takes the accumulated cards through DRAW_REQUEST", async () => {
    const onDraw = vi.fn();
    const onPlay = vi.fn();
    const stackView: BoardView = {
      ...view,
      pendingStack: { ownerId: "a", targetId: "me", kind: "draw2", count: 6 },
    };
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view: stackView,
        cardSet: "classic",
        dealKey: 1,
        activeColor: "red",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay,
        onDraw,
        onChallenge: () => undefined,
        onUno: () => undefined,
      }));
    });

    const take = buttonWithText("Take 6");
    expect(take).toBeDefined();
    await act(async () => {
      take?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("stacks a held Draw Two", async () => {
    const onPlay = vi.fn();
    const stackView: BoardView = {
      ...view,
      players: [
        {
          ...view.players[0],
          hand: [{ id: "blue-draw2-0", color: "blue", kind: "draw2" }],
        },
        view.players[1],
      ],
      pendingStack: { ownerId: "a", targetId: "me", kind: "draw2", count: 2 },
      legalCards: ["blue-draw2-0"],
    };
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view: stackView,
        cardSet: "classic",
        dealKey: 2,
        activeColor: "red",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay,
        onDraw: () => undefined,
        onChallenge: () => undefined,
        onUno: () => undefined,
      }));
    });

    const stack = buttonWithText("Stack Draw Two");
    expect(stack).toBeDefined();
    await act(async () => {
      stack?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(onPlay).toHaveBeenCalledWith("blue-draw2-0");

    await act(async () => {
      root.unmount();
    });
  });

  it("opens the colour picker when stacking a Wild Four", async () => {
    const onPlay = vi.fn();
    const stackView: BoardView = {
      ...view,
      players: [
        {
          ...view.players[0],
          hand: [{ id: "wild4-0", color: null, kind: "wild4" }],
        },
        view.players[1],
      ],
      pendingStack: { ownerId: "a", targetId: "me", kind: "wild4", count: 4 },
      legalCards: ["wild4-0"],
    };
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view: stackView,
        cardSet: "classic",
        dealKey: 3,
        activeColor: "red",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay,
        onDraw: () => undefined,
        onChallenge: () => undefined,
        onUno: () => undefined,
      }));
    });

    const stack = buttonWithText("Stack Wild Four");
    expect(stack).toBeDefined();
    await act(async () => {
      stack?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(container.querySelector('[role="dialog"][aria-label="Choose a colour"]')).not.toBeNull();
    expect(onPlay).not.toHaveBeenCalled();

    const blue = Array.from(container.querySelectorAll("button")).find(
      (button) => button.getAttribute("aria-label") === "Choose blue",
    );
    await act(async () => {
      blue?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(onPlay).toHaveBeenCalledWith("wild4-0", "blue");

    await act(async () => {
      root.unmount();
    });
  });

  it("offers take, stack and challenge together for a Wild Four chain", async () => {
    const onChallenge = vi.fn();
    const stackView: BoardView = {
      ...view,
      players: [
        {
          ...view.players[0],
          hand: [{ id: "wild4-1", color: null, kind: "wild4" }],
        },
        view.players[1],
      ],
      pendingStack: { ownerId: "a", targetId: "me", kind: "wild4", count: 8 },
      pendingChallenge: { ownerId: "a", targetId: "me", legal: true },
      legalCards: ["wild4-1"],
    };
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view: stackView,
        cardSet: "classic",
        dealKey: 4,
        activeColor: "red",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay: () => undefined,
        onDraw: () => undefined,
        onChallenge,
        onUno: () => undefined,
      }));
    });

    const dialog = container.querySelector('[role="dialog"][aria-label="Pending draw stack"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Take 8");
    expect(dialog?.textContent).toContain("Stack Wild Four");
    const challenge = buttonWithText("Challenge");
    expect(challenge).toBeDefined();
    await act(async () => {
      challenge?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
    expect(onChallenge).toHaveBeenCalledWith(true);

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the standalone challenge overlay when there is no pending stack", async () => {
    const challengeView: BoardView = {
      ...view,
      pendingChallenge: { ownerId: "a", targetId: "me", legal: true },
    };
    let root: ReturnType<typeof createRoot>;
    await act(async () => {
      root = createRoot(container);
      root.render(createElement(UnoBoardStage, {
        view: challengeView,
        cardSet: "classic",
        dealKey: 5,
        activeColor: "red",
        direction: 1,
        highlight: "lift",
        pileStyle: "stack",
        onPlay: () => undefined,
        onDraw: () => undefined,
        onChallenge: () => undefined,
        onUno: () => undefined,
      }));
    });

    const html = container.innerHTML;
    expect(html).toContain("Challenge the play?");
    expect(html).toContain("Take 4");
    expect(html).not.toContain('aria-label="Pending draw stack"');

    await act(async () => {
      root.unmount();
    });
  });
});
