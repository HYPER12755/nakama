import type {
  GameAvailability,
  GameCapability,
  GameOrientation,
} from "./manifest";

export const GAMES_CATALOG_FORMAT = 1;

export interface GameCatalogRelease {
  version: string;
  minHostProtocol: number;
  publishedAt: string;
  sha256: string;
  size: number;
  keyId: string;
}

/**
 * Display metadata for one game. The catalog is advisory presentation data;
 * executable bundles are still selected and verified through the signed release
 * manifest.
 */
export interface GameCatalogEntry {
  id: string;
  name: string;
  tagline: string;
  description: string;
  status: GameAvailability;
  version?: string;
  minPlayers: number;
  maxPlayers: number;
  capabilities: GameCapability[];
  orientation: GameOrientation;
  tags: string[];
  /** Accent color in #rrggbb form. */
  accent: string;
  /** Short Unicode glyph or text mark for local/fallback artwork. */
  icon: string;
  featured: boolean;
  sortOrder: number;
  /** Relative to the catalog URL, or an absolute http(s) URL. */
  webPath?: string;
  /** Optional cover art path/URL. */
  cover?: string;
  /** Optional screenshot paths/URLs. */
  screenshots?: string[];
  release?: GameCatalogRelease;
}

export interface GamesCatalog {
  format: typeof GAMES_CATALOG_FORMAT;
  generatedAt: string;
  games: GameCatalogEntry[];
}

export interface FetchGamesCatalogOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const GAME_ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const AVAILABILITY = new Set<GameAvailability>([
  "available",
  "coming-soon",
  "hidden",
]);
const CAPABILITIES = new Set<GameCapability>([
  "local",
  "online",
  "private-match",
  "ai",
  "spectators",
  "invite-links",
  "replay",
]);
const ORIENTATIONS = new Set<GameOrientation>([
  "portrait",
  "landscape",
  "any",
]);

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function requireSingleLine(value: unknown, field: string): string {
  const text = requireText(value, field);
  if (text.includes("\n") || text.includes("\r")) {
    throw new Error(`${field} must be a single-line string.`);
  }
  return text;
}

function requireInteger(value: unknown, field: string, minimum: number): number {
  if (!Number.isInteger(value) || (value as number) < minimum) {
    throw new Error(`${field} must be an integer >= ${minimum}.`);
  }
  return value as number;
}

function assertSafeUrlOrPath(value: unknown, field: string): string {
  const path = requireSingleLine(value, field);
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const parsed = new URL(path);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("unsupported protocol");
      }
    } catch {
      throw new Error(`${field} must be a valid http(s) URL.`);
    }
    return path;
  }
  if (
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes(":") ||
    path.split("/").some((part) => part === "..")
  ) {
    throw new Error(`${field} must be a safe relative path or http(s) URL.`);
  }
  return path;
}

function assertRelease(value: unknown): asserts value is GameCatalogRelease {
  if (typeof value !== "object" || value === null) {
    throw new Error("release must be an object.");
  }
  const release = value as Partial<GameCatalogRelease>;
  if (typeof release.version !== "string" || !SEMVER.test(release.version)) {
    throw new Error("release.version must be a semver string.");
  }
  requireInteger(release.minHostProtocol, "release.minHostProtocol", 1);
  requireSingleLine(release.publishedAt, "release.publishedAt");
  if (
    typeof release.sha256 !== "string" ||
    !HEX_SHA256.test(release.sha256)
  ) {
    throw new Error("release.sha256 must be 64 lowercase hex characters.");
  }
  requireInteger(release.size, "release.size", 0);
  requireSingleLine(release.keyId, "release.keyId");
}

