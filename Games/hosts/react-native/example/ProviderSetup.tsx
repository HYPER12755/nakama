import React from "react";
import {
  DEFAULT_UPDATE_POLICY,
  MoonGamesWebView,
} from "@moongames/react-native-host";

const TRUSTED_KEYS = {
  "prod-1": "REPLACE_WITH_PINNED_ED25519_PUBLIC_KEY",
};

export function PartnerUnoScreen() {
  return (
    <MoonGamesWebView
      gameId="uno"
      manifestUrl="https://cdn.example.com/moongames/release-manifest.json"
      trustedKeys={TRUSTED_KEYS}
      hostProtocol={2}
      updatePolicy={{
        ...DEFAULT_UPDATE_POLICY,
        mode: "background",
        checkIntervalMs: 6 * 60 * 60 * 1000,
        keepVersions: 2,
      }}
      onUpdateAvailable={(descriptor) => {
        console.log(`MoonGames update available: ${descriptor.version}`);
      }}
      onError={(error) => {
        console.error(error);
      }}
    />
  );
}
