import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ALL_COLORS,
  DARK_COLORS,
  LIGHT_COLORS,
  applyAction,
  colorsForSide,
  createGame,
  type GameState,
} from "@moongames/uno-core";
import { UnoBoardStage } from "../src/components/UnoBoardStage";
import { UnoOnlinePanel } from "../src/components/UnoOnlinePanel";
import { normalizeView, type UnoController } from "../src/hooks/useUnoGame";
import {
  RULES_MODES,
  normalizeFlipSide,
  normalizePendingChallenge,
  normalizeRulesMode,
  rulesModeLabel,
  viewFromCore,
  type BoardView,
} from "../src/lib/view";

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
      { id: "light-red-1-0", color: "red", kind: "number", value: 1 },
      { id: "light-red-flip-0", color: "red", kind: "flip" },
      { id: "light-wild-0", color: null, kind: "wild" },
    ] },
    { seat: 1, userId: "them", username: "Rival", connected: true, count: 4 },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "light-red-1-0", color: "red", kind: "number", value: 1 },
  currentColor: "red",
  flipSide: "light",
  turn: 0,
  direction: 1,
  deckCount: 20,
  pendingChallenge: null,
  legalCards: ["light-red-1-0", "light-red-flip-0", "light-wild-0"],
  canDraw: true,
  result: null,
  myUserId: "me",
  started: true,
  mode: "flip",
  rulesMode: "flip",
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

async function mount(nextView: BoardView, onPlay = vi.fn(), onChooseColour = vi.fn()) {
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(UnoBoardStage, {
      view: nextView,
      cardSet: "classic",
      dealKey: 1,
      activeColor: nextView.currentColor,
      direction: 1,
      highlight: "lift",
      pileStyle: "stack",
      rulesMode: "flip",
      onPlay,
      onChooseColour,
      onDraw: () => undefined,
      onChallenge: () => undefined,
      onUno: () => undefined,
    }));
  });
  return { root, onPlay, onChooseColour };
}

function staticHtml(nextView: BoardView, cardSet: "classic" | "neon" = "classic"): string {
  return renderToStaticMarkup(
    <UnoBoardStage
      view={nextView}
      cardSet={cardSet}
      dealKey={1}
      activeColor={nextView.currentColor}
      direction={1}
      highlight="lift"
      pileStyle="stack"
      rulesMode="flip"
      onPlay={() => undefined}
      onDraw={() => undefined}
      onChallenge={() => undefined}
      onUno={() => undefined}
    />,
  );
}

