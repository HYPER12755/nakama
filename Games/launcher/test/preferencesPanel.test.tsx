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
  { id: "moongames", label: "MoonGames" },
  { id: "cburnett", label: "Cburnett", preview: "/pieces/cburnett/wK.svg" },
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
  it("shows the sets of pieces, with a picture of each", () => {
    const markup = renderToStaticMarkup(
      <GamePreferencesPanel
        gameId="chess"
        pieceSets={PIECES}
        themes={THEMES}
        soundSets={[{ id: "standard", label: "Standard" }]}
        features={{ autoQueen: true, moveEvent: true, clockTenths: true }}
      />,
    );

    expect(markup).toContain("Pieces");
    expect(markup).toContain("Cburnett");
    expect(markup).toContain('src="/pieces/cburnett/wK.svg"');
    expect(markup).toContain("Ocean");
    expect(markup).toContain("Coordinates");
    expect(markup).toContain("Movement");
    expect(markup).toContain("Sound");
    expect(markup).toContain("Volume");
  });

  it("shows the choices that only chess has", () => {
    const markup = renderToStaticMarkup(
      <GamePreferencesPanel
        gameId="chess"
        features={{ autoQueen: true, moveEvent: true, clockTenths: true }}
      />,
    );

    expect(markup).toContain("A pawn that reaches the end");
    expect(markup).toContain("Moving a piece");
    expect(markup).toContain("Click or drag");
    expect(markup).toContain("The clock");
    expect(markup).toContain("Below ten seconds");
  });

  it("leaves out the choices a game does not have", () => {
    const markup = renderToStaticMarkup(
      <GamePreferencesPanel gameId="chess" />,
    );

    expect(markup).not.toContain("Pieces");
    expect(markup).not.toContain("A pawn that reaches the end");
    expect(markup).not.toContain("Moving a piece");
    expect(markup).toContain("Coordinates");
  });

  it("marks the choice the player has made", () => {
    store.set("moongames.prefs.chess.pieceSet", '"cburnett"');

    const markup = renderToStaticMarkup(
      <GamePreferencesPanel gameId="chess" pieceSets={PIECES} />,
    );

    expect(markup).toContain('aria-checked="true"');
  });
});
