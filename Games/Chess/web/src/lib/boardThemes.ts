/**
 * The boards a player can choose.
 *
 * The boards are the boards of lichess: real wood with a grain, marble,
 * leather, plastic, and the rest. The pictures are copied with the game and
 * named beside it in `public/boards/BOARDS.txt`.
 *
 * Every one of them is a whole board, the squares and all, so the board is
 * drawn as one picture and the pieces are put on top of it, the way lichess
 * draws them.
 *
 * The colours of the coordinates are the ones lichess uses, so the letters
 * on a board are as readable there as they are here.
 *
 * The MoonGames board is the one of the game itself. It has no picture, so
 * its squares are painted with their own colours.
 */

export interface BoardTheme {
  id: string;
  label: string;
  /** The picture of the board, when it has one. */
  texture?: string;
  /** The colour of the light squares, when the board has no picture. */
  light?: string;
  /** The colour of the dark squares, when the board has no picture. */
  dark?: string;
  /** The colour of the coordinates on the light squares. */
  coordLight?: string;
  /** The colour of the coordinates on the dark squares. */
  coordDark?: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "moongames",
    label: "MoonGames",
    light: "#e9dfcb",
    dark: "#64766c",
  },
  {
    id: "wood",
    label: "Wood",
    texture: "boards/wood.jpg",
    coordLight: "#d8a45b",
    coordDark: "#9b4d0f",
  },
  {
    id: "wood2",
    label: "Wood 2",
    texture: "boards/wood2.jpg",
    coordLight: "#a38b5d",
    coordDark: "#6c5017",
  },
  {
    id: "wood3",
    label: "Wood 3",
    texture: "boards/wood3.jpg",
    coordLight: "#d0ceca",
    coordDark: "#755839",
  },
  {
    id: "wood4",
    label: "Wood 4",
    texture: "boards/wood4.jpg",
    coordLight: "#caaf7d",
    coordDark: "#7b5330",
  },
  {
    id: "maple",
    label: "Maple",
    texture: "boards/maple.jpg",
    coordLight: "#e8ceab",
    coordDark: "#bc7944",
  },
  {
    id: "maple2",
    label: "Maple 2",
    texture: "boards/maple2.jpg",
    coordLight: "#e2c89f",
    coordDark: "#963",
  },
  {
    id: "horsey",
    label: "Horsey",
    texture: "boards/horsey.jpg",
    coordLight: "#f0d9b5",
    coordDark: "#946f51",
  },
  {
    id: "leather",
    label: "Leather",
    texture: "boards/leather.jpg",
    coordLight: "#d1d1c9",
    coordDark: "#c28e16",
  },
  {
    id: "brown",
    label: "Brown",
    texture: "boards/brown.png",
    coordLight: "#f0d9b5",
    coordDark: "#946f51",
  },
  {
    id: "marble",
    label: "Marble",
    texture: "boards/marble.jpg",
    coordLight: "#93ab91",
    coordDark: "#4f644e",
  },
  {
    id: "blue-marble",
    label: "Blue Marble",
    texture: "boards/blue-marble.jpg",
    coordLight: "#eae6dd",
    coordDark: "#7c7f87",
  },
  {
    id: "canvas",
    label: "Canvas",
    texture: "boards/canvas2.jpg",
    coordLight: "#d7daeb",
    coordDark: "#547388",
  },
  {
    id: "olive",
    label: "Olive",
    texture: "boards/olive.jpg",
    coordLight: "#b8b19f",
    coordDark: "#6d6655",
  },
  {
    id: "grey",
    label: "Grey",
    texture: "boards/grey.jpg",
    coordLight: "#b8b8b8",
    coordDark: "#7d7d7d",
  },
  {
    id: "metal",
    label: "Metal",
    texture: "boards/metal.jpg",
    coordLight: "#c9c9c9",
    coordDark: "#727272",
  },
  {
    id: "green-plastic",
    label: "Green Plastic",
    texture: "boards/green-plastic.png",
    coordLight: "#f2f9bb",
    coordDark: "#59935d",
  },
  {
    id: "green",
    label: "Green",
    texture: "boards/green.png",
    coordLight: "#ffffdd",
    coordDark: "#6d8753",
  },
  {
    id: "blue",
    label: "Blue",
    texture: "boards/blue.png",
    coordLight: "#dee3e6",
    coordDark: "#788a94",
  },
  {
    id: "blue2",
    label: "Blue 2",
    texture: "boards/blue2.jpg",
    coordLight: "#97b2c7",
    coordDark: "#546f82",
  },
  {
    id: "blue3",
    label: "Blue 3",
    texture: "boards/blue3.jpg",
    coordLight: "#d9e0e6",
    coordDark: "#315991",
  },
  {
    id: "purple",
    label: "Purple",
    texture: "boards/purple.png",
    coordLight: "#9f90b0",
    coordDark: "#7d4a8d",
  },
  {
    id: "purple-diag",
    label: "Purple Diagonal",
    texture: "boards/purple-diag.png",
    coordLight: "#e5daf0",
    coordDark: "#957ab0",
  },
  {
    id: "pink",
    label: "Pink",
    texture: "boards/pink-pyramid.png",
    coordLight: "#e8e9b7",
    coordDark: "#ed7272",
  },
  {
    id: "ic",
    label: "IC",
    texture: "boards/ic.png",
    coordLight: "#ececec",
    coordDark: "#c1c18e",
  },
  {
    id: "newspaper",
    label: "Newspaper",
    texture: "boards/newspaper.svg",
    coordLight: "#fff",
    coordDark: "#8d8d8d",
  },
];

/** The colouring with the given name, or the house colouring. */
export function boardTheme(id: string): BoardTheme {
  return (
    BOARD_THEMES.find((theme) => theme.id === id) ?? BOARD_THEMES[0]
  );
}

/**
 * The style of a board, ready to be put on the board itself.
 *
 * The picture carries the squares, so the squares of the board are not
 * painted over it. The colours of the coordinates are the ones of the
 * board, so the letters are readable on it.
 */
export function boardThemeStyle(theme: BoardTheme): Record<string, string> {
  const style: Record<string, string> = {};

  if (theme.texture !== undefined) {
    style["--board-texture"] = `url("${theme.texture}")`;
    // The picture carries the squares, so they are not painted over it.
    style["--board-squares"] = "transparent";
    style["--board-sheen"] = "transparent";
  } else {
    style["--board-texture"] = "none";
    style["--board-light"] = theme.light ?? "#e9dfcb";
    style["--board-dark"] = theme.dark ?? "#64766c";
  }

  if (theme.coordLight !== undefined) {
    style["--coord-light"] = theme.coordLight;
  }
  if (theme.coordDark !== undefined) {
    style["--coord-dark"] = theme.coordDark;
  }

  return style;
}