describe("Uno Flip rules and side normalization", () => {
  it("labels Flip and lists it once in the rules selector", () => {
    expect(rulesModeLabel("flip")).toBe("Flip");
    expect(rulesModeLabel(normalizeRulesMode("flip"))).toBe("Flip");
    expect(RULES_MODES).toContain("flip");
    expect(new Set(RULES_MODES).size).toBe(RULES_MODES.length);
  });

  it("normalizes flipSide with a light default from online and local state", () => {
    expect(normalizeFlipSide("dark")).toBe("dark");
    expect(normalizeFlipSide("light")).toBe("light");
    expect(normalizeFlipSide(undefined)).toBe("light");
    expect(normalizeFlipSide("purple")).toBe("light");

    const online = normalizeView({ rulesMode: "flip", flipSide: "dark" }, null);
    expect(online.rulesMode).toBe("flip");
    expect(online.mode).toBe("flip");
    expect(online.flipSide).toBe("dark");
    expect(normalizeView({ flip_side: "dark" }, null).flipSide).toBe("dark");
    expect(normalizeView({}, null).flipSide).toBe("light");

    const game = createGame(19, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "flip");
    expect(viewFromCore(game, "local").flipSide).toBe("light");
    const flipped = { ...game, flipSide: "dark" as const } as GameState;
    expect(viewFromCore(flipped, "local").flipSide).toBe("dark");
    expect(viewFromCore(null, "local").flipSide).toBe("light");
  });

  it("normalizes challenge kind, amount and colour from both payload styles", () => {
    const online = normalizeView({
      rulesMode: "flip",
      flipSide: "dark",
      pending_challenge: {
        owner_id: "them", target_id: "me", legal: false,
        kind: "wildDrawColor", amount: 3, color: "purple",
      },
    }, "me");
    expect(online.pendingChallenge).toEqual({
      ownerId: "them", targetId: "me", legal: false,
      kind: "wildDrawColor", amount: 3, color: "purple",
    });
    expect(normalizePendingChallenge({ kind: "wildDraw2", amount: 0, color: "not-a-colour" }))
      .toEqual({ ownerId: "", targetId: "", legal: false, kind: "wildDraw2" });

    const game = createGame(19, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "flip");
    const pending = {
      ...game,
      pendingChallenge: {
        ownerId: "ai1", targetId: "local", legal: true,
        kind: "wildDraw2", amount: 2, color: "yellow",
      },
    } as GameState;
    expect(viewFromCore(pending, "local").pendingChallenge).toEqual({
      ownerId: "ai1", targetId: "local", legal: true,
      kind: "wildDraw2", amount: 2, color: "yellow",
    });
  });

  it("reads a deterministic flip through the view after a legal card and a Flip card", () => {
    const game = createGame(19, [
      { id: "local", name: "You" },
      { id: "ai1", name: "Computer" },
    ], 0, "flip");
    const first = applyAction(game, { type: "play", playerId: "local", cardId: "light-yellow-9-1" });
    expect(first.ok).toBe(true);
    const second = applyAction(first.state, {
      type: "play", playerId: "ai1", cardId: "light-yellow-flip-0",
    });
    expect(second.ok).toBe(true);
    expect(second.state.flipSide).toBe("dark");
    expect(second.state.currentColor).toBe("orange");
    const flipped = viewFromCore(second.state, "local");
    expect(flipped.flipSide).toBe("dark");
    expect(flipped.topCard?.id).toBe("dark-orange-1-1");
    expect(flipped.players[0]?.hand?.every((card) => card.id.startsWith("dark-"))).toBe(true);
  });
});

