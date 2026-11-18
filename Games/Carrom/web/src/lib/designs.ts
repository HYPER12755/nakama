/**
 * The looks a carrom table can wear. Every design is data: the panel shows
 * the list, the player keeps the chosen ids in the shared preferences, and
 * the board paints itself from the chosen palettes. Nothing here is wired
 * into the drawing code by hand.
 */

import type { CarromPlayer } from "@moongames/carrom-core";

export interface Palette {
  /** The light face of a turned piece. */
  top: string;
  /** The middle of the face. */
  mid: string;
  /** The shaded edge. */
  low: string;
  /** The dark line around the piece. */
  rim: string;
  /** The faint ring painted on the face. */
  ring: string;
}

export interface BoardDesign {
  id: string;
  label: string;
  /** The four stops of the playing surface, from light to dark. */
  surface: [string, string, string, string];
  /** The four stops of the frame. */
  frame: [string, string, string, string];
  /** The colour of the wood grain over the surface. */
  grain: string;
  /** A real wood photograph used as the surface, when there is one. */
  texture?: string;
}

export const BOARD_DESIGNS: BoardDesign[] = [
  {
    id: "tournament",
    label: "Tournament wood",
    surface: ["#e8c286", "#dcae6d", "#cb9553", "#b87f42"],
    frame: ["#6b4429", "#4a2d1b", "#331d12", "#1d110a"],
    grain: "#8c6238",
    texture: "art/wood-classic.png",
  },
  {
    id: "rosewood",
    label: "Rosewood",
    surface: ["#c98e6a", "#b87655", "#a05f43", "#7d452e"],
    frame: ["#7a4228", "#56281a", "#3a1a10", "#220e08"],
    grain: "#6e3d2a",
    texture: "art/wood-rosewood.jpg",
  },
  {
    id: "maple",
    label: "Maple",
    surface: ["#f3dda9", "#e8c986", "#d8b26b", "#bf924f"],
    frame: ["#a8794d", "#835a35", "#5f3d22", "#3d2614"],
    grain: "#b89158",
    texture: "art/wood-maple.jpg",
  },
  {
    id: "walnut",
    label: "Walnut",
    surface: ["#b98a62", "#a5734d", "#8a5b3a", "#6b4229"],
    frame: ["#5b3a24", "#3f2617", "#2a180e", "#170c06"],
    grain: "#54331f",
  },
  {
    id: "slate",
    label: "Slate",
    surface: ["#8d9aa3", "#72808b", "#586672", "#3f4b56"],
    frame: ["#3b444c", "#2b333a", "#1d2429", "#11161a"],
    grain: "#4c5963",
  },
  {
    id: "ivory",
    label: "Ivory",
    surface: ["#f7f0dd", "#ece1c3", "#dccca3", "#c5b181"],
    frame: ["#b6a078", "#8e7754", "#685237", "#42321f"],
    grain: "#bda987",
  },
  {
    id: "cherry",
    label: "Cherry",
    surface: ["#e0a17f", "#cc8464", "#b46a4c", "#8f4d34"],
    frame: ["#8c4a30", "#632f1e", "#411c11", "#260e07"],
    grain: "#9c5638",
  },
  {
    id: "teal",
    label: "Teal cloth",
    surface: ["#5fa59f", "#428b87", "#30706d", "#215453"],
    frame: ["#2e5a58", "#204341", "#152f2e", "#0c1c1b"],
    grain: "#397e7a",
  },
  {
    id: "burgundy",
    label: "Burgundy",
    surface: ["#a85d68", "#8f4452", "#76303e", "#57202c"],
    frame: ["#6b2f3b", "#4a1d27", "#311118", "#1b080d"],
    grain: "#8a4451",
  },
  {
    id: "midnight",
    label: "Midnight",
    surface: ["#54607e", "#414b66", "#303851", "#20263a"],
    frame: ["#2c3350", "#1e2439", "#141829", "#0a0c16"],
    grain: "#39435e",
  },
];

export interface StrikerDesign {
  id: string;
  label: string;
  palette: Palette;
  /** The real striker artwork from the game, shown in the picker. */
  image: string;
  /** A hand-picked pattern drawn on the playing piece. */
  pattern: "plain" | "star" | "ring" | "cross" | "dots" | "spiral";
}

/**
 * Each striker is hand-picked from the game's own artwork and given its own
 * face pattern, so the pieces look and feel different on the table rather
 * than being one shape in ten colours.
 */
