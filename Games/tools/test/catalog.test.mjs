import assert from "node:assert/strict";
import test from "node:test";
import { buildGamesCatalog } from "../lib/catalog.mjs";

const chessManifest = {
  id: "chess",
  name: "Chess",
  version: "0.1.0",
  sdkVersion: "0.1.0",
  entry: "index.html",
  minPlayers: 2,
  maxPlayers: 2,
  capabilities: ["local", "online"],
  orientation: "any",
  description: "Classic chess.",
  tagline: "Classic chess.",
  status: "available",
  tags: ["strategy"],
  accent: "#e5b85c",
  icon: "♞",
  featured: true,
  sortOrder: 10,
  webPath: "chess/",
};

const releaseManifest = {
  format: 1,
  generatedAt: "2026-11-11T00:00:00.000Z",
  signers: {},
  bundles: [
    {
      gameId: "chess",
      version: "0.1.0",
      minHostProtocol: 1,
      publishedAt: "2026-11-11T00:00:00.000Z",
      sha256: "a".repeat(64),
      size: 1024,
      keyId: "dev-1",
    },
  ],
};

test("builds a sorted catalog with release and planned entries", () => {
  const catalog = buildGamesCatalog({
    manifests: [chessManifest],
    plannedGames: [
      {
        id: "cards",
        name: "Card Game",
        tagline: "A social card game.",
        description: "Coming soon.",
        status: "coming-soon",
        minPlayers: 2,
        maxPlayers: 8,
        capabilities: [],
        orientation: "any",
        tags: ["cards"],
        accent: "#ff6b6b",
        icon: "♠",
        sortOrder: 20,
      },
      {
        id: "hidden",
        name: "Hidden",
        tagline: "Hidden.",
        description: "Hidden.",
        status: "hidden",
        minPlayers: 1,
        maxPlayers: 1,
        capabilities: [],
        orientation: "any",
        tags: [],
        accent: "#000000",
        icon: "?",
        sortOrder: 5,
      },
    ],
    releaseManifest,
    generatedAt: "2026-11-11T01:02:03.000Z",
  });

  assert.equal(catalog.format, 1);
  assert.equal(catalog.generatedAt, "2026-11-11T01:02:03.000Z");
  assert.deepEqual(
    catalog.games.map((game) => game.id),
    ["chess", "cards"],
  );
  assert.equal(catalog.games[0].status, "available");
  assert.equal(catalog.games[0].version, "0.1.0");
  assert.deepEqual(catalog.games[0].release, {
    version: "0.1.0",
    minHostProtocol: 1,
    publishedAt: "2026-11-11T00:00:00.000Z",
    sha256: "a".repeat(64),
    size: 1024,
    keyId: "dev-1",
  });
  assert.equal(catalog.games[1].status, "coming-soon");
  assert.equal(catalog.games[1].release, undefined);
});

test("defaults a game without a release to coming-soon and rejects duplicates", () => {
  const catalog = buildGamesCatalog({
    manifests: [
      {
        ...chessManifest,
        status: undefined,
      },
    ],
    generatedAt: "2026-11-11T01:02:03.000Z",
  });
  assert.equal(catalog.games[0].status, "coming-soon");
  assert.equal(catalog.games[0].webPath, "chess/");

  assert.throws(
    () =>
      buildGamesCatalog({
        manifests: [chessManifest],
        plannedGames: [
          {
            id: "chess",
            name: "Chess",
            tagline: "Duplicate.",
            description: "Duplicate.",
            minPlayers: 2,
            maxPlayers: 2,
            capabilities: [],
            orientation: "any",
            tags: [],
            accent: "#000000",
            icon: "?",
          },
        ],
      }),
    /Duplicate game id/,
  );

  assert.throws(
    () =>
      buildGamesCatalog({
        plannedGames: [
          {
            id: "cards",
            name: "Card Game",
            tagline: "A social card game.",
            description: "Coming soon.",
            status: "available",
            minPlayers: 2,
            maxPlayers: 8,
            capabilities: [],
            orientation: "any",
            tags: [],
            accent: "#ff6b6b",
            icon: "♠",
          },
        ],
      }),
    /cannot be marked available/,
  );
});
