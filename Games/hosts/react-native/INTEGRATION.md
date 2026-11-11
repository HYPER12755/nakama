# React Native integration guide

This guide wires `@moongames/react-native-host` into a React Native app. Start
with the shared [host setup](../HOST_SETUP.md) for release hosting, signing keys,
fallback artifacts, Nakama identity, and the QA matrix.

## What you add to the app

A React Native host app needs:

1. the host package and its native peer dependencies
2. a signed fallback ZIP and descriptor
3. one screen rendering `MoonGamesWebView`
4. the app's Nakama session and server config
5. Android/iOS network and WebView native configuration
6. optionally, the games catalog for a custom game-list screen

No Chess, card-game, Ludo, or Carrom rules belong in the React Native app.

## 1. Put the app in the workspace

The host package currently uses `workspace:*` for its internal packages, so the
simplest setup is to place the RN app in this pnpm workspace, for example at
`Games/apps/rn`.

Add it to `Games/pnpm-workspace.yaml`:

```yaml
packages:
  - "shared/*"
  - "Chess/*"
  - "hosts/*"
  - "apps/rn"
```

From `Games/apps/rn/package.json`:

```json
{
  "dependencies": {
    "@moongames/react-native-host": "workspace:*",
    "@moongames/game-sdk": "workspace:*",
    "react": ">=19",
    "react-native": ">=0.81",
    "react-native-fs": ">=2.20",
    "react-native-webview": ">=13",
    "react-native-zip-archive": ">=7"
  }
}
```

Then:

```bash
cd Games
pnpm install
```

If the app is outside the workspace, publish the host packages privately or
make the host package resolve its workspace dependencies in your app. Do not
copy only `MoonGamesWebView.tsx`; the bundle verifier, signing contract, and
extraction logic live in the package and `@moongames/host-core`.

## 2. Install native modules

The host package's native modules are peer dependencies and require native
linking:

```bash
pnpm add react-native-webview react-native-fs react-native-zip-archive
```

Rebuild the app after installation:

```bash
pnpm react-native run-android
# or
cd ios && pod install && cd ..
pnpm react-native run-ios
```

Fast Refresh alone is not enough after adding these native modules.

## 3. Add the fallback bundle

### Android

Place the signed ZIP at:

```text
android/app/src/main/assets/moongames/chess-0.3.0.zip
```

The path passed to `RNFS.readFileAssets` is relative to `assets/`:

```text
moongames/chess-0.3.0.zip
```

### iOS

Add `chess-0.3.0.zip` to the Xcode target's **Copy Bundle Resources**. The
file will then be available under `RNFS.MainBundlePath`.

### Descriptor

Put the descriptor JSON in the JS project:

```text
src/assets/moongames/chess-0.3.0.bundle.json
```

When Metro/TypeScript supports JSON imports, import it directly. Otherwise use
`require` with the appropriate type assertion.

## 4. Prepare the bundled fallback

`MoonGamesWebView` expects a `BundledFallback` with an absolute ZIP path and a
validated descriptor object.

```tsx
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import type { BundledFallback } from "@moongames/react-native-host";
import descriptor from "../assets/moongames/chess-0.3.0.bundle.json";

export async function prepareBundledFallback(): Promise<BundledFallback> {
  const directory = `${RNFS.DocumentDirectoryPath}/moongames-bundled`;
  const zipPath = `${directory}/chess-0.3.0.zip`;

  if (!(await RNFS.exists(directory))) {
    await RNFS.mkdir(directory);
  }

  if (!(await RNFS.exists(zipPath))) {
    if (Platform.OS === "android") {
      const base64 = await RNFS.readFileAssets(
        "moongames/chess-0.3.0.zip",
        "base64",
      );
      await RNFS.writeFile(zipPath, base64, "base64");
    } else {
      await RNFS.copyFile(
        `${RNFS.MainBundlePath}/chess-0.3.0.zip`,
        zipPath,
      );
    }
  }

  return {
    zipPath,
    descriptor: descriptor as BundledFallback["descriptor"],
  };
}
```

The host verifies the descriptor, ZIP size, SHA-256, and Ed25519 signature
before extraction. Never skip that path by loading the asset directly in a
plain WebView.

## 5. Add the Chess screen

