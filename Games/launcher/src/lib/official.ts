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
 * The public keys the menu trusts.
 *
 * The keys are pinned when the menu is built: an operator who publishes
 * games gives their own key with `VITE_MOONGAMES_TRUSTED_KEYS`, and the
 * stack that packages the games on a machine reads the keys of the signed
 * manifest of that machine. Nothing is written into the source, so the menu
 * trusts the games that were packaged beside it, on any machine.
 */
export function configuredTrustedKeys(): TrustedBundleKeys {
  return parseTrustedKeys(
    import.meta.env.VITE_MOONGAMES_TRUSTED_KEYS as string | undefined,
  );
}

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
