/**
 * The storage of this title. Every key is built from the game id the build
 * carries, so a client never writes a key that belongs to another title.
 */
const GAME_ID = __MOONGAMES_GAME_ID__;

export function gameStorageKey(name: string): string {
  return `moongames.${GAME_ID}.${name}`;
}

const ART_KEY = gameStorageKey("art-choices");

export function readArtChoices(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(ART_KEY);
    return raw === null ? {} : (JSON.parse(raw) as Record<string, string>);
  } catch {
    return {};
  }
}

export function writeArtChoices(choices: Record<string, string>): void {
  try {
    window.localStorage.setItem(ART_KEY, JSON.stringify(choices));
  } catch {
    // Storage may be unavailable; the table still plays with the defaults.
  }
}