export const STRIKER_DESIGNS: StrikerDesign[] = [
  { id: "brass", label: "Brass", image: "art/strikers/brass.webp", pattern: "ring", palette: { top: "#f6e7c8", mid: "#cbae7c", low: "#8d6f44", rim: "#4b3820", ring: "rgba(110,84,48,0.5)" } },
  { id: "steel", label: "Steel", image: "art/strikers/steel.webp", pattern: "cross", palette: { top: "#f2f5f7", mid: "#b9c4cc", low: "#6f7d88", rim: "#3a454e", ring: "rgba(40,55,65,0.4)" } },
  { id: "ebony", label: "Ebony", image: "art/strikers/ebony.webp", pattern: "plain", palette: { top: "#5a5148", mid: "#2e2823", low: "#171310", rim: "#080706", ring: "rgba(230,210,180,0.3)" } },
  { id: "copper", label: "Copper", image: "art/strikers/copper.webp", pattern: "dots", palette: { top: "#f4c7a1", mid: "#c67a4c", low: "#8a4a29", rim: "#4d2614", ring: "rgba(255,220,180,0.45)" } },
  { id: "ivory-striker", label: "Ivory", image: "art/strikers/ivory.webp", pattern: "plain", palette: { top: "#fffdf4", mid: "#ece0c4", low: "#c6b28c", rim: "#8a7452", ring: "rgba(120,96,60,0.4)" } },
  { id: "jade-striker", label: "Jade", image: "art/strikers/jade.webp", pattern: "star", palette: { top: "#a8e6c8", mid: "#4a9c73", low: "#225c40", rim: "#10301f", ring: "rgba(220,255,235,0.4)" } },
  { id: "ruby", label: "Ruby", image: "art/strikers/ruby.webp", pattern: "spiral", palette: { top: "#f4a3a3", mid: "#b84049", low: "#7d1d27", rim: "#440a10", ring: "rgba(255,215,215,0.45)" } },
  { id: "sapphire", label: "Sapphire", image: "art/strikers/sapphire.webp", pattern: "star", palette: { top: "#a9c8f4", mid: "#4a73b8", low: "#244270", rim: "#11233f", ring: "rgba(215,230,255,0.45)" } },
  { id: "gold", label: "Gold", image: "art/strikers/gold.webp", pattern: "ring", palette: { top: "#fff0b3", mid: "#d9a92e", low: "#9a7212", rim: "#5c4206", ring: "rgba(255,245,190,0.5)" } },
  { id: "carbon", label: "Carbon", image: "art/strikers/carbon.webp", pattern: "cross", palette: { top: "#8d9399", mid: "#4b5157", low: "#262a2e", rim: "#101214", ring: "rgba(200,210,220,0.3)" } },
];

export interface PieceSet {
  id: string;
  label: string;
  /** The four player colours and the queen, in white/black/green/yellow/queen order. */
  pieces: [Palette, Palette, Palette, Palette, Palette];
}

const P = (top: string, mid: string, low: string, rim: string, ring: string): Palette => ({
  top, mid, low, rim, ring,
});

