/**
 * The storage of this title. Every key is built from the game id the build
 * carries, so a client never writes a key that belongs to another title.
 */
const GAME_ID = __MOONGAMES_GAME_ID__;

export function gameStorageKey(name: string): string {
  return `moongames.${GAME_ID}.${name}`;
}

