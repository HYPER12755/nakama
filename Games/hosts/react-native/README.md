# React Native host

`@moongames/react-native-host` is the generic React Native host for signed
MoonGames web bundles. It contains no game rules; the app supplies the game id,
release manifest URL, pinned signing keys, and optional bundled fallback.

See the full [React Native integration guide](INTEGRATION.md) and the shared
[host setup guide](../HOST_SETUP.md).

## What it does

- fetches the release manifest and selects the newest compatible bundle
- rejects downgrades below the currently installed version
- checks the descriptor key id/public key against app-pinned keys
- downloads the ZIP, verifies its size and SHA-256, and verifies the Ed25519
  descriptor signature through `@moongames/host-core`
- extracts with `react-native-zip-archive` and installs atomically
- caches the verified bundle and re-verifies its descriptor on startup
- falls back to a previously installed bundle, then to an app-bundled ZIP
- hosts the game in `react-native-webview`
- implements the init, launch query, theme, session, lifecycle, toast, haptic,
  sound, URL, analytics, and session-refresh messages from `shared/sdk/`
- re-exports the shared games-catalog client and types for custom native game
  panels

The current Chess bundle is one self-contained `index.html` with inline
JavaScript and CSS, so loading from a file path does not depend on `file://`
ES-module or relative-asset behavior. WebView file access is still enabled for
the game and for future multi-file bundles.

The private signing key must never be shipped. Only public keys are pinned in
the app.

## Install

The native modules are peer dependencies because they require platform
linking. In the host app:

```bash
# From a package inside this pnpm workspace:
pnpm add @moongames/react-native-host@workspace:*

# From an external app, use the checkout path instead:
pnpm add /path/to/Games/hosts/react-native

pnpm add react-native-webview react-native-fs react-native-zip-archive
```

Run the usual React Native autolinking step after adding the native modules.

## Usage

Copy the ZIP and descriptor produced by `pnpm package:chess` into an app asset
location, then expose the ZIP's absolute filesystem path as
`bundledFallback.zipPath`. The descriptor object is the JSON file parsed by
the app.

```tsx
import { MoonGamesWebView } from "@moongames/react-native-host";

const trustedKeys = {
  "release-1": "<base64 raw Ed25519 public key>",
};

<MoonGamesWebView
  gameId="chess"
  manifestUrl="https://cdn.example.com/moongames/release-manifest.json"
  trustedKeys={trustedKeys}
  bundledFallback={{ zipPath: bundledChessZipPath, descriptor: bundledChessDescriptor }}
  // Optional: forward match=...&spectate=1 from a native deep link.
  launchQuery={deepLinkSearch.replace(/^\?/, "")}
  theme={{ mode: "dark" }}
  session={session}
  nakama={{
    host: "nakama.example.com",
    port: "443",
    serverKey: "defaultkey",
    useSSL: true,
  }}
  onToast={(message, level) => showToast(message, level)}
  onExit={() => navigation.goBack()}
  onRequestSessionRefresh={refreshNakamaSession}
/>
```

`bundledFallback` is optional but required for store compliance and offline
first launch. Never load an unsigned fallback. Provide both `session` and
`nakama` for online play; otherwise the web bundle falls back to automatic
device authentication and its local server default.

## Custom games list

```tsx
import { fetchGamesCatalog } from "@moongames/react-native-host";

const catalog = await fetchGamesCatalog(
  "https://cdn.example.com/moongames/games.json",
);
const available = catalog.games.filter((game) => game.status === "available");
```

Use `GameCatalogEntry` fields in your own cards and pass the selected `id` to
`MoonGamesWebView`. Keep using the signed fallback assets and release manifest
for the actual bundle. See [the catalog guide](../../catalog/README.md).

## Status

The package typechecks against local shims for the native modules. It has not
been built or run on Android/iOS in this Termux environment, which has no React
Native Android toolchain. Validate it on a React Native-capable machine,
including native module linking, file permissions, WebView file access, and a
real release-manifest download.
