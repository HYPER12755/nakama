import { verifyAsync } from "@noble/ed25519";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  assertBundleDescriptor,
  bundleSigningPayload,
  checkPinnedSigner,
  parseReleaseManifest,
  selectLatestBundle,
  type GameBundleDescriptor,
  type ReleaseManifest,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";

export interface HostCryptoAdapter {
  sha256(data: Uint8Array): Uint8Array | Promise<Uint8Array>;
  verifyEd25519(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array,
  ): boolean | Promise<boolean>;
}

export interface BundleVerification {
  ok: boolean;
  error?: string;
}

export const nobleCryptoAdapter: HostCryptoAdapter = {
  sha256: (data) => sha256(data),
  verifyEd25519: (signature, message, publicKey) =>
    verifyAsync(signature, message, publicKey, { zip215: false }),
};

export function base64ToBytes(value: string): Uint8Array {
  const normalized = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
    throw new Error("Invalid base64 data.");
  }
  if (normalized.length % 4 === 1) {
    throw new Error("Invalid base64 length.");
  }
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const output: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const character of normalized) {
    if (character === "=") {
      break;
    }
    const index = alphabet.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid base64 data.");
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output.push((buffer >>> bits) & 0xff);
    }
  }
  return Uint8Array.from(output);
}

function utf8Encode(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  const output: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        index += 1;
      }
    }
    if (code < 0x80) {
      output.push(code);
    } else if (code < 0x800) {
      output.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      output.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    } else {
      output.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(output);
}

export function bytesToHex(bytes: Uint8Array): string {
  let value = "";
  for (const byte of bytes) {
    value += byte.toString(16).padStart(2, "0");
  }
  return value;
}

function signatureMessage(descriptor: GameBundleDescriptor): Uint8Array {
  return utf8Encode(bundleSigningPayload(descriptor));
}

export async function verifyBundleSignature(
  descriptor: GameBundleDescriptor,
  trustedKeys?: TrustedBundleKeys,
  adapter: HostCryptoAdapter = nobleCryptoAdapter,
): Promise<BundleVerification> {
  try {
    assertBundleDescriptor(descriptor);
    const publicKeyBase64 =
      trustedKeys === undefined
        ? descriptor.publicKey
        : trustedKeys[descriptor.keyId];
    if (publicKeyBase64 === undefined) {
      return {
        ok: false,
        error: `No trusted public key is configured for ${descriptor.keyId}.`,
      };
    }
    if (
      trustedKeys !== undefined &&
      publicKeyBase64 !== descriptor.publicKey
    ) {
      return {
        ok: false,
        error: `The descriptor public key does not match the pinned key ${descriptor.keyId}.`,
      };
    }

    const publicKey = base64ToBytes(publicKeyBase64);
    const signature = base64ToBytes(descriptor.signature);
    if (publicKey.length !== 32) {
      return { ok: false, error: "The Ed25519 public key must be 32 bytes." };
    }
    if (signature.length !== 64) {
      return { ok: false, error: "The Ed25519 signature must be 64 bytes." };
    }

    const valid = await adapter.verifyEd25519(
      signature,
      signatureMessage(descriptor),
      publicKey,
    );
    return valid
      ? { ok: true }
      : { ok: false, error: "The bundle signature is invalid." };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : "Could not verify the bundle.",
    };
  }
}

export async function verifyBundleBytes(
  descriptor: GameBundleDescriptor,
  bytes: Uint8Array,
  trustedKeys?: TrustedBundleKeys,
  adapter: HostCryptoAdapter = nobleCryptoAdapter,
): Promise<BundleVerification> {
  if (bytes.byteLength !== descriptor.size) {
    return { ok: false, error: "The bundle size does not match the descriptor." };
  }
  const digest = bytesToHex(await adapter.sha256(bytes));
  if (digest !== descriptor.sha256) {
    return { ok: false, error: "The bundle SHA-256 does not match the descriptor." };
  }
  return verifyBundleSignature(descriptor, trustedKeys, adapter);
}

export interface BundleSelection {
  manifest: ReleaseManifest;
  descriptor: GameBundleDescriptor;
}

export class BundleSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleSelectionError";
  }
}

export function selectBundleForHost(
  manifestValue: unknown,
  gameId: string,
  hostProtocol: number,
  trustedKeys?: TrustedBundleKeys,
): BundleSelection {
  const manifest = parseReleaseManifest(manifestValue);
  const descriptor = selectLatestBundle(manifest, gameId, hostProtocol);
  if (descriptor === null) {
    throw new BundleSelectionError(
      `No compatible ${gameId} bundle is available for host protocol ${hostProtocol}.`,
    );
  }
  if (trustedKeys !== undefined) {
    const problem = checkPinnedSigner(manifest, descriptor, trustedKeys);
    if (problem !== null) {
      throw new BundleSelectionError(problem);
    }
  }
  return { manifest, descriptor };
}
