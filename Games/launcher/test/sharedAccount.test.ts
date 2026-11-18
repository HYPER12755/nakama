import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  GAME_PROTOCOL_VERSION,
  LAUNCHER_HANDOFF_FORMAT,
  readLauncherHandoff,
  writeLauncherHandoff,
  type GameHostConfig,
  type HandoffStorage,
  type LauncherHandoff,
} from "@moongames/game-sdk";

const here = path.dirname(fileURLToPath(import.meta.url));
const gamesRoot = path.resolve(here, "..", "..");

function memoryStorage(): HandoffStorage {
  const values = new Map<string, string>();
  return {
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

/**
 * The menu hands its account to a game, and the game reads it. This builds
 * the handoff exactly as the menu does, with the real signed manifest and
 * the real catalog of this machine, and reads it back the way the game does.
 */
describe("the account the menu hands to a game", () => {
  it("is read back by the game", () => {
    const manifest = JSON.parse(
      readFileSync(
        path.join(gamesRoot, "releases", "release-manifest.json"),
        "utf8",
      ),
    ) as {
      bundles: Array<{
        gameId: string;
        version: string;
        sha256: string;
        size: number;
        keyId: string;
        publicKey: string;
        signature: string;
      }>;
    };
    const catalog = JSON.parse(
      readFileSync(
        path.join(gamesRoot, "launcher", "public", "games.json"),
        "utf8",
      ),
    ) as {
      games: Array<{
        id: string;
        version?: string;
        status: string;
        release?: { version: string; sha256: string; size: number; keyId: string };
      }>;
    };

    const game = catalog.games.find(
      (entry) => entry.id === "chess" && entry.status === "available",
    );
    expect(game, "chess is not in the catalog").toBeDefined();

    const descriptor = manifest.bundles.find(
      (bundle) =>
        bundle.gameId === game!.id && bundle.version === game!.release?.version,
    );
    expect(descriptor, "chess is not in the signed manifest").toBeDefined();

    // The config the menu builds.
    const config: GameHostConfig = {
      protocol: GAME_PROTOCOL_VERSION,
      gameId: game!.id,
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
        version: descriptor!.version,
        sha256: descriptor!.sha256,
        keyId: descriptor!.keyId,
      },
    };

    const handoff: LauncherHandoff = {
      format: LAUNCHER_HANDOFF_FORMAT,
      gameId: game!.id,
      accountMode: "shared",
      issuedAt: Date.now(),
      config,
      proof: {
        gameId: descriptor!.gameId,
        version: descriptor!.version,
        sha256: descriptor!.sha256,
        size: descriptor!.size,
        keyId: descriptor!.keyId,
        publicKey: descriptor!.publicKey,
        signature: descriptor!.signature,
      },
    };

    const storage = memoryStorage();
    expect(
      writeLauncherHandoff(handoff, storage),
      "the menu could not hand its account over",
    ).toBe(true);

    const read = readLauncherHandoff("chess", storage);
    expect(read, "the game did not read the account of the menu").not.toBeNull();
    expect(read?.accountMode).toBe("shared");
    expect(read?.official).toBe(true);
    expect(read!.session!.token).toBe("launcher-token");
    expect(read!.nakama!.serverKey).toBe("defaultkey");
  });
});
