/**
 * The artwork choices, kept on the device and shared by the picker and the
 * board. A change reaches every player of the choice at once, so the table
 * repaints the moment a player picks a new board or striker.
 */
import { gameStorageKey } from "./storage";

export type ArtChoiceMap = Record<string, string>;

const KEY = gameStorageKey("art-choices");
const listeners = new Set<(choices: ArtChoiceMap) => void>();
let current: ArtChoiceMap = {};
let loaded = false;

function read(): ArtChoiceMap {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as ArtChoiceMap;
    }
  } catch {
    // Storage can be blocked in a private or embedded view.
  }
  return {};
}

function ensureLoaded(): void {
  if (loaded || typeof window === "undefined") {
    return;
  }
  loaded = true;
  current = read();
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) {
      current = read();
      notify();
    }
  });
}

function notify(): void {
  for (const listener of listeners) {
    listener(current);
  }
}

export function artChoices(): ArtChoiceMap {
  ensureLoaded();
  return current;
}

export function setArtChoice(group: string, file: string): void {
  ensureLoaded();
  current = { ...current, [group]: file };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // The choice still applies for this visit.
  }
  notify();
}

export function onArtChange(listener: (choices: ArtChoiceMap) => void): () => void {
  ensureLoaded();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