export function assertGameCatalogEntry(
  value: unknown,
): asserts value is GameCatalogEntry {
  if (typeof value !== "object" || value === null) {
    throw new Error("Each catalog game must be an object.");
  }
  const entry = value as Partial<GameCatalogEntry>;
  if (typeof entry.id !== "string" || !GAME_ID.test(entry.id)) {
    throw new Error("game id must use lowercase letters, digits, and dashes.");
  }
  requireSingleLine(entry.name, `games.${entry.id}.name`);
  requireSingleLine(entry.tagline, `games.${entry.id}.tagline`);
  requireText(entry.description, `games.${entry.id}.description`);
  if (entry.status === undefined || !AVAILABILITY.has(entry.status)) {
    throw new Error(`games.${entry.id}.status is invalid.`);
  }
  if (entry.version !== undefined) {
    if (typeof entry.version !== "string" || !SEMVER.test(entry.version)) {
      throw new Error(`games.${entry.id}.version must be a semver string.`);
    }
  }
  requireInteger(entry.minPlayers, `games.${entry.id}.minPlayers`, 1);
  requireInteger(entry.maxPlayers, `games.${entry.id}.maxPlayers`, 1);
  if ((entry.maxPlayers as number) < (entry.minPlayers as number)) {
    throw new Error(`games.${entry.id}.maxPlayers must be >= minPlayers.`);
  }
  if (!Array.isArray(entry.capabilities)) {
    throw new Error(`games.${entry.id}.capabilities must be an array.`);
  }
  for (const capability of entry.capabilities) {
    if (!CAPABILITIES.has(capability)) {
      throw new Error(`games.${entry.id}.capabilities contains an unknown value.`);
    }
  }
  if (entry.orientation === undefined || !ORIENTATIONS.has(entry.orientation)) {
    throw new Error(`games.${entry.id}.orientation is invalid.`);
  }
  if (!Array.isArray(entry.tags)) {
    throw new Error(`games.${entry.id}.tags must be an array.`);
  }
  entry.tags.forEach((tag, index) => {
    requireSingleLine(tag, `games.${entry.id}.tags[${index}]`);
  });
  if (typeof entry.accent !== "string" || !HEX_COLOR.test(entry.accent)) {
    throw new Error(`games.${entry.id}.accent must be a #rrggbb color.`);
  }
  requireSingleLine(entry.icon, `games.${entry.id}.icon`);
  if (typeof entry.featured !== "boolean") {
    throw new Error(`games.${entry.id}.featured must be a boolean.`);
  }
  if (typeof entry.sortOrder !== "number" || !Number.isFinite(entry.sortOrder)) {
    throw new Error(`games.${entry.id}.sortOrder must be a finite number.`);
  }
  if (entry.webPath !== undefined) {
    assertSafeUrlOrPath(entry.webPath, `games.${entry.id}.webPath`);
  }
  if (entry.cover !== undefined) {
    assertSafeUrlOrPath(entry.cover, `games.${entry.id}.cover`);
  }
  if (entry.screenshots !== undefined) {
    if (!Array.isArray(entry.screenshots)) {
      throw new Error(`games.${entry.id}.screenshots must be an array.`);
    }
    entry.screenshots.forEach((screenshot, index) => {
      assertSafeUrlOrPath(
        screenshot,
        `games.${entry.id}.screenshots[${index}]`,
      );
    });
  }
  if (entry.release !== undefined) {
    assertRelease(entry.release);
  }
}

export function assertGamesCatalog(
  value: unknown,
): asserts value is GamesCatalog {
  if (typeof value !== "object" || value === null) {
    throw new Error("The games catalog must be an object.");
  }
  const catalog = value as Partial<GamesCatalog>;
  if (catalog.format !== GAMES_CATALOG_FORMAT) {
    throw new Error("Unsupported games catalog format.");
  }
  requireSingleLine(catalog.generatedAt, "generatedAt");
  if (!Array.isArray(catalog.games)) {
    throw new Error("games must be an array.");
  }
  const ids = new Set<string>();
  for (const entry of catalog.games) {
    assertGameCatalogEntry(entry);
    if (ids.has(entry.id)) {
      throw new Error(`Duplicate catalog game id: ${entry.id}.`);
    }
    ids.add(entry.id);
  }
}

export function parseGamesCatalog(value: unknown): GamesCatalog {
  assertGamesCatalog(value);
  return value;
}

export function findGameCatalogEntry(
  catalog: GamesCatalog,
  gameId: string,
): GameCatalogEntry | null {
  return catalog.games.find((entry) => entry.id === gameId) ?? null;
}

export function listAvailableGames(catalog: GamesCatalog): GameCatalogEntry[] {
  return catalog.games.filter((entry) => entry.status === "available");
}

export function resolveGameWebUrl(
  entry: GameCatalogEntry,
  catalogUrl: string,
): string | null {
  if (entry.webPath === undefined) {
    return null;
  }
  try {
    const url = new URL(entry.webPath, catalogUrl);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export async function fetchGamesCatalog(
  url: string,
  options: FetchGamesCatalogOptions = {},
): Promise<GamesCatalog> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (fetchImpl === undefined) {
    throw new Error("No fetch implementation is available.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 15_000,
  );
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Games catalog request failed with HTTP ${response.status}.`,
      );
    }
    return parseGamesCatalog(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}
