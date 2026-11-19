import { GAME_PROTOCOL_VERSION } from "./protocol";
import type {
  GameAccountMode,
  GameHostConfig,
  GameSession,
  GameTheme,
  NakamaConnection,
} from "./manifest";

/**
 * The web launcher and an installed game share an origin. A one-time,
 * session-scoped handoff carries the launcher's authoritative session into an
 * official game. Native hosts pass the same data over the normal bridge.
 */
export const LAUNCHER_HANDOFF_FORMAT = 1;
const HANDOFF_PREFIX = "moongames.launcher.handoff.v1.";

export interface LauncherHandoffProof {
  gameId: string;
  version: string;
  sha256: string;
  size: number;
  keyId: string;
  publicKey: string;
  signature: string;
}

export interface LauncherHandoff {
  format: typeof LAUNCHER_HANDOFF_FORMAT;
  gameId: string;
  accountMode: Extract<GameAccountMode, "shared">;
  issuedAt: number;
  config: GameHostConfig;
  proof: LauncherHandoffProof;
}

export interface HandoffStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function launcherHandoffKey(gameId: string): string {
  return `${HANDOFF_PREFIX}${gameId}`;
}

function defaultStorage(): HandoffStorage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isTheme(value: unknown): value is GameTheme {
  if (!isRecord(value) || typeof value.mode !== "string") {
    return false;
  }
  if (value.mode !== "light" && value.mode !== "dark" && value.mode !== "system") {
    return false;
  }
  return (
    (value.accent === undefined || typeof value.accent === "string") &&
    (value.background === undefined || typeof value.background === "string") &&
    (value.surface === undefined || typeof value.surface === "string") &&
    (value.text === undefined || typeof value.text === "string")
  );
}

function isSession(value: unknown): value is GameSession {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.token === "string" &&
    value.token.length > 0 &&
    typeof value.userId === "string" &&
    value.userId.length > 0 &&
    typeof value.username === "string" &&
    typeof value.expiresAt === "number" &&
    Number.isFinite(value.expiresAt) &&
    (value.refreshToken === undefined || typeof value.refreshToken === "string")
  );
}

function isNakama(value: unknown): value is NakamaConnection {
  return (
    isRecord(value) &&
    typeof value.host === "string" &&
    value.host.length > 0 &&
    typeof value.port === "string" &&
    value.port.length > 0 &&
    typeof value.serverKey === "string" &&
    value.serverKey.length > 0 &&
    typeof value.useSSL === "boolean"
  );
}

function isProof(value: unknown): value is LauncherHandoffProof {
  return (
    isRecord(value) &&
    typeof value.gameId === "string" &&
    typeof value.version === "string" &&
    typeof value.sha256 === "string" &&
    /^[a-f0-9]{64}$/.test(value.sha256) &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    typeof value.keyId === "string" &&
    typeof value.publicKey === "string" &&
    typeof value.signature === "string"
  );
}

function parseHandoff(value: unknown): LauncherHandoff | null {
  if (!isRecord(value)) {
    return null;
  }
  const config = value.config;
  if (
    value.format !== LAUNCHER_HANDOFF_FORMAT ||
    typeof value.gameId !== "string" ||
    value.accountMode !== "shared" ||
    typeof value.issuedAt !== "number" ||
    !Number.isFinite(value.issuedAt) ||
    !isProof(value.proof) ||
    !isRecord(config)
  ) {
    return null;
  }
  if (
    value.proof.gameId !== value.gameId ||
    config.gameId !== value.gameId ||
    config.protocol !== GAME_PROTOCOL_VERSION ||
    config.accountMode !== "shared" ||
    config.official !== true ||
    typeof config.locale !== "string" ||
    !isTheme(config.theme) ||
    !isSession(config.session) ||
    !isNakama(config.nakama)
  ) {
    return null;
  }
  return value as unknown as LauncherHandoff;
}

export function writeLauncherHandoff(
  handoff: LauncherHandoff,
  storage: HandoffStorage | null = defaultStorage(),
): boolean {
  if (storage === null) {
    return false;
  }
  const parsed = parseHandoff(handoff);
  if (parsed === null) {
    return false;
  }
  try {
    storage.setItem(
      launcherHandoffKey(handoff.gameId),
      JSON.stringify(parsed),
    );
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("moongames:launcher-handoff", {
        detail: { gameId: handoff.gameId },
      }));
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads the launcher session scoped to one official game. The payload is
 * intentionally left in session storage so a reload in the same tab keeps the
 * shared identity. Starting the game in per-game mode clears it first.
 */
export function readLauncherHandoff(
  gameId: string,
  storage: HandoffStorage | null = defaultStorage(),
): GameHostConfig | null {
  if (storage === null) {
    return null;
  }
  const key = launcherHandoffKey(gameId);
  try {
    const raw = storage.getItem(key);
    if (raw === null) {
      return null;
    }
    const handoff = parseHandoff(JSON.parse(raw));
    if (handoff === null || handoff.gameId !== gameId) {
      storage.removeItem(key);
      return null;
    }
    return handoff.config;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable.
    }
    return null;
  }
}

export function clearLauncherHandoff(
  gameId: string,
  storage: HandoffStorage | null = defaultStorage(),
): void {
  if (storage === null) {
    return;
  }
  try {
    storage.removeItem(launcherHandoffKey(gameId));
  } catch {
    // Storage can be unavailable.
  }
}

/**
 * Clears every game-scoped launcher identity. The menu uses this before it
 * hands the tab to an independent game and when it becomes the active page, so
 * an unverified bundle cannot inspect a stale token left by another game.
 */
export function clearAllLauncherHandoffs(
  storage: HandoffStorage | null = defaultStorage(),
): void {
  if (storage === null) {
    return;
  }
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key !== null && key.startsWith(HANDOFF_PREFIX)) {
        storage.removeItem(key);
      }
    }
  } catch {
    // Storage can be unavailable.
  }
}
