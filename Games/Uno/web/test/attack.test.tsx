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
    { seat: 0, userId: "me", username: "You", connected: true, count: 3, hand: [
      { id: "red-5-0", color: "red", kind: "number", value: 5 },
      { id: "yellow-hit1-0", color: "yellow", kind: "hit1" },
      { id: "wildattack-0", color: null, kind: "wildAttack" },
    ] },
    { seat: 1, userId: "a", username: "Ana", connected: true, count: 2 },
    { seat: 2, userId: "b", username: "Ben", connected: true, count: 1 },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "yellow-1-0", color: "yellow", kind: "number", value: 1 },
  currentColor: "yellow",
  turn: 0,
  direction: 1,
  deckCount: 10,
  pendingChallenge: null,
  pendingHit: { amount: 2, ownerId: "a", targetId: "me" },
  legalCards: ["yellow-hit1-0", "wildattack-0"],
  canDraw: true,
  result: null,
  myUserId: "me",
  started: true,
  mode: "attack",
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

function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find(
    (node) => node.getAttribute("aria-label") === label,
  );
}

async function click(target: Element | null | undefined): Promise<void> {
  await act(async () => {
    target?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  });
}

async function mount(nextView: BoardView, onPlay = vi.fn(), onDraw = vi.fn()) {
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
      onPlay,
      onDraw,
      onChallenge: () => undefined,
      onUno: () => undefined,
    }));
  });
  return { root, onPlay, onDraw };
}

describe("Uno Attack incoming hit", () => {
  it("shows the accumulated hit and deflect options to the target", async () => {
    const { root, onPlay, onDraw } = await mount(view);
    const dialog = container.querySelector('[role="dialog"][aria-label="Incoming hit"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("Incoming hit");
    expect(dialog?.textContent).toContain("2");
    expect(dialog?.textContent).toContain("Take hit");
    expect(container.innerHTML).toContain("cards/yellow-hit1-0.svg");
    expect(container.innerHTML).toContain("cards/wildattack-0.svg");
    expect(button("Deflect with yellow-hit1-0")).toBeDefined();
    expect(button("Deflect with wildattack-0")).toBeDefined();
    expect(onPlay).not.toHaveBeenCalled();
    expect(onDraw).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("takes the hit through DRAW_REQUEST", async () => {
    const { root, onPlay, onDraw } = await mount(view);
    const take = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent === "Take hit",
    );
    expect(take).toBeDefined();
    await click(take);
    expect(onDraw).toHaveBeenCalledTimes(1);
    expect(onPlay).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("deflects with a Hit card regardless of colour", async () => {
    const { root, onPlay, onDraw } = await mount(view);
    await click(button("Deflect with yellow-hit1-0"));
    expect(onPlay).toHaveBeenCalledWith("yellow-hit1-0");
    expect(onDraw).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });

  it("redirects a Wild Attack deflection after target and colour", async () => {
    const { root, onPlay } = await mount(view);
    await click(button("Deflect with wildattack-0"));

    const targetDialog = container.querySelector('[role="dialog"][aria-label="Choose a target player"]');
    expect(targetDialog).not.toBeNull();
    expect(targetDialog?.textContent).toContain("Redirect the hit");
    const choices = Array.from(targetDialog?.querySelectorAll(".uno-target-choice") ?? []);
    expect(choices.map((choice) => choice.textContent)).toEqual(["Ana2 cards", "Ben1 cards"]);
    await click(choices[1]);
    expect(onPlay).not.toHaveBeenCalled();

    expect(container.querySelector('[role="dialog"][aria-label="Choose a colour"]')).not.toBeNull();
    await click(button("Choose blue"));
    expect(onPlay).toHaveBeenCalledWith("wildattack-0", "blue", "b");

    await act(async () => {
      root.unmount();
    });
  });

  it("does not show the hit overlay to a non-target", async () => {
    const otherView: BoardView = {
      ...view,
      pendingHit: { amount: 1, ownerId: "me", targetId: "a" },
    };
    const { root, onPlay } = await mount(otherView);
    expect(container.querySelector('[role="dialog"][aria-label="Incoming hit"]')).toBeNull();
    expect(onPlay).not.toHaveBeenCalled();

    await act(async () => {
      root.unmount();
    });
  });
});

describe("Uno Attack Wild Attack targeting", () => {
  const freeView: BoardView = {
    ...view,
    pendingHit: null,
    legalCards: ["red-5-0", "wildattack-0"],
  };

  it("asks for a target and then a colour when played normally", async () => {
    const { root, onPlay } = await mount(freeView);
    await click(button("Play wildattack-0"));
    expect(container.querySelector('[role="dialog"][aria-label="Choose a target player"]')).not.toBeNull();
    expect(onPlay).not.toHaveBeenCalled();

    const ana = Array.from(container.querySelectorAll(".uno-target-choice")).find(
      (node) => node.textContent === "Ana2 cards",
    );
    await click(ana);
    expect(container.querySelector('[role="dialog"][aria-label="Choose a colour"]')).not.toBeNull();
    expect(container.innerHTML).toContain("ATTACK");
    expect(onPlay).not.toHaveBeenCalled();

    await click(button("Choose red"));
    expect(onPlay).toHaveBeenCalledWith("wildattack-0", "red", "a");

    await act(async () => {
      root.unmount();
    });
  });

  it("keeps the plain Wild colour picker without a target argument", async () => {
    const wildView: BoardView = {
      ...freeView,
      players: [
        {
          ...freeView.players[0],
          hand: [{ id: "wild-0", color: null, kind: "wild" }],
        },
        freeView.players[1],
        freeView.players[2],
      ],
      legalCards: ["wild-0"],
    };
    const { root, onPlay } = await mount(wildView);
    await click(button("Play wild-0"));
    expect(container.querySelector('[role="dialog"][aria-label="Choose a colour"]')).not.toBeNull();
    expect(container.querySelector('[role="dialog"][aria-label="Choose a target player"]')).toBeNull();
    await click(button("Choose green"));
    expect(onPlay).toHaveBeenCalledWith("wild-0", "green");

    await act(async () => {
      root.unmount();
    });
  });
});
