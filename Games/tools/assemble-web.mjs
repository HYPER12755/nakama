#!/usr/bin/env node
import {
  access,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RESERVED = new Set([
  "catalog",
  "hosts",
  "launcher",
  "node_modules",
  "releases",
  "runtime",
  "shared",
  "tools",
]);
const launcherDist = path.join(GAMES_ROOT, "launcher", "dist");

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function gameDirectories() {
  const entries = await readdir(GAMES_ROOT, { withFileTypes: true });
  const directories = new Map();
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      RESERVED.has(entry.name)
    ) {
      continue;
    }
    const manifestPath = path.join(GAMES_ROOT, entry.name, "manifest.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (typeof manifest.id === "string") {
        directories.set(manifest.id, {
          directory: path.join(GAMES_ROOT, entry.name),
          manifest,
        });
      }
    } catch (cause) {
      if (cause.code !== "ENOENT") {
        throw cause;
      }
    }
  }
  return directories;
}

async function main() {
  const catalogPath = path.join(GAMES_ROOT, "releases", "games.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  if (!Array.isArray(catalog.games)) {
    fail(`${catalogPath} does not contain a games array.`);
  }
  if (!(await exists(launcherDist))) {
    fail("The launcher build is missing. Run the launcher build first.");
  }

  const directories = await gameDirectories();
  let assembled = 0;
  for (const game of catalog.games) {
    if (game.status !== "available" || game.webPath === undefined) {
      continue;
    }
    if (
      typeof game.webPath !== "string" ||
      game.webPath.startsWith("http://") ||
      game.webPath.startsWith("https://") ||
      game.webPath.startsWith("/") ||
      game.webPath.split("/").some((part) => part === "..")
    ) {
      console.log(`Skipping ${game.id}: webPath is external or unsafe.`);
      continue;
    }
    const source = directories.get(game.id);
    if (source === undefined) {
      console.log(`Skipping ${game.id}: no local game package was found.`);
      continue;
    }
    const dist = path.join(source.directory, "dist");
    if (!(await exists(path.join(dist, source.manifest.entry ?? "index.html")))) {
      console.log(
        `Skipping ${game.id}: ${path.relative(GAMES_ROOT, dist)} has no built entry file.`,
      );
      continue;
    }
    const target = path.resolve(launcherDist, game.webPath);
    const relativeTarget = path.relative(launcherDist, target);
    if (relativeTarget.startsWith("..") || path.isAbsolute(relativeTarget)) {
      fail(`Refusing to assemble ${game.id} outside the launcher build.`);
    }
    await mkdir(target, { recursive: true });
    await cp(dist, target, { recursive: true });
    console.log(`Assembled ${game.id} at /${game.webPath.replace(/\\/g, "/")}`);
    assembled += 1;
  }

  await mkdir(launcherDist, { recursive: true });
  await copyFile(
    catalogPath,
    path.join(launcherDist, "games.json"),
  );
  if (assembled === 0) {
    console.warn(
      "warning: no available web game builds were assembled. The menu will still load, but Play links may be unavailable.",
    );
  }
  console.log(`Web bundle ready at ${path.relative(GAMES_ROOT, launcherDist)}`);
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
