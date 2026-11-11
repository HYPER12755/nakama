import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

export const BUNDLE_FORMAT = 1;
export const RELEASE_MANIFEST_FORMAT = 1;
export const SIGNING_PREFIX = "moongames-bundle-v1";

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const GAME_ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

export function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export async function sha256File(filePath) {
  return sha256Buffer(await readFile(filePath));
}

function rawPublicKey(publicKey) {
  const jwk = publicKey.export({ format: "jwk" });
  if (jwk.kty !== "OKP" || jwk.crv !== "Ed25519" || typeof jwk.x !== "string") {
    throw new Error("The signing key is not an Ed25519 key.");
  }
  return Buffer.from(jwk.x, "base64url");
}

function publicKeyObject(publicKeyBase64) {
  const raw = Buffer.from(publicKeyBase64, "base64");
  if (raw.length !== 32) {
    throw new Error("An Ed25519 public key must contain 32 raw bytes.");
  }
  return createPublicKey({
    key: Buffer.concat([
      Buffer.from("302a300506032b6570032100", "hex"),
      raw,
    ]),
    format: "der",
    type: "spki",
  });
}

export function readPrivateKey(privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error("The bundle signing key must be Ed25519.");
  }
  return key;
}

export function publicKeyBase64FromPrivate(privateKeyPem) {
  const privateKey = readPrivateKey(privateKeyPem);
  return rawPublicKey(createPublicKey(privateKey)).toString("base64");
}

function assertSafeField(value, field) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    throw new Error(`${field} must be a non-empty single-line string.`);
  }
}

function assertRelativeEntry(entry) {
  assertSafeField(entry, "entry");
  if (
    entry.startsWith("/") ||
    entry.includes("\\") ||
    entry.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error("entry must be a safe relative path.");
  }
}

export function assertBundleDescriptor(descriptor) {
  if (typeof descriptor !== "object" || descriptor === null) {
    throw new Error("The bundle descriptor must be an object.");
  }
  if (descriptor.format !== BUNDLE_FORMAT) {
    throw new Error(`Unsupported bundle format: ${descriptor.format}`);
  }
  if (typeof descriptor.gameId !== "string" || !GAME_ID.test(descriptor.gameId)) {
    throw new Error("gameId must use lowercase letters, digits, and dashes.");
  }
  if (typeof descriptor.version !== "string" || !SEMVER.test(descriptor.version)) {
    throw new Error("version must be a semver string.");
  }
  assertSafeField(descriptor.sdkVersion, "sdkVersion");
  assertRelativeEntry(descriptor.entry);
  if (
    !Number.isInteger(descriptor.minHostProtocol) ||
    descriptor.minHostProtocol < 1
  ) {
    throw new Error("minHostProtocol must be a positive integer.");
  }
  if (typeof descriptor.sha256 !== "string" || !HEX_SHA256.test(descriptor.sha256)) {
    throw new Error("sha256 must be 64 lowercase hexadecimal characters.");
  }
  if (!Number.isInteger(descriptor.size) || descriptor.size < 0) {
    throw new Error("size must be a non-negative integer.");
  }
  if (typeof descriptor.url !== "string" || descriptor.url.length === 0) {
    throw new Error("url must be a non-empty string.");
  }
  if (!Array.isArray(descriptor.capabilities)) {
    throw new Error("capabilities must be an array.");
  }
  for (const capability of descriptor.capabilities) {
    assertSafeField(capability, "capabilities[]");
  }
  assertSafeField(descriptor.keyId, "keyId");
  if (typeof descriptor.publicKey !== "string") {
    throw new Error("publicKey must be a base64 string.");
  }
  publicKeyObject(descriptor.publicKey);
  if (typeof descriptor.signature !== "string") {
    throw new Error("signature must be a base64 string.");
  }
  const signature = Buffer.from(descriptor.signature, "base64");
  if (signature.length !== 64) {
    throw new Error("An Ed25519 signature must contain 64 bytes.");
  }
}

