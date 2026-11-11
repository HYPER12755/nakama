export const GAME_BUNDLE_FORMAT = 1;
export const RELEASE_MANIFEST_FORMAT = 1;
export const BUNDLE_SIGNING_PREFIX = "moongames-bundle-v1";

export interface GameBundleDescriptor {
  format: typeof GAME_BUNDLE_FORMAT;
  gameId: string;
  gameName: string;
  version: string;
  sdkVersion: string;
  minHostProtocol: number;
  entry: string;
  capabilities: string[];
  publishedAt: string;
  sha256: string;
  size: number;
  /** Relative to the release-manifest URL, or absolute. Not part of the signature. */
  url: string;
  keyId: string;
  /** Raw 32-byte Ed25519 public key, base64 encoded. */
  publicKey: string;
  /** Raw 64-byte Ed25519 signature over `bundleSigningPayload`, base64 encoded. */
  signature: string;
}

export interface BundleSigner {
  algorithm: "ed25519";
  publicKey: string;
}

export interface ReleaseManifest {
  format: typeof RELEASE_MANIFEST_FORMAT;
  generatedAt: string;
  signers: Record<string, BundleSigner>;
  bundles: GameBundleDescriptor[];
}

export type TrustedBundleKeys = Record<string, string>;

const HEX_SHA256 = /^[a-f0-9]{64}$/;
const GAME_ID = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function requireString(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.includes("\n") ||
    value.includes("\r")
  ) {
    throw new Error(`${field} must be a non-empty single-line string.`);
  }
  return value;
}

function requireEntry(value: unknown): string {
  const entry = requireString(value, "entry");
  if (
    entry.startsWith("/") ||
    entry.includes("\\") ||
    entry.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new Error("entry must be a safe relative path.");
  }
  return entry;
}

export function assertBundleDescriptor(
  value: unknown,
): asserts value is GameBundleDescriptor {
  if (typeof value !== "object" || value === null) {
    throw new Error("The bundle descriptor must be an object.");
  }
  const descriptor = value as Partial<GameBundleDescriptor>;
  if (descriptor.format !== GAME_BUNDLE_FORMAT) {
    throw new Error("Unsupported game bundle format.");
  }
  if (
    typeof descriptor.gameId !== "string" ||
    !GAME_ID.test(descriptor.gameId)
  ) {
    throw new Error("gameId must use lowercase letters, digits, and dashes.");
  }
  requireString(descriptor.gameName, "gameName");
  if (
    typeof descriptor.version !== "string" ||
    !SEMVER.test(descriptor.version)
  ) {
    throw new Error("version must be a semver string.");
  }
  requireString(descriptor.sdkVersion, "sdkVersion");
  if (
    !Number.isInteger(descriptor.minHostProtocol) ||
    (descriptor.minHostProtocol ?? 0) < 1
  ) {
    throw new Error("minHostProtocol must be a positive integer.");
  }
  requireEntry(descriptor.entry);
  if (!Array.isArray(descriptor.capabilities)) {
    throw new Error("capabilities must be an array.");
  }
  for (const capability of descriptor.capabilities) {
    requireString(capability, "capabilities[]");
  }
  requireString(descriptor.publishedAt, "publishedAt");
  if (
    typeof descriptor.sha256 !== "string" ||
    !HEX_SHA256.test(descriptor.sha256)
  ) {
    throw new Error("sha256 must be 64 lowercase hexadecimal characters.");
  }
  if (!Number.isInteger(descriptor.size) || (descriptor.size ?? -1) < 0) {
    throw new Error("size must be a non-negative integer.");
  }
  requireString(descriptor.url, "url");
  requireString(descriptor.keyId, "keyId");
  requireString(descriptor.publicKey, "publicKey");
  requireString(descriptor.signature, "signature");
}

export function bundleSigningPayload(
  descriptor: GameBundleDescriptor,
): string {
  assertBundleDescriptor(descriptor);
  return [
    BUNDLE_SIGNING_PREFIX,
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

export function assertReleaseManifest(
  value: unknown,
): asserts value is ReleaseManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("The release manifest must be an object.");
  }
  const manifest = value as Partial<ReleaseManifest>;
  if (manifest.format !== RELEASE_MANIFEST_FORMAT) {
    throw new Error("Unsupported release manifest format.");
  }
  requireString(manifest.generatedAt, "generatedAt");
  if (typeof manifest.signers !== "object" || manifest.signers === null) {
    throw new Error("signers must be an object.");
  }
  for (const [keyId, signer] of Object.entries(manifest.signers)) {
    requireString(keyId, "signers key");
    if (signer.algorithm !== "ed25519") {
      throw new Error(`Unsupported signing algorithm for ${keyId}.`);
    }
    requireString(signer.publicKey, `signers.${keyId}.publicKey`);
  }
  if (!Array.isArray(manifest.bundles)) {
    throw new Error("bundles must be an array.");
  }
  for (const bundle of manifest.bundles) {
    assertBundleDescriptor(bundle);
  }
}

export function parseReleaseManifest(value: unknown): ReleaseManifest {
  assertReleaseManifest(value);
  return value;
}

export function compareSemver(left: string, right: string): number {
  const parse = (value: string) => {
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
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function selectLatestBundle(
  manifest: ReleaseManifest,
  gameId: string,
  hostProtocol = 1,
): GameBundleDescriptor | null {
  return (
    manifest.bundles
      .filter(
        (bundle) =>
          bundle.gameId === gameId &&
          bundle.minHostProtocol <= hostProtocol,
      )
      .sort((left, right) => compareSemver(right.version, left.version))[0] ??
    null
  );
}

export function resolveBundleUrl(
  descriptor: GameBundleDescriptor,
  manifestUrl: string,
): string {
  return new URL(descriptor.url, manifestUrl).toString();
}

export function checkPinnedSigner(
  manifest: ReleaseManifest,
  descriptor: GameBundleDescriptor,
  trustedKeys: TrustedBundleKeys,
): string | null {
  const trusted = trustedKeys[descriptor.keyId];
  if (trusted === undefined) {
    return `No trusted public key is configured for ${descriptor.keyId}.`;
  }
  if (trusted !== descriptor.publicKey) {
    return `The descriptor public key does not match the pinned key ${descriptor.keyId}.`;
  }
  const signer = manifest.signers[descriptor.keyId];
  if (signer === undefined || signer.publicKey !== trusted) {
    return `The release manifest does not declare the pinned key ${descriptor.keyId}.`;
  }
  return null;
}
