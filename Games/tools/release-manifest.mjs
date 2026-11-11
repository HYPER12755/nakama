#!/usr/bin/env node
import { readFile, readdir, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  compareSemver,
  compareText,
  releaseManifest,
  sha256File,
  verifyBundleDescriptor,
} from "./lib/bundle.mjs";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.log(`Usage: node tools/release-manifest.mjs [options]

Options:
  --releases <dir>       Release root to scan (default: Games/releases)
  --out <file>           Output path (default: <releases>/release-manifest.json)
  --base-url <url>       Rewrite bundle URLs against this public CDN URL
  --key <keyId=base64>   Pin a trusted Ed25519 public key (repeatable)
  --latest-only          Include only the newest version of each game
  --help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function findDescriptors(directory) {
  const found = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (cause) {
    if (cause.code === "ENOENT") {
      return found;
    }
    throw cause;
  }
  entries.sort((left, right) => compareText(left.name, right.name));
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await findDescriptors(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".bundle.json")) {
      found.push(entryPath);
    }
  }
  return found;
}

function rewriteUrl(bundle, baseUrl) {
  if (baseUrl === undefined) {
    return bundle.url;
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(bundle.url.replace(/^\/+/, ""), normalizedBase).toString();
}

function parseTrustedKeys(entries) {
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(
    entries.map((entry) => {
      const separator = entry.indexOf("=");
      if (separator <= 0 || separator === entry.length - 1) {
        throw new Error("--key must use the keyId=base64 format.");
      }
      return [entry.slice(0, separator), entry.slice(separator + 1)];
    }),
  );
}

async function main() {
  const { values } = parseArgs({
    options: {
      releases: { type: "string" },
      out: { type: "string" },
      "base-url": { type: "string" },
      key: { type: "string", multiple: true, default: [] },
      "latest-only": { type: "boolean", default: false },
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
  const outputPath = path.resolve(
    values.out ?? path.join(releaseRoot, "release-manifest.json"),
  );
  const descriptors = await findDescriptors(releaseRoot);
  if (descriptors.length === 0) {
    fail(`No .bundle.json descriptors were found under ${releaseRoot}.`);
  }
  const trustedKeys = parseTrustedKeys(values.key);
  if (trustedKeys === undefined) {
    console.warn(
      "warning: no pinned key was provided; descriptors are checked against their embedded public keys.",
    );
  }

  const signers = {};
  const bundles = [];
  const seen = new Set();

  for (const descriptorPath of descriptors) {
    const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
    const verification = verifyBundleDescriptor(descriptor, trustedKeys);
    if (!verification.ok) {
      fail(`${descriptorPath}: ${verification.error}`);
    }

    const zipPath = path.join(
      path.dirname(descriptorPath),
      `${descriptor.gameId}-${descriptor.version}.zip`,
    );
    let zipStat;
    try {
      zipStat = await stat(zipPath);
    } catch (cause) {
      if (cause.code === "ENOENT") {
        fail(`Missing bundle file next to ${descriptorPath}: ${zipPath}`);
      }
      throw cause;
    }
    if (zipStat.size !== descriptor.size) {
      fail(`${zipPath}: size does not match the descriptor.`);
    }
    const digest = await sha256File(zipPath);
    if (digest !== descriptor.sha256) {
      fail(`${zipPath}: SHA-256 does not match the descriptor.`);
    }

    const key = `${descriptor.gameId}@${descriptor.version}`;
    if (seen.has(key)) {
      fail(`Duplicate bundle descriptor for ${key}.`);
    }
    seen.add(key);

    const existing = signers[descriptor.keyId];
    if (
      existing !== undefined &&
      existing.publicKey !== descriptor.publicKey
    ) {
      fail(`Conflicting public keys for key id ${descriptor.keyId}.`);
    }
    signers[descriptor.keyId] = {
      algorithm: "ed25519",
      publicKey: descriptor.publicKey,
    };

    bundles.push({ ...descriptor, url: rewriteUrl(descriptor, values["base-url"]) });
  }

  bundles.sort((left, right) => {
    const gameOrder = compareText(left.gameId, right.gameId);
    return gameOrder !== 0
      ? gameOrder
      : compareSemver(right.version, left.version);
  });

  let selected = bundles;
  if (values["latest-only"]) {
    const latest = new Map();
    for (const bundle of bundles) {
      const current = latest.get(bundle.gameId);
      if (
        current === undefined ||
        compareSemver(bundle.version, current.version) > 0
      ) {
        latest.set(bundle.gameId, bundle);
      }
    }
    selected = [...latest.values()].sort((left, right) =>
      compareText(left.gameId, right.gameId),
    );
  }

  const manifest = releaseManifest({ bundles: selected, signers });
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`Wrote ${outputPath}`);
  console.log(`  bundles: ${selected.length}`);
  console.log(`  signers: ${Object.keys(signers).join(", ")}`);
  for (const bundle of selected) {
    console.log(`  ${bundle.gameId} ${bundle.version} -> ${bundle.url}`);
  }
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
