import { compareSemver } from "./bundle.mjs";

const GAME_ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const STATUS_ORDER = new Map([
  ["available", 0],
  ["coming-soon", 1],
  ["hidden", 2],
]);
const CAPABILITIES = new Set([
  "local",
  "online",
  "private-match",
  "ai",
  "spectators",
  "invite-links",
  "replay",
]);
const ORIENTATIONS = new Set(["portrait", "landscape", "any"]);

function fail(message) {
  throw new Error(message);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${field} must be a non-empty string.`);
  }
  return value;
}

function optionalText(value, field) {
  if (value === undefined) {
    return undefined;
  }
  return requireText(value, field);
}

function requireInteger(value, field, minimum) {
  if (!Number.isInteger(value) || value < minimum) {
    fail(`${field} must be an integer >= ${minimum}.`);
  }
  return value;
}

function firstLine(value) {
  return value.split(/\r?\n/, 1)[0].trim();
}

function latestReleases(releaseManifest) {
  const latest = new Map();
  if (releaseManifest === undefined) {
    return latest;
  }
  if (
    typeof releaseManifest !== "object" ||
    releaseManifest === null ||
    !Array.isArray(releaseManifest.bundles)
  ) {
    fail("The release manifest must contain a bundles array.");
  }
  for (const bundle of releaseManifest.bundles) {
    if (
      typeof bundle !== "object" ||
      bundle === null ||
      typeof bundle.gameId !== "string" ||
      typeof bundle.version !== "string"
    ) {
      fail("Each release bundle must have gameId and version strings.");
    }
    const current = latest.get(bundle.gameId);
    if (current === undefined || compareSemver(bundle.version, current.version) > 0) {
      latest.set(bundle.gameId, bundle);
    }
  }
  return latest;
}

function releaseSummary(bundle) {
  if (bundle === undefined) {
    return undefined;
  }
  requireText(bundle.version, "release.version");
  if (!SEMVER.test(bundle.version)) {
    fail("release.version must be a semver string.");
  }
  requireInteger(bundle.minHostProtocol, "release.minHostProtocol", 1);
  requireText(bundle.publishedAt, "release.publishedAt");
  if (typeof bundle.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(bundle.sha256)) {
    fail("release.sha256 must be 64 lowercase hex characters.");
  }
  requireInteger(bundle.size, "release.size", 0);
  requireText(bundle.keyId, "release.keyId");
  return {
    version: bundle.version,
    minHostProtocol: bundle.minHostProtocol,
    publishedAt: bundle.publishedAt,
    sha256: bundle.sha256,
    size: bundle.size,
    keyId: bundle.keyId,
  };
}

function normalizeCapabilities(capabilities, field) {
  if (!Array.isArray(capabilities)) {
    fail(`${field} must be an array.`);
  }
  return capabilities.map((capability, index) => {
    const name = requireText(capability, `${field}[${index}]`);
    if (!CAPABILITIES.has(name)) {
      fail(`${field} contains an unknown capability: ${name}.`);
    }
    return name;
  });
}

function normalizeOrientation(value, field) {
  const orientation = value ?? "any";
  if (!ORIENTATIONS.has(orientation)) {
    fail(`${field} is invalid.`);
  }
  return orientation;
}

function normalizeTags(tags, field) {
  if (tags === undefined) {
    return [];
  }
  if (!Array.isArray(tags)) {
    fail(`${field} must be an array.`);
  }
  return tags.map((tag, index) => requireText(tag, `${field}[${index}]`));
}

function normalizeScreenshots(screenshots, field) {
  if (screenshots === undefined) {
    return undefined;
  }
  if (!Array.isArray(screenshots)) {
    fail(`${field} must be an array.`);
  }
  return screenshots.map((value, index) =>
    requireText(value, `${field}[${index}]`),
  );
}

function normalizeManifest(manifest, release, index) {
  if (typeof manifest !== "object" || manifest === null) {
    fail(`Game manifest ${index} must be an object.`);
  }
  const id = requireText(manifest.id, "manifest.id");
  if (!GAME_ID.test(id)) {
    fail("manifest.id must use lowercase letters, digits, and dashes.");
  }
  const name = requireText(manifest.name, `games.${id}.name`);
  const description = optionalText(manifest.description, `games.${id}.description`);
  const taglineSource =
    optionalText(manifest.tagline, `games.${id}.tagline`) ??
    (description === undefined ? undefined : firstLine(description));
  const tagline = taglineSource ?? `${name} is part of the MoonGames library.`;
  const latest = release;
  const status = manifest.status ?? (latest === undefined ? "coming-soon" : "available");
  if (!STATUS_ORDER.has(status)) {
    fail(`games.${id}.status is invalid.`);
  }
  const version = latest?.version ?? manifest.version;
  if (version !== undefined && (typeof version !== "string" || !SEMVER.test(version))) {
    fail(`games.${id}.version must be a semver string.`);
  }
  const accent = manifest.accent ?? "#8b9cff";
  if (typeof accent !== "string" || !HEX_COLOR.test(accent)) {
    fail(`games.${id}.accent must be a #rrggbb color.`);
  }
  const minPlayers = requireInteger(manifest.minPlayers, `games.${id}.minPlayers`, 1);
  const maxPlayers = requireInteger(manifest.maxPlayers, `games.${id}.maxPlayers`, 1);
  if (maxPlayers < minPlayers) {
    fail(`games.${id}.maxPlayers must be >= minPlayers.`);
  }
  const capabilities = normalizeCapabilities(
    manifest.capabilities,
    `games.${id}.capabilities`,
  );
  const orientation = normalizeOrientation(
    manifest.orientation,
    `games.${id}.orientation`,
  );
  const entry = {
    id,
    name,
    tagline,
    description: description ?? tagline,
    status,
    minPlayers,
    maxPlayers,
    capabilities,
    orientation,
    tags: normalizeTags(manifest.tags, `games.${id}.tags`),
    accent,
    icon:
      optionalText(manifest.icon, `games.${id}.icon`) ??
      (name.slice(0, 1).toUpperCase() || "◇"),
    featured: manifest.featured === true,
    sortOrder:
      typeof manifest.sortOrder === "number" && Number.isFinite(manifest.sortOrder)
        ? manifest.sortOrder
        : 100,
    webPath:
      optionalText(manifest.webPath, `games.${id}.webPath`) ??
      `${id}/`,
  };
  if (version !== undefined) {
    entry.version = version;
  }
  const cover = optionalText(manifest.cover, `games.${id}.cover`);
  if (cover !== undefined) {
    entry.cover = cover;
  }
  const screenshots = normalizeScreenshots(
    manifest.screenshots,
    `games.${id}.screenshots`,
  );
  if (screenshots !== undefined) {
    entry.screenshots = screenshots;
  }
  const summary = releaseSummary(latest);
  if (summary !== undefined) {
    entry.release = summary;
  }
  return entry;
}

