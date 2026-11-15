/**
 * The sets of pieces a player can choose.
 *
 * The sets come from the lichess client, which keeps them beside the games
 * it shows. The list of them, and the licence of every one, is in
 * `public/pieces/PIECES.txt`.
 *
 * The MoonGames pieces are not in that folder. They are drawn by the game
 * itself, and they are the default.
 */

/** The pieces the game draws itself. */
export const MOONGAMES_PIECES = "moongames";

/** The sets of pieces, in the order they are offered. */
export const PIECE_SET_IDS = [
  MOONGAMES_PIECES,
  "cburnett",
  "alpha",
  "anarcandy",
  "caliente",
  "california",
  "cardinal",
  "celtic",
  "chess7",
  "chessnut",
  "companion",
  "cooke",
  "disguised",
  "dubrovny",
  "fantasy",
  "firi",
  "fresca",
  "gioco",
  "governor",
  "horsey",
  "icpieces",
  "kiwen-suwi",
  "kosal",
  "leipzig",
  "letter",
  "maestro",
  "merida",
  "minimal-warmth",
  "monarchy",
  "mpchess",
  "papercut",
  "pirouetti",
  "pixel",
  "Reillycraig",
  "rhosgfx",
  "riohacha",
  "shahi-ivory-brown",
  "shapes",
  "spatial",
  "staunty",
  "tatiana",
  "totoy",
  "xkcd",
] as const;

/** The names a player sees for the sets. */
const PIECE_SET_LABELS: Record<string, string> = {
  moongames: "MoonGames",
  cburnett: "Cburnett",
  alpha: "Alpha",
  anarcandy: "Anarcandy",
  caliente: "Caliente",
  california: "California",
  cardinal: "Cardinal",
  celtic: "Celtic",
  chess7: "Chess 7",
  chessnut: "Chessnut",
  companion: "Companion",
  cooke: "Cooke",
  disguised: "Disguised",
  dubrovny: "Dubrovny",
  fantasy: "Fantasy",
  firi: "Firi",
  fresca: "Fresca",
  gioco: "Gioco",
  governor: "Governor",
  horsey: "Horsey",
  icpieces: "IC Pieces",
  "kiwen-suwi": "Kiwen Suwi",
  kosal: "Kosal",
  leipzig: "Leipzig",
  letter: "Letter",
  maestro: "Maestro",
  merida: "Merida",
  "minimal-warmth": "Minimal Warmth",
  monarchy: "Monarchy",
  mpchess: "MP Chess",
  papercut: "Papercut",
  pirouetti: "Pirouetti",
  pixel: "Pixel",
  reillycraig: "Reilly Craig",
  rhosgfx: "RhosGFX",
  riohacha: "Riohacha",
  "shahi-ivory-brown": "Shahi Ivory",
  shapes: "Shapes",
  spatial: "Spatial",
  staunty: "Staunty",
  tatiana: "Tatiana",
  totoy: "Totoy",
  xkcd: "xkcd",
};

export function pieceSetLabel(id: string): string {
  return PIECE_SET_LABELS[id] ?? id;
}

/**
 * The sets whose drawings are pictures rather than drawings.
 *
 * They are the same pictures, so the board does not care, but the browser
 * does.
 */
const PICTURE_SETS = new Set(["monarchy"]);

/**
 * The drawing of a piece in a set.
 *
 * The sets are kept beside the game, so the path is relative to the page.
 */
export function pieceImageUrl(
  set: string,
  color: "w" | "b",
  type: string,
): string | null {
  if (set === MOONGAMES_PIECES) {
    return null;
  }
  if (typeof document === "undefined") {
    return null;
  }
  const extension = PICTURE_SETS.has(set) ? "webp" : "svg";
  return new URL(
    `pieces/${set}/${color}${type.toUpperCase()}.${extension}`,
    document.baseURI,
  ).toString();
}

/** True when the set is one of the sets the game can draw. */
export function isPieceSet(id: string): boolean {
  return (PIECE_SET_IDS as readonly string[]).includes(id);
}
