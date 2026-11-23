import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createZip,
  loadSigningKey,
  readZipEntries,
  sha256Buffer,
} from "../lib/bundle.mjs";
import {
  createBundleDelta,
  planDelta,
  verifyBundleDelta,
  writeDeltaArtifacts,
} from "../lib/delta.mjs";

async function signingKey(directory) {
  return loadSigningKey({
    keyPath: path.join(directory, "delta-key.pem"),
    keyId: "delta-1",
    generateIfMissing: true,
  });
}

test("delta planning includes only changed and removed files", () => {
  const base = [
    { name: "index.html", data: Buffer.from("same") },
    { name: "old.js", data: Buffer.from("old") },
  ];
  const target = [
    { name: "index.html", data: Buffer.from("same") },
    { name: "new.js", data: Buffer.from("new") },
  ];
  const plan = planDelta(base, target);
  assert.deepEqual(
    plan.files.map((file) => file.path),
    ["new.js"],
  );
  assert.deepEqual(plan.removed, ["old.js"]);
});

test("signed delta verifies and detects tampering", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "moongames-delta-"));
  const key = await signingKey(directory);
  const delta = createBundleDelta({
    gameId: "uno",
    baseVersion: "1.0.0",
    baseSha256: "a".repeat(64),
    targetVersion: "1.1.0",
    targetSha256: "b".repeat(64),
    files: [
      {
        path: "assets/sound.mp3",
        sha256: "c".repeat(64),
        size: 10,
        url: "objects/" + "c".repeat(64),
      },
    ],
    removed: ["assets/old.mp3"],
    keyId: key.keyId,
    privateKeyPem: key.privateKeyPem,
  });
  const trustedKeys = { [key.keyId]: key.publicKey };
  assert.equal(verifyBundleDelta(delta, trustedKeys).ok, true);
  assert.equal(verifyBundleDelta(delta, {}).ok, false);
  assert.equal(verifyBundleDelta(delta, { "delta-1": "wrong" }).ok, false);

  const tampered = { ...delta, targetVersion: "1.2.0" };
  assert.equal(verifyBundleDelta(tampered, trustedKeys).ok, false);
});

test("delta artifacts write changed files by content hash", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "moongames-delta-write-"));
  const key = await signingKey(directory);
  const baseZip = createZip([{ name: "index.html", data: "old" }]);
  const targetZip = createZip([
    { name: "index.html", data: "new" },
    { name: "asset.txt", data: "asset" },
  ]);
  const plan = planDelta(
    readZipEntries(baseZip),
    readZipEntries(targetZip),
  );
  const delta = createBundleDelta({
    gameId: "uno",
    baseVersion: "1.0.0",
    baseSha256: sha256Buffer(baseZip),
    targetVersion: "1.1.0",
    targetSha256: sha256Buffer(targetZip),
    files: plan.files,
    removed: plan.removed,
    keyId: key.keyId,
    privateKeyPem: key.privateKeyPem,
  });
  const { descriptor } = await writeDeltaArtifacts({
    releaseRoot: directory,
    gameId: "uno",
    version: "1.1.0",
    baseVersion: "1.0.0",
    delta,
    files: plan.files,
  });
  const objectPath = path.join(
    directory,
    "uno",
    "1.1.0",
    "deltas",
    "1.0.0-1.1.0",
    "objects",
    descriptor.files[0].sha256,
  );
  assert.equal(descriptor.files.length, 2);
  assert.deepEqual(
    descriptor.files.map((file) => file.path),
    ["asset.txt", "index.html"],
  );
  assert.equal(descriptor.files.every((file) => !("data" in file)), true);
  for (const file of descriptor.files) {
    const filePath = path.join(
      directory,
      "uno",
      "1.1.0",
      "deltas",
      "1.0.0-1.1.0",
      "objects",
      file.sha256,
    );
    assert.equal((await readFile(filePath)).length, file.size);
  }
  assert.equal(
    (await readFile(objectPath)).toString(),
    descriptor.files[0].path === "index.html" ? "new" : "asset",
  );
  assert.equal(verifyBundleDelta(descriptor, { [key.keyId]: key.publicKey }).ok, true);
});
