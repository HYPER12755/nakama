import {
  GAME_PROTOCOL_VERSION,
  checkPinnedSigner,
  parseReleaseManifest,
  type GameBundleDescriptor,
  type GameCatalogEntry,
  type GamesCatalog,
  type ReleaseManifest,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";
import {
  verifyBundleSignature,
  type BundleVerification,
} from "@moongames/host-core";

/**
 * Local development uses the checked-in dev signer. Production operators must
 * provide `VITE_MOONGAMES_TRUSTED_KEYS` with their own pinned public key(s).
 */
const DEV_TRUSTED_KEYS: TrustedBundleKeys = {
  "dev-1": "yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=",
};

export interface OfficialGameRecord {
  gameId: string;
  version: string;
  descriptor: GameBundleDescriptor;
  verifiedAt: number;
}

export interface OfficialRegistry {
  manifestUrl: string;
  games: Map<string, OfficialGameRecord>;
  errors: Map<string, string>;
  error: string | null;
}

export type BundleVerifier = (
  descriptor: GameBundleDescriptor,
  trustedKeys?: TrustedBundleKeys,
) => Promise<BundleVerification>;

export function parseTrustedKeys(value: string | undefined): TrustedBundleKeys {
  if (value === undefined || value.trim().length === 0) {
    return {};
  }
  const keys: TrustedBundleKeys = {};
  for (const part of value.split(/[,\s]+/)) {
    const separator = part.indexOf("=");
    if (separator <= 0 || separator === part.length - 1) {
      continue;
    }
    const keyId = part.slice(0, separator).trim();
    const publicKey = part.slice(separator + 1).trim();
    if (keyId.length > 0 && publicKey.length > 0) {
      keys[keyId] = publicKey;
    }
  }
  return keys;
}

export function configuredTrustedKeys(): TrustedBundleKeys {
  const configured = parseTrustedKeys(
    import.meta.env.VITE_MOONGAMES_TRUSTED_KEYS as string | undefined,
  );
  return Object.keys(configured).length > 0 ? configured : DEV_TRUSTED_KEYS;
}

export function defaultReleaseManifestUrl(baseUri: string): string {
  return new URL("release-manifest.json", baseUri).toString();
}

export async function verifyOfficialGame(
  entry: GameCatalogEntry,
  manifest: ReleaseManifest,
  trustedKeys: TrustedBundleKeys,
  verifier: BundleVerifier = verifyBundleSignature,
): Promise<OfficialGameRecord> {
  if (entry.status !== "available") {
    throw new Error("The game is not available.");
  }
  if (entry.release === undefined) {
    throw new Error("The catalog has no signed release for this game.");
  }
  if (entry.version !== undefined && entry.version !== entry.release.version) {
    throw new Error("The catalog version does not match its signed release.");
  }
  if (entry.webPath === undefined) {
    throw new Error("The game has no web bundle location.");
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
    descriptor.keyId !== entry.release.keyId
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

export interface FetchOfficialRegistryOptions {
  fetchImpl?: typeof fetch;
  trustedKeys?: TrustedBundleKeys;
  verifier?: BundleVerifier;
  timeoutMs?: number;
}

export async function fetchOfficialRegistry(
  catalog: GamesCatalog,
  manifestUrl: string,
  options: FetchOfficialRegistryOptions = {},
): Promise<OfficialRegistry> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const games = new Map<string, OfficialGameRecord>();
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
      throw new Error(`Release manifest request failed with HTTP ${response.status}.`);
    }
    const manifest = parseReleaseManifest(await response.json());
    const trustedKeys = options.trustedKeys ?? configuredTrustedKeys();
    const verifier = options.verifier ?? verifyBundleSignature;
    await Promise.all(
      catalog.games
        .filter((entry) => entry.status === "available")
        .map(async (entry) => {
          try {
            const record = await verifyOfficialGame(
              entry,
              manifest,
              trustedKeys,
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
