import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  publicKeyBase64FromPrivate,
  sha256Buffer,
  signPayload,
  verifyPayload,
} from "./bundle.mjs";
const BUNDLE_DELTA_FORMAT = 2;

function bundleDeltaSigningPayload(delta) {
  const files = delta.files
    .map((file) => `${file.path}\t${file.sha256}\t${file.size}`)
    .join("\n");
  return [
    "moongames-delta-v2",
    String(delta.format),
    delta.gameId,
    delta.baseVersion,
    delta.baseSha256,
    delta.targetVersion,
    delta.targetSha256,
    delta.keyId,
    files,
    delta.removed.join("\n"),
  ].join("\n");
}

function normalizeFiles(files) {
  return [...files]
    .map((file) => ({
      path: file.path,
      sha256: file.sha256,
      size: file.size,
      url: file.url,
    }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

function normalizeRemoved(removed) {
  return [...new Set(removed)].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
}

export function createBundleDelta({
  gameId,
  baseVersion,
  baseSha256,
  targetVersion,
  targetSha256,
  files,
  removed,
  keyId,
  privateKeyPem,
}) {
  const unsigned = {
    format: BUNDLE_DELTA_FORMAT,
    gameId,
    baseVersion,
    baseSha256,
    targetVersion,
    targetSha256,
    files: normalizeFiles(files),
    removed: normalizeRemoved(removed),
    keyId,
    publicKey: publicKeyBase64FromPrivate(privateKeyPem),
    signature: "",
  };
  const signature = signPayload(bundleDeltaSigningPayload(unsigned), privateKeyPem);
  return { ...unsigned, signature };
}

export function verifyBundleDelta(delta, trustedKeys) {
  if (typeof delta !== "object" || delta === null) {
    return { ok: false, error: "The delta descriptor must be an object." };
  }
  if (delta.format !== BUNDLE_DELTA_FORMAT) {
    return { ok: false, error: "Unsupported bundle delta format." };
  }
  const trusted = trustedKeys?.[delta.keyId];
  const key = trusted ?? delta.publicKey;
  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, error: `No public key is configured for ${delta.keyId}.` };
  }
  if (trusted !== undefined && trusted !== delta.publicKey) {
    return { ok: false, error: `The delta key does not match pinned key ${delta.keyId}.` };
  }
  if (!Array.isArray(delta.files) || !Array.isArray(delta.removed)) {
    return { ok: false, error: "The delta file lists must be arrays." };
  }
  if (!verifyPayload(bundleDeltaSigningPayload(delta), delta.signature, key)) {
    return { ok: false, error: "The delta signature is invalid." };
  }
  return { ok: true };
}

export function planDelta(baseEntries, targetEntries) {
  const base = new Map(baseEntries.map((entry) => [entry.name, sha256Buffer(entry.data)]));
  const files = [];
  for (const entry of targetEntries) {
    const sha256 = sha256Buffer(entry.data);
    if (base.get(entry.name) === sha256) {
      continue;
    }
    files.push({
      path: entry.name,
      sha256,
      size: entry.data.length,
      data: entry.data,
    });
  }
  const targetNames = new Set(targetEntries.map((entry) => entry.name));
  const removed = [...base.keys()].filter((name) => !targetNames.has(name));
  return { files, removed };
}

export async function writeDeltaArtifacts({
  releaseRoot,
  gameId,
  version,
  baseVersion,
  delta,
  files,
}) {
  const directory = path.join(
    releaseRoot,
    gameId,
    version,
    "deltas",
    `${baseVersion}-${version}`,
  );
  const objectDirectory = path.join(directory, "objects");
  await mkdir(objectDirectory, { recursive: true });
  const serializedFiles = [];
  for (const file of files) {
    const objectName = file.sha256;
    await writeFile(path.join(objectDirectory, objectName), file.data);
    serializedFiles.push({ ...file, url: `objects/${objectName}` });
  }
  const descriptor = { ...delta, files: serializedFiles };
  const descriptorPath = path.join(directory, "delta.json");
  await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`);
  return { descriptorPath, descriptor };
}
