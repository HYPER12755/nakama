import { describe, expect, it } from "vitest";
import {
  GAME_PROTOCOL_VERSION,
  type GameBundleDescriptor,
  type GameCatalogEntry,
  type GameSession,
  type GamesCatalog,
  type NakamaConnection,
  type ReleaseManifest,
} from "@moongames/game-sdk";
import {
  buildLauncherHostConfig,
  fetchVerifiedCatalog,
  verifyCatalogRelease,
} from "../src";

const PUBLIC_KEY = "yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=";

function descriptor(
  overrides: Partial<GameBundleDescriptor> = {},
): GameBundleDescriptor {
  return {
    format: 1,
    gameId: "chess",
    gameName: "Chess",
    version: "0.6.0",
    sdkVersion: "0.1.0",
    minHostProtocol: GAME_PROTOCOL_VERSION,
    entry: "index.html",
    capabilities: ["local"],
    publishedAt: "2026-11-12T00:00:00.000Z",
    sha256: "b".repeat(64),
    size: 4321,
    url: "chess/0.6.0/chess-0.6.0.zip",
    keyId: "dev-1",
    publicKey: PUBLIC_KEY,
    signature: "signature",
    ...overrides,
  };
}

function manifest(bundle = descriptor()): ReleaseManifest {
  return {
    format: 1,
    generatedAt: "2026-11-12T00:00:00.000Z",
    signers: {
      "dev-1": { algorithm: "ed25519", publicKey: PUBLIC_KEY },
    },
    bundles: [bundle],
  };
}

function entry(bundle = descriptor()): GameCatalogEntry {
  return {
    id: bundle.gameId,
    name: bundle.gameName,
    tagline: "Classic chess.",
    description: "Play chess.",
    status: "available",
    minPlayers: 2,
    maxPlayers: 2,
    capabilities: ["local"],
    orientation: "any",
    tags: ["strategy"],
    accent: "#e5b85c",
    icon: "chess",
    featured: true,
    sortOrder: 10,
    webPath: "chess/",
    version: bundle.version,
    release: {
      version: bundle.version,
      minHostProtocol: bundle.minHostProtocol,
      publishedAt: bundle.publishedAt,
      sha256: bundle.sha256,
      size: bundle.size,
      keyId: bundle.keyId,
    },
  };
}

const trusted = { "dev-1": PUBLIC_KEY };
const verifier = async () => ({ ok: true });
const session: GameSession = {
  token: "token",
  userId: "user-1",
  username: "player",
  expiresAt: 42,
};
const nakama: NakamaConnection = {
  host: "nakama.example.com",
  port: "443",
  serverKey: "defaultkey",
  useSSL: true,
};
const theme = { mode: "dark" } as const;

describe("native launcher core", () => {
  it("verifies a catalog release and builds a shared official config", async () => {
    const record = await verifyCatalogRelease(
      entry(),
      manifest(),
      trusted,
      verifier,
    );
    expect(record.version).toBe("0.6.0");

    const config = buildLauncherHostConfig({
      entry: entry(),
      release: record,
      session,
      nakama,
      theme,
      locale: "en-US",
    });
    expect(config).toMatchObject({
      protocol: GAME_PROTOCOL_VERSION,
      gameId: "chess",
      locale: "en-US",
      accountMode: "shared",
      official: true,
      session,
      nakama,
      release: {
        version: "0.6.0",
        sha256: "b".repeat(64),
        keyId: "dev-1",
      },
    });
  });

  it("never forwards a launcher identity to an unverified game", () => {
    const config = buildLauncherHostConfig({
      entry: entry(),
      session,
      nakama,
      theme,
      locale: "en-US",
    });
    expect(config.accountMode).toBe("per-game");
    expect(config.official).toBeUndefined();
    expect(config.session).toBeUndefined();
    expect(config.nakama).toBeUndefined();
    expect(config.release).toBeUndefined();
  });

  it("requires a session for a verified release and rejects cross-game records", async () => {
    const record = await verifyCatalogRelease(
      entry(),
      manifest(),
      trusted,
      verifier,
    );
    expect(() =>
      buildLauncherHostConfig({
        entry: entry(),
        release: record,
        theme,
        locale: "en-US",
      }),
    ).toThrow(/launcher session/);

    const other = entry(descriptor({ gameId: "cards", gameName: "Cards" }));
    expect(() =>
      buildLauncherHostConfig({
        entry: other,
        release: record,
        session,
        nakama,
        theme,
        locale: "en-US",
      }),
    ).toThrow(/different game/);
  });

  it("rejects catalog release drift and newer host requirements", async () => {
    const changed = entry();
    changed.release = { ...changed.release!, sha256: "c".repeat(64) };
    await expect(
      verifyCatalogRelease(changed, manifest(), trusted, verifier),
    ).rejects.toThrow(/does not match/);

    const renamed = entry();
    renamed.version = "9.9.9";
    await expect(
      verifyCatalogRelease(renamed, manifest(), trusted, verifier),
    ).rejects.toThrow(/catalog version/);

    const incompatible = descriptor({
      minHostProtocol: GAME_PROTOCOL_VERSION + 1,
    });
    await expect(
      verifyCatalogRelease(
        entry(incompatible),
        manifest(incompatible),
        trusted,
        verifier,
      ),
    ).rejects.toThrow(/newer MoonGames host/);
  });

  it("loads the signed manifest and isolates per-game failures", async () => {
    const chess = entry();
    const cards = entry(descriptor({ gameId: "cards", gameName: "Cards" }));
    cards.webPath = "cards/";
    const catalog: GamesCatalog = {
      format: 1,
      generatedAt: "2026-11-12T00:00:00.000Z",
      games: [chess, cards],
    };
    const signed = manifest();
    signed.bundles.push(
      descriptor({
        gameId: "cards",
        gameName: "Cards",
        url: "cards/0.6.0/cards-0.6.0.zip",
      }),
    );

    const result = await fetchVerifiedCatalog(
      catalog,
      "https://games.example.com/release-manifest.json",
      {
        trustedKeys: trusted,
        fetchImpl: (async () =>
          new Response(JSON.stringify(signed), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as typeof fetch,
        verifier: async (item) =>
          item.gameId === "cards"
            ? { ok: false, error: "Nope." }
            : { ok: true },
      },
    );
    expect(result.error).toBeNull();
    expect(result.games.has("chess")).toBe(true);
    expect(result.errors.get("cards")).toBe("Nope.");
  });
});
