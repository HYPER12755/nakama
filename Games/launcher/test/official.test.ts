import { describe, expect, it } from "vitest";
import {
  GAME_PROTOCOL_VERSION,
  type GameBundleDescriptor,
  type GameCatalogEntry,
  type GamesCatalog,
  type ReleaseManifest,
} from "@moongames/game-sdk";
import {
  configuredTrustedKeys,
  defaultReleaseManifestUrl,
  fetchOfficialRegistry,
  parseTrustedKeys,
  verifyOfficialGame,
} from "../src/lib/official";

const PUBLIC_KEY = "yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=";
const OTHER_KEY = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

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
    id: "chess",
    name: "Chess",
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

describe("official release proofs", () => {
  it("accepts a catalog entry that matches the signed descriptor", async () => {
    const record = await verifyOfficialGame(
      entry(),
      manifest(),
      trusted,
      async () => ({ ok: true }),
    );
    expect(record.gameId).toBe("chess");
    expect(record.version).toBe("0.6.0");
    expect(record.descriptor.sha256).toBe("b".repeat(64));
  });

  it("rejects catalog drift, unpinned keys, and incompatible hosts", async () => {
    const changed = entry();
    changed.release = { ...changed.release!, size: 9999 };
    await expect(
      verifyOfficialGame(changed, manifest(), trusted, async () => ({ ok: true })),
    ).rejects.toThrow(/does not match/);

    const renamed = entry();
    renamed.version = "9.9.9";
    await expect(
      verifyOfficialGame(renamed, manifest(), trusted, async () => ({ ok: true })),
    ).rejects.toThrow(/catalog version/);

    await expect(
      verifyOfficialGame(entry(), manifest(), { other: OTHER_KEY }, async () => ({
        ok: true,
      })),
    ).rejects.toThrow(/No trusted public key/);

    const incompatible = descriptor({
      minHostProtocol: GAME_PROTOCOL_VERSION + 1,
    });
    await expect(
      verifyOfficialGame(
        entry(incompatible),
        manifest(incompatible),
        trusted,
        async () => ({ ok: true }),
      ),
    ).rejects.toThrow(/newer MoonGames host/);
  });

  it("surfaces verifier failures instead of trusting the report", async () => {
    await expect(
      verifyOfficialGame(entry(), manifest(), trusted, async () => ({
        ok: false,
        error: "The bundle signature is invalid.",
      })),
    ).rejects.toThrow("The bundle signature is invalid.");
  });

  it("parses pinned keys and defaults to the dev key only in development", () => {
    expect(parseTrustedKeys("one=abc,two=def")).toEqual({
      one: "abc",
      two: "def",
    });
    expect(parseTrustedKeys("broken,=value,name=")).toEqual({});
    expect(configuredTrustedKeys()["dev-1"]).toBe(PUBLIC_KEY);
    expect(
      defaultReleaseManifestUrl("https://games.example.com/moongames/"),
    ).toBe("https://games.example.com/moongames/release-manifest.json");
  });

  it("fetches the manifest and reports per-game verification errors", async () => {
    const catalog: GamesCatalog = {
      format: 1,
      generatedAt: "2026-11-12T00:00:00.000Z",
      games: [
        entry(),
        {
          ...entry(descriptor({ gameId: "cards", gameName: "Cards" })),
          id: "cards",
          name: "Cards",
          icon: "cards",
        },
      ],
    };
    const bothGames = manifest();
    bothGames.bundles.push(
      descriptor({ gameId: "cards", gameName: "Cards", url: "cards/0.6.0/cards-0.6.0.zip" }),
    );
    const result = await fetchOfficialRegistry(
      catalog,
      "https://games.example.com/release-manifest.json",
      {
        trustedKeys: trusted,
        verifier: async (item) =>
          item.gameId === "cards"
            ? { ok: false, error: "Nope." }
            : { ok: true },
        fetchImpl: (async () =>
          new Response(JSON.stringify(bothGames), {
            status: 200,
            headers: { "content-type": "application/json" },
          })) as typeof fetch,
      },
    );
    expect(result.error).toBeNull();
    expect(result.games.has("chess")).toBe(true);
    expect(result.errors.get("cards")).toBe("Nope.");
  });
});