```tsx
import React, { useEffect, useState } from "react";
import {
  SafeAreaView,
  Text,
  View,
} from "react-native";
import {
  MoonGamesWebView,
  type BundledFallback,
} from "@moongames/react-native-host";
import type {
  GameSession,
  GameTheme,
  NakamaConnection,
} from "@moongames/game-sdk";
import { prepareBundledFallback } from "./prepareBundledFallback";

const THEME: GameTheme = { mode: "dark" };

const NAKAMA: NakamaConnection = {
  host: "nakama.example.com",
  port: "443",
  serverKey: "your-production-server-key",
  useSSL: true,
};

type Props = {
  session?: GameSession;
  onRefreshSession: () => Promise<GameSession>;
  onExit: () => void;
};

export function ChessScreen({
  session,
  onRefreshSession,
  onExit,
}: Props) {
  const [fallback, setFallback] = useState<BundledFallback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentSession, setCurrentSession] = useState(session);

  useEffect(() => {
    prepareBundledFallback()
      .then(setFallback)
      .catch((cause) => setError(String(cause)));
  }, []);

  if (error !== null) {
    return (
      <View>
        <Text>{error}</Text>
      </View>
    );
  }

  if (fallback === null) {
    return (
      <View>
        <Text>Preparing Chess…</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <MoonGamesWebView
        gameId="chess"

        // Replace with your production manifest.
        manifestUrl="https://games.example.com/moongames/release-manifest.json"

        hostProtocol={1}

        // Development key from the current repository release.
        // Replace with your production public key before shipping.
        trustedKeys={{
          "dev-1": "yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=",
        }}

        bundledFallback={fallback}
        locale="en"
        theme={THEME}
        session={currentSession}
        nakama={NAKAMA}

        onReady={(bundle) => {
          console.log(
            "MoonGames ready:",
            bundle.descriptor.gameId,
            bundle.descriptor.version,
            bundle.source,
          );
        }}

        onExit={onExit}

        onToast={(message, level) => {
          console.log("MoonGames toast:", level, message);
          // Show the app's toast here.
        }}

        onSound={(name) => {
          // Route to the app audio service.
        }}

        onAnalytics={(event, properties) => {
          console.log("MoonGames analytics:", event, properties);
        }}

        onOpenUrl={(url) => {
          // The host already opens the URL through Linking.openURL.
          console.log("MoonGames opened URL:", url);
        }}

        onRequestSessionRefresh={async () => {
          const refreshed = await onRefreshSession();
          setCurrentSession(refreshed);
        }}

        onError={(cause) => setError(cause.message)}

        style={{ flex: 1 }}
      />
    </SafeAreaView>
  );
}
```

Pass the same Nakama session and server config as the rest of the app. If both
are omitted, the game can create its own device-auth account instead of using
the app's profile. See [Nakama identity](../HOST_SETUP.md#4-use-the-same-nakama-account).

### Native match links

If your app receives a deep link such as:

```text
moongames://game/chess?match=<matchId>&spectate=1
```

pass the parsed query to the host:

```tsx
const parsed = new URL(deepLink);
<MoonGamesWebView
  gameId="chess"
  launchQuery={parsed.search.replace(/^\?/, "")}
  // ...
/>;
```

The host sends the query in the game `init` config. Chess joins the invited
match, or watches when `spectate=1`, using the same flow as browser invite
links. Add a `launchQuery` prop to your screen if a link can arrive while the
app is already running. Registering the URL scheme or universal link remains
the app's responsibility.

## 6. Local run

Use the manifest URL for the target:

| Target | Manifest URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:8099/release-manifest.json` |
| iOS simulator | `http://127.0.0.1:8099/release-manifest.json` |
| Physical device | `http://<computer-lan-ip>:8099/release-manifest.json` |
| Production | `https://games.example.com/moongames/release-manifest.json` |

Start the local server from the repository:

```bash
cd Games
pnpm serve:releases
```

### Metro with a workspace app

If Metro cannot see the workspace packages, add watch folders and node module
paths. For an app at `Games/apps/rn`:

```js
// Games/apps/rn/metro.config.js
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
// For bare React Native, use @react-native/metro-config instead.

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
```

This snippet is for an Expo app; for a bare React Native app replace
`getDefaultConfig` with the Metro config helper from `@react-native/metro-config`.
Metro must also be able to transpile the host package's TypeScript entry. If it
cannot, add the package to the app's transpilation list or publish a compiled
version.

## 7. Platform configuration

### Android

Add the Internet permission:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

For local HTTP development, enable cleartext traffic in a debug manifest or a
debug-only network security config. Remove it before release. Production
manifest and Nakama traffic should use HTTPS/WSS.

The component already enables the WebView file access flags required by the
current single-file bundle:

