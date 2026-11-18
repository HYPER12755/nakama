/** Storage keys are namespaced by the game id so titles never share state. */
const GAME_ID = __MOONGAMES_GAME_ID__;

export function gameStorageKey(name: string): string {
  return `moongames.${GAME_ID}.${name}`;
}
