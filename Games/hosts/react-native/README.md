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
  sound, URL, share, analytics, and session-refresh messages from `shared/sdk/`
- re-exports the shared games-catalog client and types for custom native game
  panels
- provides `MoonGamesLauncher`, a native catalog screen that verifies releases,
  renders its own SVG-illustrated menu, and opens signed bundles without loading
  the web launcher

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

pnpm add react-native-webview react-native-fs react-native-svg react-native-zip-archive
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
  // Set these only after this app verified the signed release.
  accountMode="shared"
  official
  release={{
    version: "0.6.0",
    sha256: "281b794297e43c10f1d45658f1eb776f8e34801a7e7f714d3a31aea8f6da4724",
    keyId: "dev-1",
  }}
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

## Native launcher shell

`MoonGamesLauncher` is a ready-made native catalog/menu. It reads `games.json`
itself, verifies each available game against the signed release manifest, and
then renders the existing `MoonGamesWebView` for the selected title. It never
loads the web launcher, so a native app's home screen is independent of the
MoonGames web UI.

```tsx
import { MoonGamesLauncher } from "@moongames/react-native-host/launcher";
import type { GameSession, NakamaConnection } from "@moongames/game-sdk";

<MoonGamesLauncher
  catalogUrl="https://cdn.example.com/moongames/games.json"
  manifestUrl="https://cdn.example.com/moongames/release-manifest.json"
  trustedKeys={trustedKeys}
  bundledFallbacks={{
    chess: {
      zipPath: bundledChessZipPath,
      descriptor: bundledChessDescriptor,
    },
  }}
  session={session}
  nakama={nakama}
  theme={{ mode: "dark" }}
  accountLabel={session?.username}
  onOpenAccount={openAccount}
  onRequestSignIn={openAccount}
  launchRequest={
    deepLink === null
      ? null
      : {
          gameId: deepLink.gameId,
          query: deepLink.query,
          requestId: deepLink.id,
        }
  }
  onLaunchRequestHandled={clearDeepLink}
  onGameClosed={() => navigation.goBack()}
  onRequestSessionRefresh={refreshNakamaSession}
/>;
```

The menu shows a verified badge only for a catalog entry whose version, size,
SHA-256, key id, and Ed25519 descriptor signature match the pinned release. It
passes `accountMode: "shared"`, `official: true`, the release identity, the
Nakama session, and the server configuration for verified games. Unverified
games open with `accountMode: "per-game"` and never receive the launcher session.
If a verified game is tapped without a session and Nakama connection, the menu
calls `onRequestSignIn` instead of opening it.

The host app still owns sign-in and social UI. `MoonGamesLauncher` accepts the
same session your app already uses and does not implement a second account
system. `launchRequest` handles deep links. `showGameChrome={false}` gives the
game the full screen; Android hardware back still returns to the library, and
games can send the shared `exit` bridge message. Keep the app's own iOS back
affordance when chrome is hidden.

The launcher shell uses `react-native-svg` for its controls and artwork. It does
not depend on remote cover images; a game's stable catalog `icon` key is mapped
to a local vector icon.

## Custom games list

If the built-in shell is not the right fit, build your own cards from the
catalog and pass the selected game to `MoonGamesWebView`:

```tsx
import { fetchGamesCatalog } from "@moongames/react-native-host";

const catalog = await fetchGamesCatalog(
  "https://cdn.example.com/moongames/games.json",
);
const available = catalog.games.filter((game) => game.status === "available");
```

For verified launches, use `buildLauncherHostConfig` and
`fetchVerifiedCatalog` from `@moongames/react-native-host/launcher`, then pass
the resulting `hostConfig` to `MoonGamesWebView`. This keeps the shared-account
gate identical to the ready-made shell. See
[the catalog guide](../../catalog/README.md).

## Status

The package typechecks against local shims for the native modules. It has not
been built or run on Android/iOS in this Termux environment, which has no React
Native Android toolchain. Validate it on a React Native-capable machine,
including native module linking, file permissions, WebView file access, and a
real release-manifest download.