export function bundleSigningPayload(descriptor) {
  assertBundleDescriptor(descriptor);
  return [
    SIGNING_PREFIX,
    String(descriptor.format),
    descriptor.gameId,
    descriptor.version,
    descriptor.sdkVersion,
    String(descriptor.minHostProtocol),
    descriptor.entry,
    descriptor.sha256,
    String(descriptor.size),
    descriptor.keyId,
  ].join("\n");
}

export function signBundleDescriptor(descriptor, privateKeyPem) {
  const privateKey = readPrivateKey(privateKeyPem);
  const publicKey = rawPublicKey(createPublicKey(privateKey)).toString("base64");
  const unsigned = { ...descriptor, publicKey };
  assertBundleDescriptor({ ...unsigned, signature: Buffer.alloc(64).toString("base64") });
  const signature = sign(
    null,
    Buffer.from(bundleSigningPayload({ ...unsigned, signature: Buffer.alloc(64).toString("base64") })),
    privateKey,
  );
  return { ...unsigned, signature: signature.toString("base64") };
}

/**
 * Verifies the descriptor signature. Pass a map of pinned key IDs to raw
 * base64 Ed25519 public keys in production. Falling back to the key embedded
 * in the descriptor is only suitable for local development.
 */
export function verifyBundleDescriptor(descriptor, trustedKeys) {
  try {
    assertBundleDescriptor(descriptor);
    const key = trustedKeys
      ? trustedKeys[descriptor.keyId]
      : descriptor.publicKey;
    if (typeof key !== "string") {
      return {
        ok: false,
        error: `No trusted public key is configured for ${descriptor.keyId}.`,
      };
    }

    const valid = verify(
      null,
      Buffer.from(bundleSigningPayload(descriptor)),
      publicKeyObject(key),
      Buffer.from(descriptor.signature, "base64"),
    );
    return valid
      ? { ok: true }
      : { ok: false, error: "The bundle descriptor signature is invalid." };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not verify the bundle.",
    };
  }
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Creates a deterministic ZIP archive. File timestamps are fixed so packaging
 * the same inputs always produces the same checksum.
 */
