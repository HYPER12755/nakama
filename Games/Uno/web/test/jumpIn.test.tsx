import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createGame, type GameState } from "@moongames/uno-core";
import { UnoBoardStage } from "../src/components/UnoBoardStage";
import { UnoOnlinePanel } from "../src/components/UnoOnlinePanel";
import { buildPlayPayload, normalizeView, type UnoController } from "../src/hooks/useUnoGame";
import {
  JUMP_IN_MODE,
  isJumpCandidate,
  normalizeJumpWindow,
  normalizeRulesMode,
  rulesModeLabel,
  RULES_MODES,
  viewFromCore,
  type BoardView,
} from "../src/lib/view";

const jumpWindow = { cardId: "red-5-0", ownerId: "them", expiresAt: Date.now() + 5000 };

const view: BoardView = {
  players: [
    { seat: 0, userId: "me", username: "You", connected: true, count: 2, hand: [
      { id: "red-5-0", color: "red", kind: "number", value: 5 },
      { id: "blue-2-0", color: "blue", kind: "number", value: 2 },
    ] },
    { seat: 1, userId: "them", username: "Rival", connected: true, count: 4 },
  ],
  spectators: [],
  chat: [],
  topCard: { id: "red-5-0", color: "red", kind: "number", value: 5 },
  currentColor: "red",
  flipSide: "light",
  turn: 1,
  direction: 1,
  deckCount: 40,
  pendingChallenge: null,
  pendingStack: null,
  jumpWindow,
  legalCards: ["red-5-0"],
  canDraw: false,
  result: null,
  myUserId: "me",
  started: true,
  mode: JUMP_IN_MODE,
};

function stageHtml(current: BoardView): string {
  return renderToStaticMarkup(
    <UnoBoardStage
      view={current}
      cardSet="classic"
      dealKey={1}
      activeColor="red"
      direction={1}
      highlight="lift"
      pileStyle="stack"
      rulesMode={JUMP_IN_MODE}
      onPlay={() => undefined}
      onDraw={() => undefined}
      onChallenge={() => undefined}
      onUno={() => undefined}
    />,
  );
}

describe("Uno Jump-In rules mode selector", () => {
  it("lists Jump-In once and labels it", () => {
    expect(RULES_MODES as string[]).toContain("jumpIn");
    expect(new Set(RULES_MODES).size).toBe(RULES_MODES.length);
    expect(rulesModeLabel(JUMP_IN_MODE)).toBe("Jump-In");
    expect(rulesModeLabel(normalizeRulesMode("jumpIn"))).toBe("Jump-In");
  });

  it("normalizes Jump-In from online and local state", () => {
    expect(normalizeView({ rulesMode: "jumpIn" }, null).mode).toBe(JUMP_IN_MODE);
    expect(normalizeView({ mode: "jumpIn" }, null).mode).toBe(JUMP_IN_MODE);
    const state = {
      ...createGame(7, [
        { id: "local", name: "You" },
        { id: "ai1", name: "Computer" },
      ]),
      mode: JUMP_IN_MODE,
    } as GameState;
    expect(viewFromCore(state, "local").mode).toBe(JUMP_IN_MODE);
  });
});

describe("Uno jumpWindow normalization", () => {
  it("maps camelCase and snake_case fields", () => {
    expect(normalizeJumpWindow(jumpWindow)).toEqual(jumpWindow);
    expect(normalizeView({ jumpWindow }, null).jumpWindow).toEqual(jumpWindow);
    expect(normalizeView({ jump_window: { card_id: "red-5-0", owner_id: "them", expires_at: 9000 } }, null).jumpWindow)
      .toEqual({ cardId: "red-5-0", ownerId: "them", expiresAt: 9000 });
  });

  it("falls back to null for absent or invalid windows", () => {
    expect(normalizeView({}, null).jumpWindow).toBeNull();
    expect(normalizeView({ jumpWindow: null }, null).jumpWindow).toBeNull();
    expect(normalizeJumpWindow({ cardId: "red-5-0" })).toBeNull();
    expect(normalizeJumpWindow({ expiresAt: 5000 })).toBeNull();
    expect(viewFromCore(null, "local").jumpWindow).toBeNull();
  });

  it("reads a jump window from a local game state", () => {
    const state = {
      ...createGame(7, [
        { id: "local", name: "You" },
        { id: "ai1", name: "Computer" },
      ]),
      mode: JUMP_IN_MODE,
      jumpWindow,
    } as unknown as GameState;
    expect(viewFromCore(state, "local").jumpWindow).toEqual(jumpWindow);
  });
});

describe("Uno play sends jump", () => {
  it("flags an exact legal candidate while a window is open", () => {
    expect(isJumpCandidate(view, "red-5-0")).toBe(true);
    expect(buildPlayPayload(view, "red-5-0")).toEqual({ cardId: "red-5-0", jump: true });
    expect(buildPlayPayload(view, "red-5-0", "red", "them")).toEqual({
      cardId: "red-5-0", chosenColor: "red", targetId: "them", jump: true,
    });
  });

  it("does not flag plays without a jump window or from the owner", () => {
    const closed: BoardView = { ...view, jumpWindow: null };
    expect(buildPlayPayload(closed, "red-5-0")).toEqual({ cardId: "red-5-0" });
    const owner: BoardView = { ...view, jumpWindow: { ...jumpWindow, ownerId: "me" } };
    expect(buildPlayPayload(owner, "red-5-0")).toEqual({ cardId: "red-5-0" });
    const illegal: BoardView = { ...view, legalCards: ["blue-2-0"] };
    expect(buildPlayPayload(illegal, "red-5-0")).toEqual({ cardId: "red-5-0" });
  });
});

describe("Uno jump board presentation", () => {
  it("shows a jump window banner with countdown and exact-match hint", () => {
    const html = stageHtml(view);
    expect(html).toContain("uno-jump-banner");
    expect(html).toContain("Jump window");
    expect(html).toMatch(/\d+s/);
    expect(html).toContain("same colour and number");
  });

  it("highlights legal jump cards even when it is not the viewer turn", () => {
    const html = stageHtml(view);
    expect(html).toContain('title="Jump in with this card"');
    expect(html).toContain("uno-hand-card--usable");
    expect(html).toContain('title="blue-2-0"');
  });

  it("hides the banner when no window is open", () => {
    expect(stageHtml({ ...view, jumpWindow: null })).not.toContain("uno-jump-banner");
  });
});

describe("Uno online panel shows Jump-In", () => {
  it("renders the Jump-In rules label when not in a match", () => {
    const original = (globalThis as unknown as { window?: unknown }).window;
    Object.defineProperty(globalThis, "window", {
      value: { location: { href: "http://localhost/" } },
      configurable: true,
    });
    try {
      const controller = {
        connection: "connected",
        rulesMode: JUMP_IN_MODE,
        rulesModeLabel: rulesModeLabel(JUMP_IN_MODE),
        view: normalizeView({ rulesMode: "jumpIn" }, null),
        error: null,
        notice: null,
        searching: false,
        seats: 2,
        matchId: null,
        spectating: false,
      } as unknown as UnoController;
      const html = renderToStaticMarkup(
        <UnoOnlinePanel
          controller={controller}
          seats={2}
          roomInput=""
          onRoomInput={() => undefined}
          onRematch={() => undefined}
          onNotify={() => undefined}
        />,
      );
      expect(html).toContain("Jump-In");
      expect(html).toContain("Jump-In is on");
    } finally {
      Object.defineProperty(globalThis, "window", { value: original, configurable: true });
    }
  });
});
