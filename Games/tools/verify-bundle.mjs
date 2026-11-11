#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  sha256File,
  verifyBundleDescriptor,
} from "./lib/bundle.mjs";

function usage() {
  console.log(`Usage: node tools/verify-bundle.mjs <descriptor.json> <bundle.zip> [options]

Options:
  --key <keyId=base64>   Pin a trusted Ed25519 public key (repeatable)
  --help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      key: { type: "string", multiple: true, default: [] },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    usage();
    return;
  }
  if (positionals.length !== 2) {
    usage();
    fail("a descriptor and a ZIP file are required.");
  }

  const [descriptorPath, zipPath] = positionals.map((value) => path.resolve(value));
  const descriptor = JSON.parse(await readFile(descriptorPath, "utf8"));
  const trustedKeys =
    values.key.length > 0
      ? Object.fromEntries(
          values.key.map((entry) => {
            const separator = entry.indexOf("=");
            if (separator <= 0 || separator === entry.length - 1) {
              throw new Error("--key must use the keyId=base64 format.");
            }
            return [entry.slice(0, separator), entry.slice(separator + 1)];
          }),
        )
      : undefined;

  const verification = verifyBundleDescriptor(descriptor, trustedKeys);
  if (!verification.ok) {
    fail(verification.error);
  }

  const digest = await sha256File(zipPath);
  if (digest !== descriptor.sha256) {
    fail("The ZIP SHA-256 does not match the descriptor.");
  }
  const { size } = await stat(zipPath);
  if (size !== descriptor.size) {
    fail("The ZIP size does not match the descriptor.");
  }

  console.log(`Verified ${descriptor.gameId} ${descriptor.version}`);
  console.log(`  key:    ${descriptor.keyId}`);
  console.log(`  sha256: ${digest}`);
  console.log(`  size:   ${size} bytes`);
  if (trustedKeys === undefined) {
    console.warn(
      "warning: no pinned key was provided; verification used the descriptor's embedded public key.",
    );
  }
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
