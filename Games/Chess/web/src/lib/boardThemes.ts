/**
 * The colourings of the board.
 *
 * Lichess gives each board a name and a picture. The pictures live in a
 * separate place, so the colourings here are our own, named after the boards
 * they remind a player of.
 */

export interface BoardTheme {
  id: string;
  label: string;
  /** The colour of the light squares. */
  light: string;
  /** The colour of the dark squares. */
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: "moongames",
    label: "MoonGames",
    light: "#e9dfcb",
    dark: "#64766c",
  },
  { id: "wood", label: "Wood", light: "#f0e0c8", dark: "#b58863" },
  { id: "maple", label: "Maple", light: "#f7e9c3", dark: "#c19a5b" },
  { id: "blue", label: "Blue", light: "#d6e3f0", dark: "#6d8fb3" },
  { id: "green", label: "Green", light: "#eef3dd", dark: "#779556" },
  { id: "brown", label: "Brown", light: "#f0d9b5", dark: "#946f51" },
  { id: "marble", label: "Marble", light: "#cfe0cd", dark: "#4f644e" },
  { id: "canvas", label: "Canvas", light: "#e4e7f4", dark: "#547388" },
  { id: "leather", label: "Leather", light: "#e8dcc0", dark: "#8a6a3c" },
  { id: "grey", label: "Grey", light: "#e4e4e4", dark: "#9b9b9b" },
  { id: "metal", label: "Metal", light: "#e6e8ea", dark: "#8a8f94" },
  { id: "olive", label: "Olive", light: "#dcd6c4", dark: "#6d6655" },
  { id: "purple", label: "Purple", light: "#e9e0f2", dark: "#9f90b0" },
  { id: "purple-diag", label: "Purple Diag", light: "#e5daf0", dark: "#957ab0" },
  { id: "ocean", label: "Ocean", light: "#dceef0", dark: "#3f7f8c" },
  { id: "rosewood", label: "Rosewood", light: "#f3d9c9", dark: "#8c4a3f" },
  { id: "ice", label: "Ice", light: "#eaf4fb", dark: "#8fb8d6" },
  { id: "newspaper", label: "Newspaper", light: "#f4f1e8", dark: "#9a9a93" },
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
 * The colours of the coordinates follow the colours of the squares, so a
 * player who chooses a dark board does not get dark numbers on it.
 */
export function boardThemeStyle(theme: BoardTheme): Record<string, string> {
  return {
    "--board-light": theme.light,
    "--board-dark": theme.dark,
  };
}
