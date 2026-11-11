#!/usr/bin/env node
import { access, mkdir, writeFile, chmod } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  loadSigningKey,
} from "./lib/bundle.mjs";

const GAMES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function usage() {
  console.log(`Usage: node tools/generate-signing-key.mjs [options]

Options:
  --out <path>    Private key PEM path (default: Games/.keys/dev-signing-key.pem)
  --key-id <id>   Key identifier (default: dev-1)
  --force         Replace an existing key
  --help
`);
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      "key-id": { type: "string", default: "dev-1" },
      force: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });

  if (values.help) {
    usage();
    return;
  }

  const keyPath = path.resolve(
    values.out ?? path.join(GAMES_ROOT, ".keys", "dev-signing-key.pem"),
  );
  if (!values.force && (await exists(keyPath))) {
    throw new Error(
      `${keyPath} already exists. Pass --force only if you intend to replace it.`,
    );
  }

  if (values.force) {
    const { unlink } = await import("node:fs/promises");
    await unlink(keyPath).catch((cause) => {
      if (cause.code !== "ENOENT") {
        throw cause;
      }
    });
  }

  const key = await loadSigningKey({
    keyPath,
    keyId: values["key-id"],
    generateIfMissing: true,
  });

  if (!key.generated && !values.force) {
    throw new Error("The key was not generated.");
  }

  await mkdir(path.dirname(keyPath), { recursive: true });
  await chmod(keyPath, 0o600);
  await writeFile(
    `${keyPath}.pub.json`,
    `${JSON.stringify(
      {
        algorithm: "ed25519",
        keyId: key.keyId,
        publicKey: key.publicKey,
      },
      null,
      2,
    )}\n`,
    { mode: 0o644 },
  );

  console.log(`Generated Ed25519 signing key`);
  console.log(`  private key: ${keyPath}`);
  console.log(`  key id:      ${key.keyId}`);
  console.log(`  public key:  ${key.publicKey}`);
  console.log("");
  console.log("Keep the private key off client devices and out of version control.");
}

main().catch((cause) => {
  console.error(`error: ${cause instanceof Error ? cause.message : String(cause)}`);
  process.exit(1);
});