describe("Uno Flip side colours", () => {
  it("exposes light and dark colour lists without overlap", () => {
    expect(colorsForSide("light")).toBe(LIGHT_COLORS);
    expect(colorsForSide("dark")).toBe(DARK_COLORS);
    expect([...LIGHT_COLORS, ...DARK_COLORS]).toEqual(ALL_COLORS);
    expect(LIGHT_COLORS.every((color) => !DARK_COLORS.includes(color))).toBe(true);
  });

  it("offers light colours for a light-side wild", async () => {
    const { root, onPlay } = await mount(view);
    await click(button("Play light-wild-0"));
    const dialog = container.querySelector('[role="dialog"][aria-label="Choose a colour"]');
    expect(dialog).not.toBeNull();
    for (const color of LIGHT_COLORS) {
      expect(button(`Choose ${color}`)).toBeDefined();
    }
    for (const color of DARK_COLORS) {
      expect(button(`Choose ${color}`)).toBeUndefined();
    }
    await click(button("Choose green"));
    expect(onPlay).toHaveBeenCalledWith("light-wild-0", "green");
    await act(async () => { root.unmount(); });
  });

  it("offers dark colours for a dark-side wild and wild draw colour", async () => {
    const darkView: BoardView = {
      ...view,
      flipSide: "dark",
      currentColor: "pink",
      players: [
        { ...view.players[0], hand: [
          { id: "dark-wild-0", color: null, kind: "wild" },
          { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" },
        ] },
        view.players[1],
      ],
      legalCards: ["dark-wild-0", "dark-wilddrawcolor-0"],
    };
    const { root, onPlay } = await mount(darkView);
    await click(button("Play dark-wilddrawcolor-0"));
    const dialog = container.querySelector('[role="dialog"][aria-label="Choose a colour"]');
    expect(dialog).not.toBeNull();
    for (const color of DARK_COLORS) {
      expect(button(`Choose ${color}`)).toBeDefined();
    }
    for (const color of LIGHT_COLORS) {
      expect(button(`Choose ${color}`)).toBeUndefined();
    }
    await click(button("Choose teal"));
    expect(onPlay).toHaveBeenCalledWith("dark-wilddrawcolor-0", "teal");

    await click(button("Play dark-wild-0"));
    await click(button("Choose orange"));
    expect(onPlay).toHaveBeenCalledWith("dark-wild-0", "orange");
    await act(async () => { root.unmount(); });
  });

  it("uses side colours for the roulette chooser", async () => {
    const rouletteView: BoardView = {
      ...view,
      flipSide: "dark",
      pendingRoulette: { chooserId: "me", ownerId: "them" },
    };
    const { root, onChooseColour } = await mount(rouletteView);
    const dialog = container.querySelector('[data-roulette="true"]');
    expect(dialog).not.toBeNull();
    expect(button("Choose pink")).toBeDefined();
    expect(button("Choose purple")).toBeDefined();
    expect(button("Choose blue")).toBeUndefined();
    await click(button("Choose teal"));
    expect(onChooseColour).toHaveBeenCalledWith("teal");
    await act(async () => { root.unmount(); });
  });
});

describe("Uno Flip card art and table", () => {
  it("renders light and dark art IDs in both card sets", () => {
    const artView: BoardView = {
      ...view,
      flipSide: "dark",
      players: [
        { ...view.players[0], hand: [
          { id: "light-red-flip-0", color: "red", kind: "flip" },
          { id: "light-red-draw1-0", color: "red", kind: "draw1" },
          { id: "light-wilddraw2-0", color: null, kind: "wildDraw2" },
          { id: "dark-pink-draw5-0", color: "pink", kind: "draw5" },
          { id: "dark-pink-skipeveryone-0", color: "pink", kind: "skipEveryone" },
          { id: "dark-wilddrawcolor-0", color: null, kind: "wildDrawColor" },
          { id: "dark-orange-flip-0", color: "orange", kind: "flip" },
        ] },
        view.players[1],
      ],
      legalCards: [],
    };
    const classic = staticHtml(artView);
    for (const id of [
      "light-red-flip-0", "light-red-draw1-0", "light-wilddraw2-0",
      "dark-pink-draw5-0", "dark-pink-skipeveryone-0", "dark-wilddrawcolor-0",
      "dark-orange-flip-0",
    ]) {
      expect(classic).toContain(`cards/${id}.svg`);
    }
    const neon = staticHtml(artView, "neon");
    expect(neon).toContain("cards-neon/dark-pink-skipeveryone-0.svg");
    expect(neon).toContain("cards-neon/light-wilddraw2-0.svg");
  });

  it("shows a side indicator and marks the table for the dark side", () => {
    const light = staticHtml(view);
    expect(light).toContain("Light side");
    expect(light).toContain('aria-label="Light side"');
    expect(light).not.toContain("uno-table-surface--dark-side");
    const dark = staticHtml({ ...view, flipSide: "dark", currentColor: "pink" });
    expect(dark).toContain("Dark side");
    expect(dark).toContain('aria-label="Dark side"');
    expect(dark).toContain("uno-table-surface--dark-side");
  });

  it("hints the flip effects on playable cards", () => {
    const hintView: BoardView = {
      ...view,
      players: [
        { ...view.players[0], hand: [
          { id: "light-red-flip-0", color: "red", kind: "flip" },
          { id: "light-wilddraw2-0", color: null, kind: "wildDraw2" },
          { id: "dark-pink-skipeveryone-0", color: "pink", kind: "skipEveryone" },
        ] },
        view.players[1],
      ],
      legalCards: ["light-red-flip-0", "light-wilddraw2-0", "dark-pink-skipeveryone-0"],
    };
    const html = staticHtml(hintView);
    expect(html).toContain("Flips every card to the other side");
    expect(html).toContain("The next player takes 2 or challenges");
    expect(html).toContain("Skips every other player");
  });
});

describe("Uno Flip challenge overlays", () => {
  it("explains Wild Draw Two with guilty and innocent penalties", () => {
    const challengeView: BoardView = {
      ...view,
      pendingChallenge: {
        ownerId: "them", targetId: "me", legal: false,
        kind: "wildDraw2", amount: 2, color: "yellow",
      },
    };
    const html = staticHtml(challengeView);
    expect(html).toContain("Wild Draw Two");
    expect(html).toContain("Take 2");
    expect(html).toContain("if guilty they draw 2");
    expect(html).toContain("if innocent you draw 4");
    expect(html).toContain("Challenge the play?");
  });

  it("explains Wild Draw Color with take-until-colour and challenge text", () => {
    const challengeView: BoardView = {
      ...view,
      flipSide: "dark",
      pendingChallenge: {
        ownerId: "them", targetId: "me", legal: true,
        kind: "wildDrawColor", amount: 0, color: "teal",
      },
    };
    const html = staticHtml(challengeView);
    expect(html).toContain("Wild Draw Color");
    expect(html).toContain("Take until teal");
    expect(html).toContain("chosen colour (teal)");
    expect(html).toContain("If guilty the player draws until that colour");
  });

  it("keeps the Wild Draw Four default for challenges without flip metadata", () => {
    const html = staticHtml({
      ...view,
      pendingChallenge: { ownerId: "them", targetId: "me", legal: true },
    });
    expect(html).toContain("Wild Draw Four");
    expect(html).toContain("Take four cards");
    expect(html).toContain("Take 4");
  });
});

describe("Uno Flip online panel", () => {
  function controllerFor(flipSide: "light" | "dark", started: boolean): UnoController {
    return {
      connection: "connected",
      rulesMode: "flip",
      rulesModeLabel: rulesModeLabel("flip"),
      view: { ...normalizeView({ rulesMode: "flip", flipSide, started }, null), started },
      error: null,
      notice: null,
      searching: false,
      seats: 2,
      matchId: null,
      spectating: false,
    } as unknown as UnoController;
  }

  it("shows the Flip label and hint before a match", () => {
    const html = renderToStaticMarkup(
      <UnoOnlinePanel
        controller={controllerFor("light", false)}
        seats={2}
        roomInput=""
        onRoomInput={() => undefined}
        onRematch={() => undefined}
        onNotify={() => undefined}
      />,
    );
    expect(html).toContain("Flip");
    expect(html).toContain("Flip is on");
    expect(html).toContain("pink/teal/orange/purple");
  });

  it("shows the active side while in a match", () => {
    const html = renderToStaticMarkup(
      <UnoOnlinePanel
        controller={controllerFor("dark", true)}
        seats={2}
        roomInput=""
        onRoomInput={() => undefined}
        onRematch={() => undefined}
        onNotify={() => undefined}
      />,
    );
    expect(html).toContain("the dark side is active");
  });
});

describe("Uno Flip play interactions", () => {
  it("plays Skip Everyone without asking for a target", async () => {
    const skipView: BoardView = {
      ...view,
      flipSide: "dark",
      currentColor: "pink",
      players: [
        { ...view.players[0], hand: [{ id: "dark-pink-skipeveryone-0", color: "pink", kind: "skipEveryone" }] },
        view.players[1],
      ],
      legalCards: ["dark-pink-skipeveryone-0"],
    };
    const { root, onPlay } = await mount(skipView);
    await click(button("Play dark-pink-skipeveryone-0"));
    expect(onPlay).toHaveBeenCalledWith("dark-pink-skipeveryone-0");
    expect(container.querySelector('[aria-label="Choose a target player"]')).toBeNull();
    await act(async () => { root.unmount(); });
  });

  it("plays a Flip card straight through without a colour picker", async () => {
    const { root, onPlay } = await mount(view);
    await click(button("Play light-red-flip-0"));
    expect(container.querySelector('[role="dialog"][aria-label="Choose a colour"]')).toBeNull();
    expect(onPlay).toHaveBeenCalledWith("light-red-flip-0");
    await act(async () => { root.unmount(); });
  });
});