export const PIECE_SETS: PieceSet[] = [
  {
    id: "standard",
    label: "Standard",
    pieces: [
      P("#fffdf4", "#efe3c9", "#c3ab84", "#8a7452", "rgba(120,96,60,0.4)"),
      P("#4b4d50", "#22252a", "#0d0f11", "#050607", "rgba(226,214,186,0.34)"),
      P("#7fd6ab", "#2f7d55", "#14442c", "#0b2a1c", "rgba(214,246,226,0.4)"),
      P("#f6d68c", "#c9932c", "#8a5f12", "#5d3d08", "rgba(255,244,214,0.45)"),
      P("#e4605a", "#c02d38", "#74131c", "#4a0c12", "rgba(246,206,148,0.6)"),
    ],
  },
  {
    id: "ivory-onyx",
    label: "Ivory & Onyx",
    pieces: [
      P("#ffffff", "#f2ead8", "#d5c7a6", "#a09070", "rgba(120,96,60,0.35)"),
      P("#3d3d3d", "#1c1c1c", "#080808", "#000000", "rgba(230,230,230,0.3)"),
      P("#6fbc93", "#32714f", "#17402a", "#0a2416", "rgba(210,240,220,0.4)"),
      P("#e8c470", "#bd9028", "#805510", "#503306", "rgba(255,240,200,0.45)"),
      P("#d84545", "#a51f2a", "#680d14", "#3c060a", "rgba(240,190,150,0.5)"),
    ],
  },
  {
    id: "pastel",
    label: "Pastel",
    pieces: [
      P("#fffaf0", "#f5ead5", "#e0cfaa", "#b8a67e", "rgba(150,130,90,0.3)"),
      P("#8e9aa6", "#66717d", "#3f4851", "#22282e", "rgba(220,230,240,0.3)"),
      P("#b9e8d0", "#7cc4a1", "#4a8a6b", "#2c593f", "rgba(235,255,240,0.4)"),
      P("#ffe6a8", "#eec66a", "#c99a34", "#916a19", "rgba(255,245,210,0.45)"),
      P("#f7a8a8", "#d96068", "#a8323c", "#701c24", "rgba(255,220,220,0.5)"),
    ],
  },
  {
    id: "jewel",
    label: "Jewel",
    pieces: [
      P("#ffffff", "#eee9dc", "#cfc6ad", "#9c9380", "rgba(140,130,100,0.35)"),
      P("#2f3a52", "#1b2233", "#0c101a", "#05070d", "rgba(200,215,240,0.35)"),
      P("#64d6b0", "#2a9d74", "#166047", "#0b3527", "rgba(210,255,235,0.45)"),
      P("#f2c94c", "#c99a1e", "#8e6b0f", "#553f06", "rgba(255,245,190,0.5)"),
      P("#e84a5f", "#b3162c", "#770917", "#430409", "rgba(255,200,210,0.55)"),
    ],
  },
  {
    id: "neon",
    label: "Neon",
    pieces: [
      P("#ffffff", "#e9f7ff", "#b9d8e8", "#7a9bad", "rgba(160,220,255,0.4)"),
      P("#5b6bff", "#2f3bd1", "#18208c", "#0b0f4a", "rgba(190,200,255,0.4)"),
      P("#6dffb8", "#22c97e", "#0f7d4c", "#07452a", "rgba(200,255,225,0.45)"),
      P("#ffe066", "#e0b81c", "#9c7f08", "#5a4804", "rgba(255,250,190,0.5)"),
      P("#ff5ed0", "#c22193", "#7d0d5d", "#480632", "rgba(255,210,245,0.55)"),
    ],
  },
  {
    id: "earth",
    label: "Earth",
    pieces: [
      P("#efe3cc", "#dcc9a4", "#bfa77d", "#8c7654", "rgba(130,105,70,0.35)"),
      P("#6b6259", "#453d36", "#27221e", "#14110e", "rgba(220,205,185,0.3)"),
      P("#8fae72", "#5d7d47", "#375029", "#1f2e17", "rgba(220,240,200,0.4)"),
      P("#d4a25c", "#a87432", "#7a4f18", "#4d310c", "rgba(255,235,190,0.45)"),
      P("#c46048", "#92382a", "#5f1f16", "#38100b", "rgba(245,205,180,0.5)"),
    ],
  },
  {
    id: "ocean",
    label: "Ocean",
    pieces: [
      P("#eef9ff", "#d4ebf5", "#a8c6d6", "#7793a3", "rgba(170,210,230,0.35)"),
      P("#3e5c76", "#263d52", "#142534", "#08121b", "rgba(200,225,245,0.35)"),
      P("#63d6c4", "#2f9d8d", "#185f55", "#0c3730", "rgba(210,255,245,0.45)"),
      P("#f4d67a", "#c9a636", "#906f15", "#584308", "rgba(255,245,200,0.5)"),
      P("#ef6d6d", "#bd3038", "#7c141b", "#46070b", "rgba(255,215,215,0.55)"),
    ],
  },
  {
    id: "royal",
    label: "Royal",
    pieces: [
      P("#fff6dd", "#ead9a5", "#cbb172", "#9a8253", "rgba(150,125,75,0.4)"),
      P("#3b2c5a", "#241a3d", "#120c21", "#07050f", "rgba(215,200,245,0.35)"),
      P("#4fbf8f", "#2b8a61", "#17543a", "#0b3020", "rgba(210,245,225,0.45)"),
      P("#e8bd4a", "#b78d20", "#825f0f", "#503a06", "rgba(255,240,180,0.5)"),
      P("#d23b64", "#9e1e42", "#690d2a", "#3d0517", "rgba(255,205,225,0.55)"),
    ],
  },
  {
    id: "mono",
    label: "Monochrome",
    pieces: [
      P("#ffffff", "#f0f0f0", "#d0d0d0", "#a0a0a0", "rgba(120,120,120,0.3)"),
      P("#5a5a5a", "#333333", "#181818", "#080808", "rgba(230,230,230,0.3)"),
      P("#b9b9b9", "#8e8e8e", "#5f5f5f", "#383838", "rgba(230,230,230,0.3)"),
      P("#dedede", "#bcbcbc", "#909090", "#606060", "rgba(230,230,230,0.3)"),
      P("#c8c8c8", "#999999", "#6a6a6a", "#404040", "rgba(240,240,240,0.4)"),
    ],
  },
  {
    id: "copper-set",
    label: "Copper",
    pieces: [
      P("#fff0dc", "#e8cfae", "#c4a27a", "#90714e", "rgba(150,115,75,0.35)"),
      P("#6e5a4a", "#45352a", "#271d16", "#130d09", "rgba(225,205,185,0.3)"),
      P("#a8c48d", "#6f9454", "#426030", "#25381a", "rgba(220,240,200,0.4)"),
      P("#e8a85c", "#bd7730", "#845114", "#51300a", "rgba(255,235,190,0.45)"),
      P("#cf6a4a", "#9c3f28", "#682315", "#3d110a", "rgba(245,210,180,0.5)"),
    ],
  },
];

