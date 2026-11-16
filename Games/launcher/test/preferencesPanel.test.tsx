import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GamePreferencesPanel,
  type PieceChoice,
  type ThemeChoice,
} from "@moongames/game-ui";

/**
 * The panel of customizations is shown to the player, so it is rendered
 * here and read, to be sure that the choices are really on the screen.
 */

const PIECES: PieceChoice[] = [
  { id: "moongames", label: "MoonGames", preview: <span>white</span> },
  {
    id: "cburnett",
    label: "Cburnett",
    preview: <span>white</span>,
    previewDark: <span>black</span>,
  },
];

const THEMES: ThemeChoice[] = [
  { id: "moongames", label: "MoonGames", light: "#e9dfcb", dark: "#64766c" },
  { id: "ocean", label: "Ocean", light: "#dceef0", dark: "#3f7f8c" },
];

let store: Map<string, string>;
let originalWindow: unknown;

beforeEach(() => {
  store = new Map<string, string>();
  originalWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    },
  };
});

afterEach(() => {
  (globalThis as { window?: unknown }).window = originalWindow;
});

describe("the panel of customizations", () => {
  it("is three lines, each with a picture of what is chosen", () => {
    store.set("moongames.prefs.chess.pieceSet", '"cburnett"');
    store.set("moongames.prefs.chess.boardTheme", '"ocean"');

    const markup = renderToStaticMarkup(
      <GamePreferencesPanel
        gameId="chess"
        pieceSets={PIECES}
        themes={THEMES}
        soundSets={[{ id: "standard", label: "Standard" }]}
        features={{ autoQueen: true, moveEvent: true, clockTenths: true }}
      />,
    );

    // The three lines.
    expect(markup).toContain("Pieces");
    expect(markup).toContain("Board");
    expect(markup).toContain("Sound");
    expect(markup).toContain("More settings");

    // What is chosen now, with a picture of it.
    expect(markup).toContain("Cburnett");
    expect(markup).toContain("Ocean");
    expect(markup).toContain("Standard");
    expect(markup).toContain("pref-row__preview--pieces");
    expect(markup).toContain("pref-row__preview--board");
  });

  it("keeps the rest of the choices behind the more button", () => {
    const markup = renderToStaticMarkup(
      <GamePreferencesPanel
        gameId="chess"
        features={{ autoQueen: true, moveEvent: true, clockTenths: true }}
      />,
    );

    expect(markup).toContain("More settings");
    expect(markup).not.toContain("A pawn that reaches the end");
    expect(markup).not.toContain("Click or drag");
  });

  it("shows the choices a game does not have nowhere", () => {
    const markup = renderToStaticMarkup(
      <GamePreferencesPanel gameId="chess" />,
    );

    expect(markup).not.toContain("Pieces");
    expect(markup).not.toContain("Board");
    expect(markup).toContain("Sound");
  });

  it("marks the choice the player has made", () => {
    store.set("moongames.prefs.chess.pieceSet", '"cburnett"');

    const markup = renderToStaticMarkup(
      <GamePreferencesPanel gameId="chess" pieceSets={PIECES} />,
    );

    expect(markup).toContain("Cburnett");
  });
});
