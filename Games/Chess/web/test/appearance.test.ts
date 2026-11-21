import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Coordinates } from "@moongames/game-ui";
import { getDisplaySquares } from "../src/lib/coordinates";
import {
  isPieceSet,
  pieceImageUrl,
  pieceSetLabel,
  PIECE_SET_IDS,
} from "../src/lib/pieceSets";
import { boardTheme, boardThemeStyle, BOARD_THEMES } from "../src/lib/boardThemes";
import { isSoundSet, SOUND_SETS } from "../src/lib/soundSets";
import { configureSound, soundSet } from "../src/lib/audio";

/**
 * The customizations of the chess table: the pieces, the board, the
 * coordinates and the sound.
 */

let originalDocument: unknown;

beforeEach(() => {
  originalDocument = (globalThis as { document?: unknown }).document;
  (globalThis as { document?: unknown }).document = {
    baseURI: "http://127.0.0.1:4174/chess/",
  };
});

afterEach(() => {
  (globalThis as { document?: unknown }).document = originalDocument;
});

describe("the sets of pieces", () => {
  it("offers the sets that came with the game", () => {
    expect(PIECE_SET_IDS).toContain("moongames");
    expect(PIECE_SET_IDS).toContain("cburnett");
    expect(PIECE_SET_IDS.length).toBeGreaterThan(20);
    expect(isPieceSet("cburnett")).toBe(true);
    expect(isPieceSet("not a set")).toBe(false);
  });

  it("gives every set a name a player can read", () => {
    expect(pieceSetLabel("cburnett")).toBe("Cburnett");
    expect(pieceSetLabel("shahi-ivory-brown")).toBe("Shahi Ivory");
    expect(pieceSetLabel("unknown")).toBe("unknown");
  });

  it("draws the pieces of a set from beside the game", () => {
    expect(pieceImageUrl("cburnett", "w", "k")).toBe(
      "http://127.0.0.1:4174/chess/pieces/cburnett/wK.svg",
    );
    expect(pieceImageUrl("cburnett", "b", "q")).toBe(
      "http://127.0.0.1:4174/chess/pieces/cburnett/bQ.svg",
    );
  });

  it("draws the pieces of the house set itself", () => {
    expect(pieceImageUrl("moongames", "w", "k")).toBeNull();
  });

  it("draws the sets that are pictures as pictures", () => {
    expect(pieceImageUrl("monarchy", "w", "k")).toBe(
      "http://127.0.0.1:4174/chess/pieces/monarchy/wK.webp",
    );
    expect(pieceImageUrl("cburnett", "w", "k")).toContain(".svg");
  });
});

describe("the colouring of the board", () => {
  it("takes the boards of lichess, the pictures and all", () => {
    const wood = boardTheme("wood");
    expect(wood.texture).toBe("boards/wood.jpg");
    expect(wood.coordLight).toBe("#d8a45b");
    expect(wood.coordDark).toBe("#9b4d0f");

    // The canvases and the papers are there too.
    expect(boardTheme("marble").texture).toBe("boards/marble.jpg");
    expect(boardTheme("newspaper").texture).toBe("boards/newspaper.svg");
    expect(boardTheme("canvas").texture).toBe("boards/canvas2.jpg");
  });

  it("paints the squares only for the board of the game itself", () => {
    const house = boardTheme("moongames");
    expect(house.texture).toBeUndefined();
    expect(house.light).toMatch(/^#[0-9a-f]{6}$/i);
    expect(house.dark).toMatch(/^#[0-9a-f]{6}$/i);

    const houseStyle = boardThemeStyle(house);
    expect(houseStyle["--board-texture"]).toBe("none");
    expect(houseStyle["--board-squares"]).toBeUndefined();
    expect(houseStyle["--board-light"]).toBe(house.light);
    expect(houseStyle["--board-dark"]).toBe(house.dark);

    const style = boardThemeStyle(boardTheme("wood"));
    expect(style["--board-texture"]).toBe('url("boards/wood.jpg")');
    expect(style["--board-squares"]).toBe("transparent");
  });

  it("falls back to the house board for a board it does not know", () => {
    expect(boardTheme("olive").id).toBe("olive");
    expect(boardTheme("not a board").id).toBe(BOARD_THEMES[0].id);
  });
});

describe("the coordinates of the board", () => {
  it("draws them on the edge when that is the choice", () => {
    const squares = getDisplaySquares(false, Coordinates.Outside);
    const bottom = squares.find((square) => square.square === "a1");
    const middle = squares.find((square) => square.square === "d4");
    const edge = squares.find((square) => square.square === "h1");

    expect(bottom?.showFile).toBe(true);
    expect(bottom?.showInnerFile).toBe(false);
    expect(middle?.showFile).toBe(false);
    expect(middle?.showInnerFile).toBe(false);
    expect(edge?.showRank).toBe(false);
  });

  it("draws them inside every square when that is the choice", () => {
    const squares = getDisplaySquares(false, Coordinates.Inside);
    const middle = squares.find((square) => square.square === "d4");

    expect(middle?.showInnerFile).toBe(true);
    expect(middle?.showInnerRank).toBe(true);
    expect(middle?.showFile).toBe(false);
    expect(middle?.showRank).toBe(false);
  });

  it("draws them in both places when both are asked for", () => {
    const squares = getDisplaySquares(false, Coordinates.All);
    const middle = squares.find((square) => square.square === "d4");

    expect(middle?.showInnerFile).toBe(true);
    expect(middle?.showFile).toBe(false);
  });

  it("draws nothing when they are hidden", () => {
    const squares = getDisplaySquares(false, Coordinates.Hidden);
    for (const square of squares) {
      expect(square.showFile).toBe(false);
      expect(square.showRank).toBe(false);
      expect(square.showInnerFile).toBe(false);
      expect(square.showInnerRank).toBe(false);
    }
  });

  it("turns the edge with the board", () => {
    const squares = getDisplaySquares(true, Coordinates.Outside);
    // The board is turned, so the edge is the rank eight and the h file.
    const corner = squares.find((square) => square.square === "h8");

    expect(corner?.showFile).toBe(true);
    expect(corner?.showRank).toBe(true);

    const middle = squares.find((square) => square.square === "d4");
    expect(middle?.showFile).toBe(false);
    expect(middle?.showRank).toBe(false);
  });
});

describe("the sound of the table", () => {
  it("offers the sets of sounds that came with the game", () => {
    expect(SOUND_SETS.length).toBeGreaterThan(5);
    expect(isSoundSet("moongames")).toBe(true);
    expect(isSoundSet("not a set")).toBe(false);
  });

  it("uses the set the player chooses", () => {
    configureSound({ set: "robot", volume: 0.5, enabled: true });
    expect(soundSet()).toBe("robot");

    configureSound({ set: "standard" });
    expect(soundSet()).toBe("standard");
  });
});
