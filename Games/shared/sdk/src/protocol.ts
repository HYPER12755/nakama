import type { GameHostConfig, GameSession, GameTheme } from "./manifest";

export const GAME_PROTOCOL_VERSION = 1;

export type HostToGameMessage =
  | { type: "init"; protocol: number; config: GameHostConfig }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "destroy" }
  | { type: "theme"; theme: GameTheme }
  | { type: "session"; session: GameSession };

export type GameToHostMessage =
  | { type: "ready"; gameId: string; version: string }
  | { type: "exit"; reason?: string }
  | { type: "toast"; message: string; level?: "info" | "success" | "error" }
  | { type: "haptic"; pattern: "light" | "medium" | "heavy" | "success" | "error" }
  | { type: "sound"; name: string }
  | { type: "openUrl"; url: string }
  | { type: "analytics"; event: string; properties?: Record<string, unknown> }
  | { type: "requestSessionRefresh" };

const HOST_MESSAGE_TYPES = new Set<string>([
  "init",
  "pause",
  "resume",
  "destroy",
  "theme",
  "session",
]);

export function isHostToGameMessage(value: unknown): value is HostToGameMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && HOST_MESSAGE_TYPES.has(type);
}
