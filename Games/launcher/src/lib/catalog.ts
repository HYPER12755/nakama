import {
  resolveGameWebUrl,
  type GameCatalogEntry,
} from "@moongames/game-sdk";

export type CatalogFilter = "all" | "available" | "coming-soon" | "online";

export const capabilityLabels: Record<string, string> = {
  local: "Local play",
  online: "Online",
  "private-match": "Private rooms",
  ai: "AI opponent",
  spectators: "Spectators",
  "invite-links": "Invite links",
  replay: "Replay",
};

export function filterCatalog(
  games: GameCatalogEntry[],
  filter: CatalogFilter,
  query: string,
): GameCatalogEntry[] {
  const needle = query.trim().toLowerCase();
  return games.filter((game) => {
    if (filter === "available" && game.status !== "available") {
      return false;
    }
    if (filter === "coming-soon" && game.status !== "coming-soon") {
      return false;
    }
    if (filter === "online" && !game.capabilities.includes("online")) {
      return false;
    }
    if (needle.length === 0) {
      return true;
    }
    const haystack = [
      game.name,
      game.tagline,
      game.description,
      ...game.tags,
      ...game.capabilities.map((capability) => capabilityLabels[capability] ?? capability),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}

export function formatPlayers(game: GameCatalogEntry): string {
  if (game.minPlayers === game.maxPlayers) {
    return `${game.minPlayers} player${game.minPlayers === 1 ? "" : "s"}`;
  }
  return `${game.minPlayers}–${game.maxPlayers} players`;
}

export function statusLabel(game: GameCatalogEntry): string {
  switch (game.status) {
    case "available":
      return "Ready to play";
    case "coming-soon":
      return "Coming soon";
    case "hidden":
      return "Hidden";
  }
}

export function gameWebUrl(
  game: GameCatalogEntry,
  catalogUrl: string,
): string | null {
  if (game.status !== "available") {
    return null;
  }
  return resolveGameWebUrl(game, catalogUrl);
}

export function gameCoverUrl(
  game: GameCatalogEntry,
  catalogUrl: string,
): string | null {
  if (game.cover === undefined) {
    return null;
  }
  try {
    const url = new URL(game.cover, catalogUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export function featuredGame(
  games: GameCatalogEntry[],
): GameCatalogEntry | null {
  return (
    games.find(
      (game) => game.featured && game.status === "available",
    ) ??
    games.find((game) => game.status === "available") ??
    null
  );
}

export function defaultCatalogUrl(baseUri: string): string {
  return new URL("games.json", baseUri).toString();
}
