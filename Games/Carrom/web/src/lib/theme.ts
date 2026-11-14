import type { GameTheme } from "@moongames/game-sdk";
import { gameStorageKey } from "./storage";

export type Theme = "dark" | "light";

const THEME_KEY = gameStorageKey("theme");

export function storedTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_KEY) === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

export function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Storage can be unavailable in private or embedded contexts.
  }
}

export function resolveGameTheme(theme: GameTheme): Theme {
  if (theme.mode === "light" || theme.mode === "dark") {
    return theme.mode;
  }
  if (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}
