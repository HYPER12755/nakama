import { describe, expect, it } from "vitest";
import {
  GAME_PROTOCOL_VERSION,
  LAUNCHER_HANDOFF_FORMAT,
  clearAllLauncherHandoffs,
  clearLauncherHandoff,
  launcherHandoffKey,
  readLauncherHandoff,
  writeLauncherHandoff,
  type GameHostConfig,
  type HandoffStorage,
  type LauncherHandoff,
} from "@moongames/game-sdk";

function memoryStorage(): HandoffStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    get length() {
      return values.size;
    },
    key: (index) => [...values.keys()][index] ?? null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

function config(gameId = "chess"): GameHostConfig {
  return {
    protocol: GAME_PROTOCOL_VERSION,
    gameId,
    locale: "en",
    theme: { mode: "dark", accent: "#e5b85c" },
    session: {
      token: "launcher-token",
      refreshToken: "launcher-refresh",
      userId: "user-1",
      username: "player",
      expiresAt: 1_900_000_000,
    },
    nakama: {
      host: "127.0.0.1",
      port: "7350",
      serverKey: "defaultkey",
      useSSL: false,
    },
    accountMode: "shared",
    official: true,
    release: {
      version: "0.6.0",
      sha256: "a".repeat(64),
      keyId: "dev-1",
    },
  };
}

function handoff(gameId = "chess"): LauncherHandoff {
  return {
    format: LAUNCHER_HANDOFF_FORMAT,
    gameId,
    accountMode: "shared",
    issuedAt: 1_800_000_000_000,
    config: config(gameId),
    proof: {
      gameId,
      version: "0.6.0",
      sha256: "a".repeat(64),
      size: 1234,
      keyId: "dev-1",
      publicKey: "public-key",
      signature: "signature",
    },
  };
}

describe("launcher web handoff", () => {
  it("round-trips a verified shared account for one game", () => {
    const storage = memoryStorage();
    expect(writeLauncherHandoff(handoff(), storage)).toBe(true);
    expect(storage.values.has(launcherHandoffKey("chess"))).toBe(true);
    expect(readLauncherHandoff("chess", storage)).toEqual(config());
    expect(readLauncherHandoff("cards", storage)).toBeNull();
  });

  it("keeps the handoff available for an in-tab reload", () => {
    const storage = memoryStorage();
    expect(writeLauncherHandoff(handoff(), storage)).toBe(true);
    expect(readLauncherHandoff("chess", storage)).not.toBeNull();
    expect(readLauncherHandoff("chess", storage)).not.toBeNull();
  });

  it("rejects non-shared or incomplete payloads", () => {
    const storage = memoryStorage();
    const perGame = handoff();
    const invalid = {
      ...perGame,
      config: { ...perGame.config, accountMode: "per-game" as const },
    };
    expect(writeLauncherHandoff(invalid, storage)).toBe(false);

    const missingNakama = {
      ...perGame,
      config: { ...perGame.config, nakama: undefined },
    };
    expect(writeLauncherHandoff(missingNakama, storage)).toBe(false);

    const wrongGame = handoff();
    wrongGame.proof.gameId = "cards";
    expect(writeLauncherHandoff(wrongGame, storage)).toBe(false);
  });

  it("clears stale or malformed storage", () => {
    const storage = memoryStorage();
    storage.setItem(launcherHandoffKey("chess"), "{not-json");
    expect(readLauncherHandoff("chess", storage)).toBeNull();
    expect(storage.values.has(launcherHandoffKey("chess"))).toBe(false);

    writeLauncherHandoff(handoff(), storage);
    clearLauncherHandoff("chess", storage);
    expect(readLauncherHandoff("chess", storage)).toBeNull();
  });

  it("clears all game identities without touching unrelated storage", () => {
    const storage = memoryStorage();
    writeLauncherHandoff(handoff("chess"), storage);
    writeLauncherHandoff(handoff("cards"), storage);
    storage.setItem("unrelated", "keep");

    clearAllLauncherHandoffs(storage);

    expect(storage.values.has(launcherHandoffKey("chess"))).toBe(false);
    expect(storage.values.has(launcherHandoffKey("cards"))).toBe(false);
    expect(storage.getItem("unrelated")).toBe("keep");
  });
});