function normalizePlanned(entry, index) {
  if (typeof entry !== "object" || entry === null) {
    fail(`Planned game ${index} must be an object.`);
  }
  const id = requireText(entry.id, "planned.id");
  if (!GAME_ID.test(id)) {
    fail("planned.id must use lowercase letters, digits, and dashes.");
  }
  if (entry.status === "available") {
    fail(`Planned game ${id} cannot be marked available without a release.`);
  }
  const status = entry.status ?? "coming-soon";
  if (status !== "coming-soon" && status !== "hidden") {
    fail(`games.${id}.status is invalid for a planned game.`);
  }
  const name = requireText(entry.name, `games.${id}.name`);
  const tagline = requireText(entry.tagline, `games.${id}.tagline`);
  const accent = entry.accent ?? "#8b9cff";
  if (typeof accent !== "string" || !HEX_COLOR.test(accent)) {
    fail(`games.${id}.accent must be a #rrggbb color.`);
  }
  const minPlayers = requireInteger(entry.minPlayers, `games.${id}.minPlayers`, 1);
  const maxPlayers = requireInteger(entry.maxPlayers, `games.${id}.maxPlayers`, 1);
  if (maxPlayers < minPlayers) {
    fail(`games.${id}.maxPlayers must be >= minPlayers.`);
  }
  const capabilities = normalizeCapabilities(
    entry.capabilities,
    `games.${id}.capabilities`,
  );
  const orientation = normalizeOrientation(
    entry.orientation,
    `games.${id}.orientation`,
  );
  const normalized = {
    id,
    name,
    tagline,
    description: requireText(entry.description, `games.${id}.description`),
    status,
    minPlayers,
    maxPlayers,
    capabilities,
    orientation,
    tags: normalizeTags(entry.tags, `games.${id}.tags`),
    accent,
    icon: requireText(entry.icon, `games.${id}.icon`),
    featured: entry.featured === true,
    sortOrder:
      typeof entry.sortOrder === "number" && Number.isFinite(entry.sortOrder)
        ? entry.sortOrder
        : 100,
  };
  const webPath = optionalText(entry.webPath, `games.${id}.webPath`);
  if (webPath !== undefined) {
    normalized.webPath = webPath;
  }
  const cover = optionalText(entry.cover, `games.${id}.cover`);
  if (cover !== undefined) {
    normalized.cover = cover;
  }
  const screenshots = normalizeScreenshots(
    entry.screenshots,
    `games.${id}.screenshots`,
  );
  if (screenshots !== undefined) {
    normalized.screenshots = screenshots;
  }
  return normalized;
}

/**
 * Build a catalog from real game manifests and planned entries. Release data is
 * used for version/availability, but catalog metadata remains advisory.
 */
export function buildGamesCatalog({
  manifests = [],
  plannedGames = [],
  releaseManifest,
  generatedAt = new Date().toISOString(),
} = {}) {
  const releases = latestReleases(releaseManifest);
  const games = [];
  const ids = new Set();

  for (const manifest of manifests) {
    const release =
      typeof manifest?.id === "string"
        ? releases.get(manifest.id)
        : undefined;
    const entry = normalizeManifest(manifest, release, games.length);
    if (ids.has(entry.id)) {
      fail(`Duplicate game id: ${entry.id}.`);
    }
    ids.add(entry.id);
    games.push(entry);
  }

  for (const planned of plannedGames) {
    const entry = normalizePlanned(planned, games.length);
    if (ids.has(entry.id)) {
      fail(`Duplicate game id: ${entry.id}.`);
    }
    ids.add(entry.id);
    games.push(entry);
  }

  games.sort(
    (left, right) =>
      (STATUS_ORDER.get(left.status) ?? 99) -
        (STATUS_ORDER.get(right.status) ?? 99) ||
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name) ||
      left.id.localeCompare(right.id),
  );

  return {
    format: 1,
    generatedAt,
    games: games.filter((entry) => entry.status !== "hidden"),
  };
}
