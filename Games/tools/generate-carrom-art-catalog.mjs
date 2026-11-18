// Build the art catalog from the real assets extracted from the carrom games.
// It writes a TypeScript module that the picker reads. Run from Games/.

import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../Carrom/web/public/art/game/", import.meta.url);
const files = readdirSync(root).filter((name) => name.endsWith(".png") || name.endsWith(".webp"));

const families = [
  ["boards", /^(Table_|IngameBG_Table_|Wornboard_BG|shadow_board|CE_CarromTrials_Table)/],
  ["sliders", /^Slider_/],
  ["strikers", /^Striker_(?!Buff_)/],
  ["pucks", /^Puck_/],
  ["trails", /^(Particle_Trails_|Texture_Trails_)/],
  ["pockets", /^(Pocket_effect|Pocket_Vfx|particle_pocket_vfx)/],
  ["shine", /^GS_Shine/],
  ["frames", /^Frames_Carrom_/],
  ["buff", /^Striker_Buff_/],
];

const groups = {};
for (const [name, pattern] of families) {
  groups[name] = files
    .filter((file) => pattern.test(file))
    .sort()
    .map((file) => `art/game/${file}`);
}

const output = `// Generated from the real game assets. Run node tools/generate-carrom-art-catalog.mjs
// after adding art. Every file is listed; the picker offers all of it.
export interface ArtGroup {
  id: string;
  label: string;
  files: string[];
}

export const ART_GROUPS: ArtGroup[] = ${JSON.stringify(
  families.map(([id, pattern]) => ({
    id,
    label: id.charAt(0).toUpperCase() + id.slice(1),
    files: groups[id],
  })),
  null,
  2,
)};

export function artFiles(group: string): string[] {
  return ART_GROUPS.find((entry) => entry.id === group)?.files ?? [];
}

export const ART_TOTAL = ART_GROUPS.reduce((sum, group) => sum + group.files.length, 0);
`;

const outUrl = new URL("../Carrom/web/src/lib/artCatalog.generated.ts", import.meta.url);
writeFileSync(outUrl, output);
console.log(`cataloged ${files.length} files into ${families.length} groups`);
for (const [name] of families) console.log(name, groups[name].length);
