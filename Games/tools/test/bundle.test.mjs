import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  BUNDLE_FORMAT,
  bundleSigningPayload,
  compareSemver,
  createBundleDescriptor,
  createZip,
  loadSigningKey,
  releaseManifest,
  selectLatestBundles,
  sha256Buffer,
  signBundleDescriptor,
  verifyBundleDescriptor,
  zipDirectory,
} from "../lib/bundle.mjs";

const manifest = {
  id: "chess",
  name: "Chess",
  version: "0.2.0",
  sdkVersion: "0.1.0",
  entry: "index.html",
  capabilities: ["local", "online"],
};

async function descriptorFor(privateKeyPem, keyId = "test-1") {
  const data = Buffer.from("<html>MoonGames</html>");
  return signBundleDescriptor(
    createBundleDescriptor({
      manifest,
      sha256: sha256Buffer(data),
      size: data.length,
      url: "chess/0.2.0/chess-0.2.0.zip",
      keyId,
      publishedAt: "2026-01-02T03:04:05.000Z",
    }),
    privateKeyPem,
  );
}

test("zip output is deterministic and valid", async () => {
  const files = [
    { name: "index.html", data: "<html>MoonGames</html>" },
    { name: "assets/index.js", data: "console.log('moon');" },
  ];
  const first = createZip(files);
  const second = createZip([...files].reverse());
  assert.deepEqual(first, second);
  assert.equal(first.subarray(0, 4).toString("hex"), "504b0304");

  const directory = await mkdtemp(path.join(os.tmpdir(), "moongames-zip-"));
  const zipPath = path.join(directory, "game.zip");
  await writeFile(zipPath, first);
  const probe = spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
  if (probe.error?.code === "ENOENT") {
    return;
  }
  assert.equal(probe.status, 0, probe.stderr || probe.stdout);
  assert.match(probe.stdout, /No errors detected/);
});

test("zip output rejects traversal and empty bundles", () => {
  assert.throws(
    () => createZip([{ name: "../escape.txt", data: "no" }]),
    /Unsafe ZIP entry/,
  );
  assert.throws(() => createZip([]), /at least one file/);
});

test("zip directory packaging is deterministic", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "moongames-zipdir-"));
  await writeFile(path.join(directory, "index.html"), "MoonGames");
  await writeFile(path.join(directory, "asset.txt"), Buffer.from("asset"));
  const first = await zipDirectory(directory);
  const second = await zipDirectory(directory);
  assert.deepEqual(first, second);
});

test("signing payload stays stable across host implementations", () => {
  const descriptor = {
    format: 1,
    gameId: "chess",
    gameName: "Chess",
    version: "0.2.0",
    sdkVersion: "0.1.0",
    minHostProtocol: 1,
    entry: "index.html",
    capabilities: ["local"],
    publishedAt: "2026-01-02T03:04:05.000Z",
    sha256: "a".repeat(64),
    size: 123,
    url: "chess/0.2.0/chess-0.2.0.zip",
    keyId: "test-1",
    publicKey: `${"A".repeat(43)}=`,
    signature: `${"A".repeat(86)}==`,
  };
  assert.equal(
    bundleSigningPayload(descriptor),
    [
      "moongames-bundle-v1",
      "1",
      "chess",
      "0.2.0",
      "0.1.0",
      "1",
      "index.html",
      "a".repeat(64),
      "123",
      "test-1",
    ].join("\n"),
  );
});

test("descriptor signatures verify with pinned keys and detect tampering", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "moongames-key-"));
  const keyPath = path.join(directory, "signing-key.pem");
  const key = await loadSigningKey({
    keyPath,
    keyId: "test-1",
    generateIfMissing: true,
  });
  assert.equal(key.generated, true);
  assert.equal(Buffer.from(key.publicKey, "base64").length, 32);
  assert.match(await readFile(keyPath, "utf8"), /PRIVATE KEY/);

  const descriptor = await descriptorFor(key.privateKeyPem);
  assert.equal(descriptor.format, BUNDLE_FORMAT);
  assert.deepEqual(
    verifyBundleDescriptor(descriptor, { "test-1": key.publicKey }),
    { ok: true },
  );
  assert.deepEqual(verifyBundleDescriptor(descriptor), { ok: true });

  const tampered = { ...descriptor, version: "9.9.9" };
  assert.equal(
    verifyBundleDescriptor(tampered, { "test-1": key.publicKey }).ok,
    false,
  );

  const wrongKey = await loadSigningKey({
    keyPath: path.join(directory, "wrong-key.pem"),
    keyId: "test-1",
    generateIfMissing: true,
  });
  assert.equal(
    verifyBundleDescriptor(descriptor, { "test-1": wrongKey.publicKey }).ok,
    false,
  );
  assert.equal(
    verifyBundleDescriptor(descriptor, { "other": key.publicKey }).ok,
    false,
  );

  const relocated = {
    ...descriptor,
    url: "https://cdn.example.com/chess/0.2.0/chess-0.2.0.zip",
  };
  assert.deepEqual(
    verifyBundleDescriptor(relocated, { "test-1": key.publicKey }),
    { ok: true },
  );
});

test("release manifests sort and select the latest bundle", async () => {
  assert.ok(compareSemver("1.0.0", "1.0.0-beta") > 0);
  assert.ok(compareSemver("1.0.0-beta.2", "1.0.0-beta.10") < 0);
  const directory = await mkdtemp(path.join(os.tmpdir(), "moongames-release-"));
  const key = await loadSigningKey({
    keyPath: path.join(directory, "signing-key.pem"),
    keyId: "test-1",
    generateIfMissing: true,
  });

  const make = async (version) =>
    signBundleDescriptor(
      createBundleDescriptor({
        manifest: { ...manifest, version },
        sha256: "a".repeat(64),
        size: 123,
        url: `chess/${version}/chess-${version}.zip`,
        keyId: "test-1",
      }),
      key.privateKeyPem,
    );

  const older = await make("0.1.0");
  const newer = await make("0.2.0");
  const latest = selectLatestBundles([older, newer]);
  assert.equal(latest.length, 1);
  assert.equal(latest[0]?.version, "0.2.0");

  const output = releaseManifest({
    bundles: [older, newer],
    signers: {
      "test-1": { algorithm: "ed25519", publicKey: key.publicKey },
    },
    generatedAt: "2026-01-02T03:04:05.000Z",
  });
  assert.equal(output.format, 1);
  assert.equal(output.bundles.length, 2);
  assert.equal(output.signers["test-1"].publicKey, key.publicKey);
});
