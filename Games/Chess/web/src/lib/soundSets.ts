/**
 * The sets of sounds a player can choose.
 *
 * The sounds are real recordings, kept beside the game. The house set is a
 * mix of three of the lichess themes, and the rest are whole themes of their
 * own. `public/sounds/README.txt` says more.
 */

export interface SoundSet {
  id: string;
  label: string;
}

export const SOUND_SETS: SoundSet[] = [
  { id: "moongames", label: "MoonGames" },
  { id: "standard", label: "Standard" },
  { id: "futuristic", label: "Futuristic" },
  { id: "robot", label: "Robot" },
  { id: "woodland", label: "Woodland" },
  { id: "piano", label: "Piano" },
  { id: "nes", label: "Arcade" },
  { id: "sfx", label: "Effects" },
  { id: "lisp", label: "Short" },
];

export const DEFAULT_SOUND_SET = "moongames";

export function soundSetLabel(id: string): string {
  return SOUND_SETS.find((set) => set.id === id)?.label ?? id;
}

/** True when the game has the sounds of this set. */
export function isSoundSet(id: string): boolean {
  return SOUND_SETS.some((set) => set.id === id);
}
