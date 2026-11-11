#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  createBundleDescriptor,
  loadSigningKey,
  sha256Buffer,
  signBundleDescriptor,
  zipDirectory,
} from "./lib/bundle.mjs";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_KEY_PATH = path.join(GAMES_ROOT, ".keys", "dev-signing-key.pem");

function usage() {
  console.log(`Usage: node tools/package-game.mjs --game <id> [options]

Options:
  --game <id>            Game manifest id to package (for example: chess)
  --skip-build           Reuse an existing game dist/ build
  --input <dir>          Override the game build directory
  --out <dir>            Override the release output root
  --base-url <url>       Public CDN base URL for the bundle
  --key <path>           Ed25519 private key PEM (default: .keys/dev-signing-key.pem)
  --key-id <id>          Key identifier pinned by hosts (default: dev-1)
  --min-host-protocol <n>
  --help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function findGame(gameId) {
  const entries = await readdir(GAMES_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.name.startsWith(".") ||
      entry.name === "node_modules" ||
      entry.name === "runtime" ||
      entry.name === "shared" ||
      entry.name === "tools" ||
      entry.name === "releases" ||
      entry.name === "hosts"
    ) {
      continue;
    }
    const manifestPath = path.join(GAMES_ROOT, entry.name, "manifest.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (manifest.id === gameId) {
        return { directory: path.join(GAMES_ROOT, entry.name), manifest };
      }
    } catch (cause) {
      if (cause.code !== "ENOENT") {
        throw cause;
      }
    }
  }
  throw new Error(`No game manifest with id "${gameId}" was found.`);
}

function runBuild(gameId) {
  const result = spawnSync("pnpm", ["run", `build:${gameId}`], {
    cwd: GAMES_ROOT,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`The build script for ${gameId} failed.`);
  }
}

function publicUrl(baseUrl, relativePath) {
  if (baseUrl === undefined) {
    return relativePath.replace(/\\/g, "/");
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(relativePath.replace(/\\/g, "/"), normalizedBase).toString();
}

async function main() {
  const { values } = parseArgs({
    options: {
      game: { type: "string" },
      "skip-build": { type: "boolean", default: false },
      input: { type: "string" },
      out: { type: "string" },
      "base-url": { type: "string" },
      key: { type: "string" },
      "key-id": { type: "string", default: "dev-1" },
      "min-host-protocol": { type: "string", default: "1" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }
  if (values.game === undefined) {
    usage();
    fail("--game is required.");
  }

  const game = await findGame(values.game);
  if (!values["skip-build"]) {
    console.log(`Building ${game.manifest.name}...`);
    runBuild(game.manifest.id);
  }

  const inputDirectory = path.resolve(
    values.input ?? path.join(game.directory, "dist"),
  );
  const outputRoot = path.resolve(
    values.out ?? path.join(GAMES_ROOT, "releases"),
  );
  const releaseDirectory = path.join(outputRoot, game.manifest.id, game.manifest.version);
  const fileName = `${game.manifest.id}-${game.manifest.version}.zip`;
  const relativeUrl = `${game.manifest.id}/${game.manifest.version}/${fileName}`;

  let indexHtml;
  try {
    indexHtml = await readFile(path.join(inputDirectory, game.manifest.entry));
  } catch (cause) {
    if (cause.code === "ENOENT") {
      throw new Error(
        `The build entry ${game.manifest.entry} is missing from ${inputDirectory}. Run the build without --skip-build.`,
      );
    }
    throw cause;
  }
  if (indexHtml.length === 0) {
    throw new Error("The game entry file is empty.");
  }

  const zip = await zipDirectory(inputDirectory);
  const sha256 = sha256Buffer(zip);
  const keyPath = path.resolve(values.key ?? DEFAULT_KEY_PATH);
  const signing = await loadSigningKey({
    keyPath,
    keyId: values["key-id"],
    generateIfMissing: true,
  });

  if (signing.generated) {
    console.warn(
      `warning: generated a development signing key at ${keyPath}. Pin this public key in debug builds only.`,
    );
  }

  const descriptor = signBundleDescriptor(
    createBundleDescriptor({
      manifest: game.manifest,
      sha256,
      size: zip.length,
      url: publicUrl(values["base-url"], relativeUrl),
      keyId: signing.keyId,
      minHostProtocol: Number(values["min-host-protocol"]),
    }),
    signing.privateKeyPem,
  );

  const zipPath = path.join(releaseDirectory, fileName);
  const descriptorPath = path.join(
    releaseDirectory,
    `${game.manifest.id}-${game.manifest.version}.bundle.json`,
  );
  await mkdir(releaseDirectory, { recursive: true });
  await writeFile(zipPath, zip);
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);

  console.log(`Packaged ${game.manifest.name} ${game.manifest.version}`);
  console.log(`  zip:        ${zipPath}`);
  console.log(`  descriptor: ${descriptorPath}`);
  console.log(`  sha256:     ${sha256}`);
  console.log(`  size:       ${zip.length} bytes`);
  console.log(`  key id:     ${signing.keyId}`);
  console.log(`  public key: ${signing.publicKey}`);
  console.log("");
  console.log("Pin this public key in production host builds:");
  console.log(`  ${signing.publicKey}`);
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
