import { describe, expect, it } from "vitest";
import type { GameCatalogEntry } from "@moongames/game-sdk";
import {
  defaultCatalogUrl,
  featuredGame,
  filterCatalog,
  formatPlayers,
  gameCoverUrl,
  gameWebUrl,
  statusLabel,
} from "../src/lib/catalog";

function game(
  overrides: Partial<GameCatalogEntry> & Pick<GameCatalogEntry, "id">,
): GameCatalogEntry {
  return {
    name: "Chess",
    tagline: "Classic chess.",
    description: "Play chess.",
    status: "available",
    minPlayers: 2,
    maxPlayers: 2,
    capabilities: ["local", "ai", "online"],
    orientation: "any",
    tags: ["strategy", "rated"],
    accent: "#e5b85c",
    icon: "♞",
    featured: true,
    sortOrder: 10,
    webPath: "chess/",
    ...overrides,
    id: overrides.id,
  };
}

describe("launcher catalog helpers", () => {
  it("filters by status, online capability, and search text", () => {
    const games = [
      game({ id: "chess" }),
      game({
        id: "cards",
        name: "Card Game",
        status: "coming-soon",
        capabilities: [],
        tags: ["cards", "social"],
        featured: false,
        webPath: undefined,
      }),
    ];

    expect(filterCatalog(games, "all", "").map((item) => item.id)).toEqual([
      "chess",
      "cards",
    ]);
    expect(
      filterCatalog(games, "available", "").map((item) => item.id),
    ).toEqual(["chess"]);
    expect(
      filterCatalog(games, "coming-soon", "").map((item) => item.id),
    ).toEqual(["cards"]);
    expect(filterCatalog(games, "online", "").map((item) => item.id)).toEqual([
      "chess",
    ]);
    expect(filterCatalog(games, "all", "card").map((item) => item.id)).toEqual([
      "cards",
    ]);
    expect(filterCatalog(games, "all", "rated").map((item) => item.id)).toEqual([
      "chess",
    ]);
  });

  it("selects a featured available game and falls back to the first available", () => {
    const games = [
      game({ id: "cards", status: "coming-soon", featured: false }),
      game({ id: "chess", featured: false }),
      game({ id: "ludo", featured: true }),
    ];
    expect(featuredGame(games)?.id).toBe("ludo");
    expect(featuredGame([games[0]])).toBeNull();
  });

  it("resolves game and cover URLs and formats labels", () => {
    const catalogUrl = "https://cdn.example.com/moongames/games.json";
    const entry = game({ id: "chess", cover: "art/chess.webp" });
    expect(gameWebUrl(entry, catalogUrl)).toBe(
      "https://cdn.example.com/moongames/chess/",
    );
    expect(gameCoverUrl(entry, catalogUrl)).toBe(
      "https://cdn.example.com/moongames/art/chess.webp",
    );
    expect(
      gameWebUrl(game({ id: "cards", status: "coming-soon" }), catalogUrl),
    ).toBeNull();
    expect(formatPlayers(entry)).toBe("2 players");
    expect(
      formatPlayers(game({ id: "cards", minPlayers: 2, maxPlayers: 8 })),
    ).toBe("2–8 players");
    expect(statusLabel(entry)).toBe("Ready to play");
    expect(statusLabel(game({ id: "cards", status: "coming-soon" }))).toBe(
      "Coming soon",
    );
  });

  it("builds a default catalog URL beside the page", () => {
    expect(defaultCatalogUrl("https://games.example.com/moongames/")).toBe(
      "https://games.example.com/moongames/games.json",
    );
  });
});
