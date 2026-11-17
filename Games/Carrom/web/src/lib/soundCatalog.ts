/**
 * Every real carrom sound from the game, named for the event it belongs to.
 *
 * The board does not choose a favourite recording for an event. Each sound is
 * kept in the order it was recorded and played in turn, so every file in the
 * set is heard and no hit sounds exactly like the one before it.
 */

export type BoardEvent =
  | "strike"
  | "hitPuck"
  | "puckHit"
  | "hitEdge"
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
  | "rematch";

/** The quiet background tracks from the game, for the player who wants them. */
export const CARROM_POOL_MUSIC = ["carrom_pet", "carrominho"];

/** The Carrom Pool set: each entry is a real file from the game. */
export const CARROM_POOL_SOUNDS: Record<BoardEvent, string[]> = {
  strike: [
    "sfx_striker_shoot_1", "sfx_striker_shoot_2", "sfx_striker_shoot_3",
    "sfx_striker_shoot_4", "sfx_striker_shoot_5",
  ],
  hitPuck: [],
  puckHit: [],
  hitEdge: [],
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
};

// Fill the numbered families in order. Nothing is skipped or left out.
for (let index = 1; index <= 17; index += 1) {
  CARROM_POOL_SOUNDS.hitPuck.push(`sfx_striker_hits_puck_${index}`);
}
for (let index = 1; index <= 35; index += 1) {
  CARROM_POOL_SOUNDS.puckHit.push(`sfx_puck_hits_puck_${index}`);
}
for (let index = 1; index <= 20; index += 1) {
  CARROM_POOL_SOUNDS.hitEdge.push(`sfx_puck_hits_edge_${index}`);
}
for (let index = 1; index <= 17; index += 1) {
  CARROM_POOL_SOUNDS.pot.push(`sfx_puck_pot_${index}`);
}
for (let index = 1; index <= 15; index += 1) {
  CARROM_POOL_SOUNDS.break.push(`sfx_breakshot_${index}`);
}

/** The smaller sets use one representative recording per event. */
export const STANDARD_SOUNDS: Record<BoardEvent, string[]> = {
  strike: ["strike1", "strike2", "strike3", "strike4", "strike5"],
  hitPuck: ["strike1", "strike2", "strike3"],
  puckHit: ["strike4", "strike5"],
  hitEdge: ["strike2", "strike3"],
  pot: ["pocket1", "pocket2", "pocket3", "pocket4", "pocket5"],
  break: ["start1", "start2", "start3"],
  queenCover: ["queen1", "queen2", "queen3"],
  queenFail: ["foul2"],
  queenScore: ["queen2"],
  puckScore: ["pocket2"],
  puckBack: ["turn3"],
  foul: ["foul1", "foul2", "foul3"],
  turn: ["turn1", "turn2", "turn3", "turn4", "turn5"],
  start: ["start1", "start2", "start3"],
  win: ["win1", "win2", "win3"],
  lose: ["foul1"],
  rematch: ["start2"],
} as Record<BoardEvent, string[]>;

/** The sound sets a player can choose, each built from these catalogs. */
export const SOUND_CATALOGS: Record<string, Record<BoardEvent, string[]>> = {
  standard: STANDARD_SOUNDS,
  soft: STANDARD_SOUNDS,
  bright: STANDARD_SOUNDS,
  carrompool: CARROM_POOL_SOUNDS,
};

export function soundsFor(
  set: string,
  event: BoardEvent,
): string[] {
  const catalog = SOUND_CATALOGS[set] ?? STANDARD_SOUNDS;
  return catalog[event];
}
