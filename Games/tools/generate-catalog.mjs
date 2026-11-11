#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { buildGamesCatalog } from "./lib/catalog.mjs";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESERVED_DIRECTORIES = new Set([
  "catalog",
  "hosts",
  "launcher",
  "node_modules",
  "releases",
  "runtime",
  "shared",
  "tools",
]);

function usage() {
  console.log(`Usage: node tools/generate-catalog.mjs [options]

Options:
  --out <file>           Catalog output (default: releases/games.json)
  --public <dir>         Also write <dir>/games.json for the web launcher
  --planned <file>       Planned-game metadata
                         (default: catalog/planned-games.json)
  --releases <dir>       Release root (default: releases)
  --help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function readJsonIfPresent(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (cause) {
    if (cause.code === "ENOENT") {
      return undefined;
    }
    throw cause;
  }
}

async function findManifests() {
  const entries = await readdir(GAMES_ROOT, { withFileTypes: true });
  const manifests = [];
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      RESERVED_DIRECTORIES.has(entry.name)
    ) {
      continue;
    }
    const manifestPath = path.join(GAMES_ROOT, entry.name, "manifest.json");
    const manifest = await readJsonIfPresent(manifestPath);
    if (manifest === undefined) {
      continue;
    }
    if (typeof manifest !== "object" || manifest === null) {
      fail(`${manifestPath} must contain a JSON object.`);
    }
    manifests.push(manifest);
  }
  return manifests;
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      public: { type: "string" },
      planned: { type: "string" },
      releases: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }

  const releaseRoot = path.resolve(
    values.releases ?? path.join(GAMES_ROOT, "releases"),
  );
  const releaseManifest = await readJsonIfPresent(
    path.join(releaseRoot, "release-manifest.json"),
  );
  const plannedFile = path.resolve(
    values.planned ?? path.join(GAMES_ROOT, "catalog", "planned-games.json"),
  );
  const plannedDocument = await readJsonIfPresent(plannedFile);
  const plannedGames = plannedDocument?.games ?? [];
  if (!Array.isArray(plannedGames)) {
    fail(`${plannedFile} must contain a games array.`);
  }

  const catalog = buildGamesCatalog({
    manifests: await findManifests(),
    plannedGames,
    releaseManifest,
  });

  const outPath = path.resolve(
    values.out ?? path.join(releaseRoot, "games.json"),
  );
  await mkdir(path.dirname(outPath), { recursive: true });
  const serialized = `${JSON.stringify(catalog, null, 2)}\n`;
  await writeFile(outPath, serialized);

  if (values.public !== undefined) {
    const publicDirectory = path.resolve(values.public);
    await mkdir(publicDirectory, { recursive: true });
    await writeFile(path.join(publicDirectory, "games.json"), serialized);
  }

  const available = catalog.games.filter((game) => game.status === "available");
  console.log(
    `Wrote ${catalog.games.length} game${catalog.games.length === 1 ? "" : "s"} to ${outPath} (${available.length} available).`,
  );
  for (const game of available) {
    if (game.release === undefined) {
      console.warn(
        `warning: ${game.id} is listed as available but has no release descriptor yet.`,
      );
    }
  }
  if (values.public !== undefined) {
    console.log(`  web copy: ${path.join(path.resolve(values.public), "games.json")}`);
  }
  for (const game of catalog.games) {
    console.log(
      `  ${game.id.padEnd(12)} ${game.status.padEnd(12)} ${game.version ?? ""}`.trimEnd(),
    );
  }
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
