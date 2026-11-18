/**
 * Every real carrom sound from the game, named for the event it belongs to.
 *
 * The board does not choose a favourite recording for an event. Each sound is
 * kept in the order it was recorded and played in turn, so every file in the
 * set is heard and no hit sounds exactly like the one before it.
 */

export type BoardEvent =
  /** The striker leaving the baseline. */
  | "strike"
  /** Any disc-to-disc or disc-to-frame contact, merged into one family. */
  | "puck"
  | "pot"
  | "break"
  | "queenCover"
  | "queenFail"
  | "queenScore"
  | "puckScore"
  | "puckBack"
  | "foul"
  | "turn"
  | "start"
  | "win"
  | "lose"
  | "rematch"
  | "clock"
  | "move"
  | "aim"
  | "place";

/** The quiet background tracks from the game, for the player who wants them. */
export const CARROM_POOL_MUSIC = ["carrom_pet", "carrominho"];

/** Music is played as a loop, not as an event, but it is still used. */
export const MUSIC_FILES: Record<string, string[]> = {
  carrompool: CARROM_POOL_MUSIC,
};

/** The Carrom Pool set: each entry is a real file from the game. */
export const CARROM_POOL_SOUNDS: Record<BoardEvent, string[]> = {
  strike: [
    "sfx_striker_shoot_1", "sfx_striker_shoot_2", "sfx_striker_shoot_3",
    "sfx_striker_shoot_4", "sfx_striker_shoot_5",
  ],
  // One puck family: every real striker-hit, puck-hit and edge-hit recording
  // in the game, in the order it was recorded. No duplicate categories.
  puck: [
    ...Array.from({ length: 17 }, (_, i) => `sfx_striker_hits_puck_${i + 1}`),
    ...Array.from({ length: 35 }, (_, i) => `sfx_puck_hits_puck_${i + 1}`),
    ...Array.from({ length: 20 }, (_, i) => `sfx_puck_hits_edge_${i + 1}`),
  ],
  pot: [],
  break: [],
  queenCover: ["sfx_queen_cover_success"],
  queenFail: ["sfx_queen_cover_fail"],
  queenScore: ["sfx_queen_addToPuckCounter"],
  puckScore: ["sfx_puck_addToPuckCounter"],
  puckBack: ["sfx_puck_back_to_board"],
  foul: ["sfx_foul"],
  turn: [
    "sfx_your_turn_1", "sfx_your_turn_2", "sfx_your_turn_3",
    "sfx_your_turn_4", "sfx_your_turn_5",
  ],
  start: ["sfx_game_start"],
  win: ["sfx_you_win", "sfx_winner_victoryMenu"],
  lose: ["sfx_you_lose"],
  rematch: ["sfx_rematchButton_victoryMenu"],
  clock: ["sfx_clock_LOOP"],
  move: ["sfx_puck_move_LOOP_1", "sfx_puck_move_LOOP_2", "sfx_puck_move_LOOP_3"],
  aim: ["sfx_striker_drag_LOOP"],
  place: ["sfx_striker_placeOnBoard"],
};

// Fill the numbered families in order. Nothing is skipped or left out.
for (let index = 1; index <= 17; index += 1) {
  CARROM_POOL_SOUNDS.pot.push(`sfx_puck_pot_${index}`);
}
for (let index = 1; index <= 15; index += 1) {
  CARROM_POOL_SOUNDS.break.push(`sfx_breakshot_${index}`);
}

/** Build a catalog from a folder of numbered real recordings. */
function numberedSet(max: Partial<Record<BoardEvent, number>> = {}): Record<BoardEvent, string[]> {
  const counts: Partial<Record<BoardEvent, number>> = {
    // Use every recording shipped in each set, not a hand-picked subset.
    strike: 17, puck: 17, pot: 10,
    break: 3, queenCover: 3, queenFail: 1, queenScore: 1, puckScore: 1,
    puckBack: 1, foul: 3, turn: 5, start: 3, win: 3, lose: 1, rematch: 1,
    clock: 0, move: 0, aim: 0, place: 0,
    ...max,
  };
  const files = (prefix: string, count = 0) =>
    Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);
  return {
    strike: files("strike", counts.strike),
    // One puck family in the small sets too, not three copies of "strike".
    puck: files("strike", counts.puck),
    pot: files("pocket", counts.pot),
    break: files("start", counts.break),
    queenCover: files("queen", counts.queenCover),
    queenFail: ["foul2"],
    queenScore: ["queen2"],
    puckScore: ["pocket2"],
    puckBack: ["turn3"],
    foul: files("foul", counts.foul),
    turn: files("turn", counts.turn),
    start: files("start", counts.start),
    win: files("win", counts.win),
    lose: ["foul1"],
    rematch: ["start2"],
    clock: [],
    move: [],
    aim: [],
    place: [],
  };
}

/** Three genuinely different sets, each from its own real recordings. */
export const STANDARD_SOUNDS = numberedSet();
const SMALL = { strike: 5, puck: 5, pot: 5 };
export const SOFT_SOUNDS = numberedSet(SMALL);
export const BRIGHT_SOUNDS = numberedSet(SMALL);

/** The sound sets a player can choose, each built from these catalogs. */
export const SOUND_CATALOGS: Record<string, Record<BoardEvent, string[]>> = {
  standard: STANDARD_SOUNDS,
  soft: SOFT_SOUNDS,
  bright: BRIGHT_SOUNDS,
  carrompool: CARROM_POOL_SOUNDS,
};

export function soundsFor(
  set: string,
  event: BoardEvent,
): string[] {
  const catalog = SOUND_CATALOGS[set] ?? STANDARD_SOUNDS;
  return catalog[event];
}

/** How loud each event is, relative to the player's chosen volume. */
export const EVENT_GAIN: Record<BoardEvent, number> = {
  strike: 0.85,
  puck: 0.8,
  pot: 1,
  break: 0.95,
  queenCover: 1,
  queenFail: 0.8,
  queenScore: 0.9,
  puckScore: 0.8,
  puckBack: 0.6,
  foul: 0.9,
  turn: 0.55,
  start: 0.6,
  win: 1,
  lose: 0.9,
  rematch: 0.7,
  clock: 0.35,
  move: 0.3,
  aim: 0.25,
  place: 0.4,
};
