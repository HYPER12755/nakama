import {
  type GameCatalogEntry,
  type GamesCatalog,
  type ReleaseManifest,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";
import {
  fetchVerifiedCatalog,
  verifyBundleSignature,
  verifyCatalogRelease,
  type CatalogBundleVerifier,
  type VerifiedCatalogRegistry,
  type VerifiedCatalogRelease,
} from "@moongames/host-core";

/**
 * Local development uses the checked-in dev signer. Production operators must
 * provide `VITE_MOONGAMES_TRUSTED_KEYS` with their own pinned public key(s).
 */
const DEV_TRUSTED_KEYS: TrustedBundleKeys = {
  "dev-1": "yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=",
};

export type OfficialGameRecord = VerifiedCatalogRelease;
export type OfficialRegistry = VerifiedCatalogRegistry;
export type BundleVerifier = CatalogBundleVerifier;

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
  if (entry.webPath === undefined) {
    throw new Error("The game has no web bundle location.");
  }
  return verifyCatalogRelease(entry, manifest, trustedKeys, verifier);
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
  return fetchVerifiedCatalog(catalog, manifestUrl, {
    ...options,
    trustedKeys: options.trustedKeys ?? configuredTrustedKeys(),
  });
}
