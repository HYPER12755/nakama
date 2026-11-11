import { describe, expect, it } from "vitest";
import {
  fetchGamesCatalog,
  findGameCatalogEntry,
  listAvailableGames,
  parseGamesCatalog,
  resolveGameWebUrl,
  type GamesCatalog,
} from "@moongames/game-sdk";

const validCatalog: GamesCatalog = {
  format: 1,
  generatedAt: "2026-11-11T00:00:00.000Z",
  games: [
    {
      id: "chess",
      name: "Chess",
      tagline: "Classic chess.",
      description: "Play chess locally, against the AI, or online.",
      status: "available",
      version: "0.1.0",
      minPlayers: 2,
      maxPlayers: 2,
      capabilities: ["local", "ai", "online"],
      orientation: "any",
      tags: ["strategy", "1v1"],
      accent: "#e5b85c",
      icon: "♞",
      featured: true,
      sortOrder: 10,
      webPath: "chess/",
      release: {
        version: "0.1.0",
        minHostProtocol: 1,
        publishedAt: "2026-11-11T00:00:00.000Z",
        sha256: "a".repeat(64),
        size: 1024,
        keyId: "dev-1",
      },
    },
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
      featured: false,
      sortOrder: 20,
    },
  ],
};

describe("games catalog", () => {
  it("parses catalog data and resolves game links", () => {
    const catalog = parseGamesCatalog(validCatalog);
    expect(listAvailableGames(catalog).map((game) => game.id)).toEqual([
      "chess",
    ]);
    expect(findGameCatalogEntry(catalog, "cards")?.status).toBe("coming-soon");
    expect(findGameCatalogEntry(catalog, "checkers")).toBeNull();
    expect(
      resolveGameWebUrl(
        catalog.games[0],
        "https://cdn.example.com/moongames/games.json",
      ),
    ).toBe("https://cdn.example.com/moongames/chess/");
  });

  it("rejects malformed or unsafe catalog entries", () => {
    expect(() =>
      parseGamesCatalog({
        ...validCatalog,
        games: [validCatalog.games[0], validCatalog.games[0]],
      }),
    ).toThrow("Duplicate");

    expect(() =>
      parseGamesCatalog({
        ...validCatalog,
        games: [
          {
            ...validCatalog.games[0],
            status: "released",
          },
        ],
      }),
    ).toThrow("status");

    expect(() =>
      parseGamesCatalog({
        ...validCatalog,
        games: [
          {
            ...validCatalog.games[0],
            webPath: "javascript:alert(1)",
          },
        ],
      }),
    ).toThrow("safe relative path");
  });

  it("fetches and validates a catalog over HTTP", async () => {
    let requestedUrl = "";
    let acceptHeader = "";
    const fetchImpl = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      requestedUrl = String(input);
      acceptHeader = new Headers(init?.headers).get("accept") ?? "";
      return new Response(JSON.stringify(validCatalog), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const catalog = await fetchGamesCatalog(
      "https://cdn.example.com/games.json",
      { fetchImpl },
    );
    expect(requestedUrl).toBe("https://cdn.example.com/games.json");
    expect(acceptHeader).toBe("application/json");
    expect(catalog.games).toHaveLength(2);

    const failingFetch = (async () =>
      new Response("not found", { status: 404 })) as typeof fetch;
    await expect(
      fetchGamesCatalog("https://cdn.example.com/games.json", {
        fetchImpl: failingFetch,
      }),
    ).rejects.toThrow("HTTP 404");
  });
});