/** Every art group a player can choose, in one place. */
export type ArtGroupId =
  | "boards"
  | "strikers"
  | "pucks"
  | "trails"
  | "pockets"
  | "shine"
  | "frames"
  | "buff";

/** The designs and art paths a table is wearing at once. */
export interface TableVisuals {
  board: BoardDesign;
  striker: StrikerDesign;
  pieces: PieceSet;
  /** A choice is either `builtin:<id>` or a path into `public/art/game/`. */
  art: Partial<Record<ArtGroupId, string>>;
  /** The resolved image path of each group, ready for the renderer. */
  paths: Partial<Record<ArtGroupId, string>>;
}

function isBuiltin(choice: string | undefined, id: string): boolean {
  return choice === undefined || choice === "" || choice === `builtin:${id}`;
}

function pathOf(choice: string | undefined): string | undefined {
  return choice !== undefined && choice !== "" && !choice.startsWith("builtin:")
    ? choice
    : undefined;
}

/**
 * Resolve one choice map into the board, striker, pieces and effect images.
 * The built-in designs and the ripped artwork use the same choices, so a
 * player never has to look in two different panels.
 */
export function tableVisuals(
  boardId: string,
  strikerId: string,
  pieceId: string,
  art: Partial<Record<ArtGroupId, string>> = {},
): TableVisuals {
  const boardChoice = art.boards ?? `builtin:${boardId}`;
  const strikerChoice = art.strikers ?? `builtin:${strikerId}`;
  const pieceChoice = art.pucks ?? `builtin:${pieceId}`;

  const board = boardDesign(isBuiltin(boardChoice, boardId) ? boardId : "");
  const striker = strikerDesign(
    isBuiltin(strikerChoice, strikerId) ? strikerId : "",
  );
  const pieces = pieceSet(isBuiltin(pieceChoice, pieceId) ? pieceId : "");

  const paths: TableVisuals["paths"] = {};
  if (!isBuiltin(boardChoice, boardId)) {
    paths.boards = pathOf(boardChoice);
  }
  if (!isBuiltin(strikerChoice, strikerId)) {
    paths.strikers = pathOf(strikerChoice);
  }
  if (!isBuiltin(pieceChoice, pieceId)) {
    paths.pucks = pathOf(pieceChoice);
  }
  for (const group of ["trails", "pockets", "shine", "frames", "buff"] as const) {
    const path = pathOf(art[group]);
    if (path !== undefined) {
      paths[group] = path;
    }
  }

  return {
    board: paths.boards !== undefined ? { ...board, texture: paths.boards } : board,
    striker:
      paths.strikers !== undefined
        ? { ...striker, image: paths.strikers }
        : striker,
    pieces,
    art,
    paths,
  };
}

export function boardDesign(id: string): BoardDesign {
  return BOARD_DESIGNS.find((design) => design.id === id) ?? BOARD_DESIGNS[0]!;
}

export function strikerDesign(id: string): StrikerDesign {
  return STRIKER_DESIGNS.find((design) => design.id === id) ?? STRIKER_DESIGNS[0]!;
}

export function pieceSet(id: string): PieceSet {
  return PIECE_SETS.find((set) => set.id === id) ?? PIECE_SETS[0]!;
}
