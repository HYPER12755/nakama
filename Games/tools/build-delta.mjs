#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadSigningKey, readZipEntries } from "./lib/bundle.mjs";
import {
  createBundleDelta,
  planDelta,
  writeDeltaArtifacts,
} from "./lib/delta.mjs";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_KEY_PATH = path.join(GAMES_ROOT, ".keys", "dev-signing-key.pem");

function usage() {
  console.log(`Usage: node tools/build-delta.mjs --game <id> --from <version> --to <version> [options]

Options:
  --game <id>            Game id, for example uno
  --from <version>       Installed/base release version
  --to <version>         Target release version
  --key <path>           Ed25519 private key PEM (default: .keys/dev-signing-key.pem)
  --key-id <id>          Key identifier pinned by hosts (default: dev-1)
  --help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function main() {
  const { values } = parseArgs({
    options: {
      game: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      key: { type: "string" },
      "key-id": { type: "string", default: "dev-1" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    usage();
    return;
  }
  if (
    values.game === undefined ||
    values.from === undefined ||
    values.to === undefined
  ) {
    usage();
    fail("--game, --from, and --to are required.");
  }

  const releaseRoot = path.join(GAMES_ROOT, "releases");
  const baseDirectory = path.join(releaseRoot, values.game, values.from);
  const targetDirectory = path.join(releaseRoot, values.game, values.to);
  const baseDescriptorPath = path.join(
    baseDirectory,
    `${values.game}-${values.from}.bundle.json`,
  );
  const targetDescriptorPath = path.join(
    targetDirectory,
    `${values.game}-${values.to}.bundle.json`,
  );
  const baseDescriptor = await readJson(baseDescriptorPath);
  const targetDescriptor = await readJson(targetDescriptorPath);
  if (
    baseDescriptor.gameId !== values.game ||
    targetDescriptor.gameId !== values.game
  ) {
    fail("The release descriptors belong to a different game.");
  }

  const baseZip = await readFile(
    path.join(baseDirectory, `${values.game}-${values.from}.zip`),
  );
  const targetZip = await readFile(
    path.join(targetDirectory, `${values.game}-${values.to}.zip`),
  );
  const plan = planDelta(
    readZipEntries(baseZip),
    readZipEntries(targetZip),
  );
  if (plan.files.length === 0 && plan.removed.length === 0) {
    fail("The releases are identical; no delta is needed.");
  }

  const signing = await loadSigningKey({
    keyPath: path.resolve(values.key ?? DEFAULT_KEY_PATH),
    keyId: values["key-id"],
  });
  const delta = createBundleDelta({
    gameId: values.game,
    baseVersion: values.from,
    baseSha256: baseDescriptor.sha256,
    targetVersion: values.to,
    targetSha256: targetDescriptor.sha256,
    files: plan.files,
    removed: plan.removed,
    keyId: signing.keyId,
    privateKeyPem: signing.privateKeyPem,
  });
  const result = await writeDeltaArtifacts({
    releaseRoot,
    gameId: values.game,
    version: values.to,
    baseVersion: values.from,
    delta,
    files: plan.files,
  });

  const bytes = plan.files.reduce((total, file) => total + file.size, 0);
  console.log(`Built ${values.game} delta ${values.from} -> ${values.to}`);
  console.log(`  descriptor: ${result.descriptorPath}`);
  console.log(`  changed:    ${plan.files.length}`);
  console.log(`  removed:    ${plan.removed.length}`);
  console.log(`  bytes:      ${bytes}`);
  console.log(`  full zip:   ${targetZip.length}`);
  console.log(
    `  savings:    ${Math.max(0, Math.round((1 - bytes / targetZip.length) * 100))}%`,
  );
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
