/**
 * The one list of everything a player can put on the table. The hand-made
 * designs and the artwork taken from the real games live in the same groups,
 * so there is one panel and no duplicate categories.
 */
import {
  BOARD_DESIGNS,
  PIECE_SETS,
  STRIKER_DESIGNS,
  type ArtGroupId,
} from "./designs";
import { ART_GROUPS } from "./artCatalog.generated";

export interface CosmeticOption {
  /** The value stored in the choices: `builtin:<id>` or an art path. */
  id: string;
  label: string;
  /** An image to show in the picker, when the option has real artwork. */
  image?: string;
  /** Two colours for the hand-made options with no image. */
  colors?: [string, string];
}

export interface CosmeticGroup {
  id: ArtGroupId;
  label: string;
  options: CosmeticOption[];
}

const ripped = (id: ArtGroupId): CosmeticOption[] =>
  (ART_GROUPS.find((group) => group.id === id)?.files ?? []).map((file) => ({
    id: file,
    label: file.split("/").pop()?.replace(/\.(png|webp)$/, "") ?? file,
    image: file,
  }));

export const COSMETIC_GROUPS: CosmeticGroup[] = [
  {
    id: "boards",
    label: "Boards",
    options: [
      ...BOARD_DESIGNS.map((design) => ({
        id: `builtin:${design.id}`,
        label: design.label,
        colors: [design.surface[0], design.frame[0]] as [string, string],
      })),
      ...ripped("boards"),
    ],
  },
  {
    id: "strikers",
    label: "Strikers",
    options: [
      ...STRIKER_DESIGNS.map((design) => ({
        id: `builtin:${design.id}`,
        label: design.label,
        colors: [design.palette.top, design.palette.low] as [string, string],
      })),
      ...ripped("strikers"),
    ],
  },
  {
    id: "pucks",
    label: "Pucks",
    options: [
      ...PIECE_SETS.map((set) => ({
        id: `builtin:${set.id}`,
        label: set.label,
        colors: [set.pieces[0].top, set.pieces[1].low] as [string, string],
      })),
      ...ripped("pucks"),
    ],
  },
  {
    id: "trails",
    label: "Trails",
    options: ripped("trails"),
  },
  {
    id: "pockets",
    label: "Pockets",
    options: ripped("pockets"),
  },
  {
    id: "shine",
    label: "Shine",
    options: ripped("shine"),
  },
  {
    id: "frames",
    label: "Frames",
    options: ripped("frames"),
  },
  {
    id: "buff",
    label: "Badges",
    options: ripped("buff"),
  },
];

const DEFAULTS: Record<ArtGroupId, string> = {
  boards: `builtin:${BOARD_DESIGNS[0]!.id}`,
  strikers: `builtin:${STRIKER_DESIGNS[0]!.id}`,
  pucks: `builtin:${PIECE_SETS[0]!.id}`,
  trails: "",
  pockets: "",
  shine: "",
  frames: "",
  buff: "",
};

export function defaultChoice(group: ArtGroupId): string {
  return DEFAULTS[group];
}

export function cosmeticLabel(id: string): string {
  for (const group of COSMETIC_GROUPS) {
    const option = group.options.find((entry) => entry.id === id);
    if (option !== undefined) {
      return option.label;
    }
  }
  return id;
}
