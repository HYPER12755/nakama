import { describe, expect, it } from "vitest";
import {
  GAME_PROTOCOL_VERSION,
  launcherHandoffKey,
  readLauncherHandoff,
  writeLauncherHandoff,
  type GameHostConfig,
} from "@moongames/game-sdk";

function memoryStorage(): {
  length: number;
  key: (index: number) => string | null;
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
} {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
  };
}

function sharedConfig(): GameHostConfig {
  return {
    protocol: GAME_PROTOCOL_VERSION,
    gameId: "carrom",
    locale: "en",
    theme: { mode: "dark" },
    nakama: {
      host: "127.0.0.1",
      port: "7350",
      useSSL: false,
      serverKey: "defaultkey",
    },
    accountMode: "shared",
    official: true,
    session: {
      token: "shared-token",
      refreshToken: "shared-refresh",
      userId: "user-1",
      username: "Player",
      expiresAt: 4102444800000,
    },
  };
}

/**
 * A game opened from the MoonGames menu plays with the account the launcher
 * used. The handover is written to the session storage of the tab, and the
 * game reads it back under its own game id, so a title never picks up the
 * identity of another title.
 */
describe("the launcher handover", () => {
  it("is read back under the game id it was written for", () => {
    const storage = memoryStorage();
    const config = sharedConfig();

    const written = writeLauncherHandoff(
      {
        format: 1,
        gameId: "carrom",
        accountMode: "shared",
        issuedAt: 1,
        config,
        proof: {
          gameId: "carrom",
          version: "1.0.0",
          sha256: "a".repeat(64),
          size: 1,
          keyId: "dev-1",
          publicKey: "key",
          signature: "sig",
        },
      },
      storage,
    );
    expect(written).toBe(true);
    expect(storage.getItem(launcherHandoffKey("carrom"))).not.toBeNull();
    // The handover belongs to one title only.
    expect(storage.getItem(launcherHandoffKey("chess"))).toBeNull();
  });

  it("carries the launcher's own session to the game", () => {
    const storage = memoryStorage();
    const config = sharedConfig();
    writeLauncherHandoff(
      {
        format: 1,
        gameId: "carrom",
        accountMode: "shared",
        issuedAt: 1,
        config,
        proof: {
          gameId: "carrom",
          version: "1.0.0",
          sha256: "a".repeat(64),
          size: 1,
          keyId: "dev-1",
          publicKey: "key",
          signature: "sig",
        },
      },
      storage,
    );

    // The game reads the handover back and plays as the same player.
    const handoff = readLauncherHandoff("carrom", storage);
    expect(handoff).not.toBeNull();
    expect(handoff?.session?.token).toBe("shared-token");
    expect(handoff?.nakama?.host).toBe("127.0.0.1");
    expect(handoff?.accountMode).toBe("shared");

    // A title must not pick up the identity of another title.
    expect(readLauncherHandoff("chess", storage)).toBeNull();
  });
});