```tsx
originWhitelist={["*"]}
allowFileAccess
allowFileAccessFromFileURLs
allowUniversalAccessFromFileURLs
mixedContentMode="compatibility"
```

Do not add a second plain WebView with different settings around the host
component.

### iOS

Production requires valid HTTPS/WSS certificates. For local HTTP development,
use a debug-only ATS exception. Do not ship arbitrary `NSAllowsArbitraryLoads`.

## 8. What the component forwards

`MoonGamesWebView` handles:

- manifest resolution, pinned-key verification, signature/SHA verification
- remote install, cache, downgrade rejection, and bundled fallback
- `init`, theme, session, and lifecycle messages
- `ready`, `exit`, `toast`, `haptic`, `sound`, `openUrl`, analytics, and
  session-refresh events
- haptics through React Native `Vibration`
- external URLs through `Linking.openURL`
- pause/resume through React Native `AppState`

Your app provides the toast UI, sound playback, analytics sink, and refreshed
session.

## 9. Integration checklist

- [ ] `pnpm install` resolves the host package and its workspace dependencies.
- [ ] `react-native-webview`, `react-native-fs`, and
      `react-native-zip-archive` are installed and autolinked.
- [ ] `pod install` succeeds on iOS.
- [ ] The fallback ZIP is in Android assets / iOS Copy Bundle Resources.
- [ ] The descriptor JSON is valid and matches the fallback ZIP.
- [ ] `trustedKeys` uses the production public key, not the dev key.
- [ ] The manifest URL is reachable from the device.
- [ ] Bundled fallback works with the manifest disabled.
- [ ] Remote install reports `source: "remote"` in `onReady`.
- [ ] Second launch offline reports `source: "cache"`.
- [ ] Theme changes reach the game.
- [ ] A refreshed session is passed back into the host.
- [ ] Online profile/rating matches the same account in the browser.
- [ ] If using a custom game list, the catalog loads and selected ids launch
      through the verified host.
- [ ] Android/iOS builds are run on a React Native-capable machine.
- [ ] A native match deep link reaches `launchQuery` and joins or spectates the
      correct match.

## Custom games list (optional)

The host re-exports the shared catalog contract, so a custom panel can load the
same data as the browser menu:

```tsx
import {
  fetchGamesCatalog,
  type GameCatalogEntry,
} from "@moongames/react-native-host";

const [games, setGames] = useState<GameCatalogEntry[]>([]);

useEffect(() => {
  fetchGamesCatalog("https://games.example.com/moongames/games.json")
    .then((catalog) =>
      setGames(catalog.games.filter((game) => game.status === "available")),
    )
    .catch((error) => console.warn("Games catalog failed", error));
}, []);

// Render with your own cards:
// <Pressable onPress={() => setSelectedGame(game.id)}>...</Pressable>
```

`GameCatalogEntry` exposes `tagline`, `description`, `status`, `tags`,
`capabilities`, `accent`, `icon`, `version`, `release`, `webPath`, and player
counts. Use those fields for your own cards. Keep a signed descriptor/ZIP pair
per game for the bundled fallback.

When a game is selected, pass its catalog `id` to `MoonGamesWebView`. The
catalog's `webPath` is for the browser menu and must not be used as a native
bundle URL. Catalog metadata is unsigned presentation data; the host still
selects and verifies the bundle from the signed release manifest. See
[the catalog guide](../../catalog/README.md).

### Using the ready-made web menu

If the app does not want to design its own game list, embed
`https://games.example.com/moongames/` in a WebView. The launcher posts a launch
request instead of navigating away:

```tsx
import { WebView } from "react-native-webview";

<WebView
  source={{ uri: "https://games.example.com/moongames/" }}
  onMessage={(event) => {
    const payload = JSON.parse(event.nativeEvent.data) as {
      type: string;
      gameId: string;
      webUrl: string | null;
    };
    if (payload.type === "moongames.launch-game") {
      setSelectedGame(payload.gameId);
    }
  }}
/>;
```

Then render `MoonGamesWebView` for `selectedGame` with that game's verified
bundled descriptor/ZIP. Ignore the payload's `webUrl` for native loading; it is
the browser link, not a trusted bundle URL.

The menu also works on its own in a browser when no host bridge is present.

## Current validation status

The host package typechecks against local shims for the native modules. It has
not been built or run on Android/iOS in this environment because the React
Native Android toolchain is unavailable. Validate native module linking, file
permissions, WebView file access, and a real release-manifest download on a
React Native-capable machine before shipping.
