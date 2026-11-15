import { hashes, verify } from "@noble/ed25519";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import {
  GAME_PROTOCOL_VERSION,
  assertBundleDescriptor,
  bundleSigningPayload,
  checkPinnedSigner,
  parseReleaseManifest,
  selectLatestBundle,
  type GameBundleDescriptor,
  type GameCatalogEntry,
  type GameHostConfig,
  type GameLaunchContext,
  type GameSession,
  type GameTheme,
  type GamesCatalog,
  type NakamaConnection,
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

// The async Ed25519 verifier depends on WebCrypto, which is unavailable on
// plain-HTTP LAN origins. Pure-JS SHA-512 keeps signature verification working
// when the launcher is opened from another device on local WiFi.
hashes.sha512 = sha512;

export const nobleCryptoAdapter: HostCryptoAdapter = {
  sha256: (data) => sha256(data),
  verifyEd25519: (signature, message, publicKey) =>
    verify(signature, message, publicKey, { zip215: false }),
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

export interface VerifiedCatalogRelease {
  gameId: string;
  version: string;
  descriptor: GameBundleDescriptor;
  verifiedAt: number;
}

export interface VerifiedCatalogRegistry {
  manifestUrl: string;
  games: Map<string, VerifiedCatalogRelease>;
  errors: Map<string, string>;
  error: string | null;
}

export type CatalogBundleVerifier = (
  descriptor: GameBundleDescriptor,
  trustedKeys?: TrustedBundleKeys,
) => Promise<BundleVerification>;

/**
 * Verifies the catalog's signed-release fields against a pinned descriptor.
 * This is the gate for the shared launcher identity on every platform.
 */
export async function verifyCatalogRelease(
  entry: GameCatalogEntry,
  manifest: ReleaseManifest,
  trustedKeys: TrustedBundleKeys,
  verifier: CatalogBundleVerifier = verifyBundleSignature,
): Promise<VerifiedCatalogRelease> {
  if (entry.status !== "available") {
    throw new Error("The game is not available.");
  }
  if (entry.release === undefined) {
    throw new Error("The catalog has no signed release for this game.");
  }
  if (entry.version !== undefined && entry.version !== entry.release.version) {
    throw new Error("The catalog version does not match its signed release.");
  }
  if (entry.release.minHostProtocol > GAME_PROTOCOL_VERSION) {
    throw new Error("This release needs a newer MoonGames host.");
  }
  const descriptor = manifest.bundles.find(
    (bundle) =>
      bundle.gameId === entry.id && bundle.version === entry.release?.version,
  );
  if (descriptor === undefined) {
    throw new Error(
      `Release ${entry.release.version} is missing from the signed manifest.`,
    );
  }
  if (
    descriptor.sha256 !== entry.release.sha256 ||
    descriptor.size !== entry.release.size ||
    descriptor.keyId !== entry.release.keyId ||
    descriptor.minHostProtocol !== entry.release.minHostProtocol
  ) {
    throw new Error("The catalog release does not match the signed descriptor.");
  }
  if (descriptor.minHostProtocol > GAME_PROTOCOL_VERSION) {
    throw new Error("This release needs a newer MoonGames host.");
  }
  const pinProblem = checkPinnedSigner(manifest, descriptor, trustedKeys);
  if (pinProblem !== null) {
    throw new Error(pinProblem);
  }
  const verification = await verifier(descriptor, trustedKeys);
  if (!verification.ok) {
    throw new Error(verification.error ?? "The release signature is invalid.");
  }
  return {
    gameId: entry.id,
    version: descriptor.version,
    descriptor,
    verifiedAt: Date.now(),
  };
}

export interface FetchVerifiedCatalogOptions {
  fetchImpl?: typeof fetch;
  trustedKeys: TrustedBundleKeys;
  verifier?: CatalogBundleVerifier;
  timeoutMs?: number;
}

/**
 * Loads the signed manifest and verifies every available catalog game. One bad
 * release is isolated in `errors` so the menu can still open the others.
 */
export async function fetchVerifiedCatalog(
  catalog: GamesCatalog,
  manifestUrl: string,
  options: FetchVerifiedCatalogOptions,
): Promise<VerifiedCatalogRegistry> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const games = new Map<string, VerifiedCatalogRelease>();
  const errors = new Map<string, string>();
  if (fetchImpl === undefined) {
    return {
      manifestUrl,
      games,
      errors,
      error: "No fetch implementation is available.",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 12_000,
  );
  try {
    const response = await fetchImpl(manifestUrl, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Release manifest request failed with HTTP ${response.status}.`,
      );
    }
    const manifest = parseReleaseManifest(await response.json());
    const verifier = options.verifier ?? verifyBundleSignature;
    await Promise.all(
      catalog.games
        .filter((entry) => entry.status === "available")
        .map(async (entry) => {
          try {
            const record = await verifyCatalogRelease(
              entry,
              manifest,
              options.trustedKeys,
              verifier,
            );
            games.set(entry.id, record);
          } catch (cause) {
            errors.set(
              entry.id,
              cause instanceof Error
                ? cause.message
                : "The release could not be verified.",
            );
          }
        }),
    );
    return { manifestUrl, games, errors, error: null };
  } catch (cause) {
    return {
      manifestUrl,
      games,
      errors,
      error:
        cause instanceof Error
          ? cause.message
          : "The signed release manifest could not be loaded.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

export interface LauncherHostConfigInput {
  entry: GameCatalogEntry;
  /** Present only when the operator verified this release prospectively. */
  release?: VerifiedCatalogRelease | null;
  session?: GameSession;
  nakama?: NakamaConnection;
  theme: GameTheme;
  locale: string;
  launch?: GameLaunchContext;
}

/**
 * The address of the game server for a shell.
 *
 * A shell that serves the menu from an address reaches the server through
 * that same address, so one name is enough for a tunnel, a proxy or a CDN.
 * A shell that runs the server somewhere else says so with the host, the
 * port and whether the connection is secure.
 */
export function gameServerAddressFor(
  origin: { host: string; port?: string | number; secure?: boolean },
  override?: { host?: string; port?: string | number; secure?: boolean },
): NakamaConnection {
  const host = override?.host ?? origin.host;
  const secure = override?.secure ?? origin.secure ?? false;
  const rawPort = override?.port ?? origin.port ?? (secure ? 443 : 80);
  const port = Number(rawPort);
  const resolvedPort =
    Number.isFinite(port) && port > 0 ? String(port) : secure ? "443" : "80";
  return {
    host,
    port: resolvedPort,
    useSSL: secure,
    serverKey: "defaultkey",
  };
}

/**
 * Creates the single native launch config used by menu shells. Verified games
 * always receive the launcher session and are marked official; unverified games
 * never receive that session and keep their own account flow.
 */
export function buildLauncherHostConfig(
  input: LauncherHostConfigInput,
): GameHostConfig {
  const base: GameHostConfig = {
    protocol: GAME_PROTOCOL_VERSION,
    gameId: input.entry.id,
    locale: input.locale,
    theme: input.theme,
    ...(input.launch === undefined ? {} : { launch: input.launch }),
  };

  if (input.release === undefined || input.release === null) {
    return { ...base, accountMode: "per-game" };
  }
  if (input.release.gameId !== input.entry.id) {
    throw new Error("The verified release belongs to a different game.");
  }
  if (input.session === undefined || input.nakama === undefined) {
    throw new Error(
      "Verified games require a launcher session and Nakama connection.",
    );
  }
  return {
    ...base,
    session: input.session,
    nakama: input.nakama,
    accountMode: "shared",
    official: true,
    release: {
      version: input.release.version,
      sha256: input.release.descriptor.sha256,
      keyId: input.release.descriptor.keyId,
    },
  };
}
