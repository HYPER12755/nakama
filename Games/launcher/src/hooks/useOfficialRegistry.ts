import { useEffect, useState } from "react";
import type { GamesCatalog } from "@moongames/game-sdk";
import {
  configuredTrustedKeys,
  defaultReleaseManifestUrl,
  fetchOfficialRegistry,
  type OfficialRegistry,
} from "../lib/official";

export const releaseManifestUrl =
  (import.meta.env.VITE_RELEASE_MANIFEST_URL as string | undefined) ??
  defaultReleaseManifestUrl(document.baseURI);

const emptyRegistry: OfficialRegistry = {
  manifestUrl: releaseManifestUrl,
  games: new Map(),
  errors: new Map(),
  error: null,
};

export interface OfficialRegistryState {
  registry: OfficialRegistry;
  loading: boolean;
}

export function useOfficialRegistry(
  catalog: GamesCatalog | null,
): OfficialRegistryState {
  const [registry, setRegistry] = useState<OfficialRegistry>(emptyRegistry);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (catalog === null) {
      setRegistry(emptyRegistry);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetchOfficialRegistry(catalog, releaseManifestUrl, {
      trustedKeys: configuredTrustedKeys(),
    })
      .then((result) => {
        if (active) {
          setRegistry(result);
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [catalog]);

  return { registry, loading };
}