export function createZip(files) {
  const entries = files
    .map((file) => {
      if (
        typeof file.name !== "string" ||
        file.name.length === 0 ||
        file.name.startsWith("/") ||
        file.name.includes("\\") ||
        file.name.split("/").some((part) => part === ".." || part === "")
      ) {
        throw new Error(`Unsafe ZIP entry name: ${String(file.name)}`);
      }
      const data = Buffer.isBuffer(file.data)
        ? file.data
        : Buffer.from(file.data);
      return {
        name: file.name,
        nameBytes: Buffer.from(file.name, "utf8"),
        data,
      };
    })
    .sort((left, right) => compareText(left.name, right.name));

  if (entries.length === 0) {
    throw new Error("A game bundle must contain at least one file.");
  }
  if (entries.length > 0xffff) {
    throw new Error("The ZIP writer supports at most 65535 files.");
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const dosDate = (1 << 5) | 1;

  for (const entry of entries) {
    const checksum = crc32(entry.data);
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const useDeflate = compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;
    const method = useDeflate ? 8 : 0;
    if (entry.data.length > 0xffffffff || payload.length > 0xffffffff) {
      throw new Error("The ZIP writer does not support entries above 4 GiB.");
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(entry.nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, entry.nameBytes, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(entry.nameBytes.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, entry.nameBytes);

    offset += local.length + entry.nameBytes.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function zipDirectory(rootDirectory) {
  const files = [];

  async function visit(directory, relative) {
    const children = await readdir(directory, { withFileTypes: true });
    children.sort((left, right) => compareText(left.name, right.name));
    for (const child of children) {
      const childPath = path.join(directory, child.name);
      const childRelative = relative === "" ? child.name : `${relative}/${child.name}`;
      if (child.isSymbolicLink()) {
        throw new Error(`Bundle symlinks are not allowed: ${childRelative}`);
      }
      if (child.isDirectory()) {
        await visit(childPath, childRelative);
      } else if (child.isFile()) {
        files.push({
          name: childRelative,
          data: await readFile(childPath),
        });
      }
    }
  }

  await visit(rootDirectory, "");
  return createZip(files);
}

export function chooseEffectiveUrl(descriptor, manifestUrl) {
  if (typeof manifestUrl !== "string" || manifestUrl.length === 0) {
    return descriptor.url;
  }
  return new URL(descriptor.url, manifestUrl).toString();
}

export function compareSemver(left, right) {
  const parse = (value) => {
    const withoutBuild = value.split("+")[0] ?? value;
    const separator = withoutBuild.indexOf("-");
    const coreValue =
      separator === -1 ? withoutBuild : withoutBuild.slice(0, separator);
    const prerelease =
      separator === -1 ? [] : withoutBuild.slice(separator + 1).split(".");
    return {
      core: coreValue.split(".").map((part) => Number(part)),
      prerelease,
    };
  };
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  if (a.prerelease.length === 0 && b.prerelease.length === 0) {
    return 0;
  }
  if (a.prerelease.length === 0) {
    return 1;
  }
  if (b.prerelease.length === 0) {
    return -1;
  }
  const length = Math.max(a.prerelease.length, b.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = a.prerelease[index];
    const rightPart = b.prerelease[index];
    if (leftPart === undefined) {
      return -1;
    }
    if (rightPart === undefined) {
      return 1;
    }
    if (leftPart === rightPart) {
      continue;
    }
    const leftNumeric = /^\d+$/.test(leftPart);
    const rightNumeric = /^\d+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) - Number(rightPart);
    }
    if (leftNumeric) {
      return -1;
    }
    if (rightNumeric) {
      return 1;
    }
    return compareText(leftPart, rightPart);
  }
  return 0;
}

export function selectLatestBundles(bundles) {
  const selected = new Map();
  for (const bundle of bundles) {
    const current = selected.get(bundle.gameId);
    if (current === undefined || compareSemver(bundle.version, current.version) > 0) {
      selected.set(bundle.gameId, bundle);
    }
  }
  return [...selected.values()].sort((left, right) =>
    compareText(left.gameId, right.gameId),
  );
}

export async function loadSigningKey({
  keyPath,
  keyId = "dev-1",
  generateIfMissing = false,
}) {
  try {
    const pem = await readFile(keyPath, "utf8");
    return {
      privateKeyPem: pem,
      keyId,
      publicKey: publicKeyBase64FromPrivate(pem),
      generated: false,
    };
  } catch (cause) {
    if (!generateIfMissing || cause.code !== "ENOENT") {
      throw cause;
    }
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const publicKeyBase64 = rawPublicKey(publicKey).toString("base64");
  await mkdir(path.dirname(keyPath), { recursive: true });
  await writeFile(keyPath, pem, { mode: 0o600 });
  await chmod(keyPath, 0o600);
  await writeFile(
    `${keyPath}.pub.json`,
    `${JSON.stringify(
      {
        algorithm: "ed25519",
        keyId,
        publicKey: publicKeyBase64,
      },
      null,
      2,
    )}\n`,
    { mode: 0o644 },
  );

  return {
    privateKeyPem: pem,
    keyId,
    publicKey: publicKeyBase64,
    generated: true,
  };
}

export function createBundleDescriptor({
  manifest,
  sha256,
  size,
  url,
  keyId,
  publishedAt = new Date().toISOString(),
  minHostProtocol = 1,
}) {
  return {
    format: BUNDLE_FORMAT,
    gameId: manifest.id,
    gameName: manifest.name,
    version: manifest.version,
    sdkVersion: manifest.sdkVersion,
    minHostProtocol,
    entry: manifest.entry,
    capabilities: [...manifest.capabilities],
    publishedAt,
    sha256,
    size,
    url,
    keyId,
  };
}

export function releaseManifest({ bundles, signers, generatedAt = new Date().toISOString() }) {
  return {
    format: RELEASE_MANIFEST_FORMAT,
    generatedAt,
    signers,
    bundles,
  };
}
