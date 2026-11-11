# MoonGames web launcher

The browser-first game menu for MoonGames. It reads the shared
[`games.json` catalog](../catalog/README.md) and renders a rich, responsive
library with search, filters, a featured game, and direct play links.

If a host app wants its own game panel, it can use the catalog API directly
instead of embedding this menu. The launcher is the ready-made option.

## Development

The launcher proxies `/chess/` to the Chess Vite dev server on port `5173`.
Run the two processes in separate terminals:

```bash
cd Games
pnpm dev:chess
```

```bash
cd Games
pnpm dev:web
```

Open `http://localhost:5174/`.

`dev:web` regenerates `launcher/public/games.json` before starting Vite. Do not
edit that file by hand; update the game manifest or
`catalog/planned-games.json` and run `pnpm catalog:generate`.

To point at a catalog on another host:

```bash
VITE_GAMES_CATALOG_URL=https://games.example.com/moongames/games.json \
  pnpm dev:web
```

## Production build

```bash
cd Games
pnpm build:web
pnpm preview:web
```

`build:web`:

1. builds the self-contained Chess bundle
2. regenerates the catalog
3. builds the launcher
4. copies every available game's `dist/` into the launcher output at its
   `webPath` (currently `/chess/`)
5. copies `games.json` beside the launcher

The deployable directory is `launcher/dist/`:

```text
launcher/dist/
├── index.html
├── games.json
├── assets/
└── chess/
    └── index.html
```

Upload that directory to any static host. It can live at a subpath such as
`https://example.com/moongames/`; all catalog paths are resolved relative to the
catalog URL.

## Embedding in a native app

A native app can use this menu without rebuilding its design. Point an in-app
WebView at the launcher URL and expose one small launch bridge. When a game is
selected, the launcher sends:

```json
{
  "type": "moongames.launch-game",
  "gameId": "chess",
  "webUrl": "https://games.example.com/moongames/chess/"
}
```

The native app then opens its normal verified `MoonGamesHost` /
`MoonGamesWebView` screen with that `gameId`. Do not use `webUrl` as a native
bundle URL, and do not bypass the signed manifest/fallback verification.

Supported bridges, checked in this order:

| Host | Bridge |
| --- | --- |
| Custom injected JS | `window.MoonGamesLauncher.launchGame(request)` |
| Flutter InAppWebView | `window.flutter_inappwebview.callHandler("moongamesLaunchGame", request)` |
| React Native WebView | `window.ReactNativeWebView.postMessage(JSON)` |
| iOS WKWebView | `window.webkit.messageHandlers.moongamesLauncher.postMessage(request)` |
| Android custom WebView | `window.MoonGamesAndroid.launchGame(JSON)` |

If no bridge exists, Play navigates to the normal web game and the menu remains a
first-class browser app. See the native integration guides for a minimal
embedding example:
[Flutter](../hosts/flutter/INTEGRATION.md) and
[React Native](../hosts/react-native/INTEGRATION.md).

## Adding a web game

A game must provide:

- `Games/<Game>/<Game>Web/` (or equivalent) with a `build:<id>` root script
- `manifest.json` with `status: "available"` and a `webPath`
- a built `dist/` directory containing the manifest `entry`

Then add its build to the root `build:web` script if it is not already covered,
regenerate the catalog, and run `build:web`. The assembler copies every
available game it can find; missing builds are reported but do not break the
menu.

## Design notes

- The UI is purely local React/CSS; there are no external fonts, images, or
  network dependencies.
- Artwork is generated from the catalog `icon`, `accent`, and optional `cover`,
  so a new game looks intentional before final art exists.
- Dark and light themes are both supported. The choice is stored locally.
- Reduced-motion preferences, keyboard focus, and small screens are handled.
- Desktop and mobile use the same bundle; there is no native-only menu path.
