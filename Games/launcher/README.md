# MoonGames web launcher

The browser-first game menu for MoonGames. It reads the shared
[`games.json` catalog](../catalog/README.md) and renders a rich, responsive
library with search, filters, a featured game, and direct play links.

If a host app wants its own game panel, it can use the catalog API directly
instead of embedding this menu. The launcher is the ready-made option.

## Development

The launcher proxies `/chess/` to the Chess Vite dev server on port `5173`,
`/carrom/` to the Carrom Vite dev server on port `5175`, and
`/release-manifest.json` to the local release server on port `8099` for
official-proof testing. Run the release server once with `pnpm stack start` (or
`pnpm serve:releases`), then run the two frontend processes in separate
terminals:

```bash
cd Games
pnpm dev:chess
```

```bash
cd Games
pnpm dev:carrom
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

Set the production server and pinned release keys at build time:

```bash
cd Games
VITE_MOONGAMES_TRUSTED_KEYS='release-1=<base64 raw Ed25519 public key>' \
VITE_NAKAMA_HOST=nakama.example.com \
VITE_NAKAMA_PORT=443 \
VITE_NAKAMA_SSL=true \
VITE_NAKAMA_SERVER_KEY=defaultkey \
  pnpm build:web
pnpm preview:web
```

`VITE_MOONGAMES_TRUSTED_KEYS` accepts comma- or whitespace-separated
`keyId=publicKey` pairs. Without it, the launcher falls back to the development
key `dev-1`; replace that key before public deployment. The release manifest
defaults to `release-manifest.json` beside the launcher page. Override it with
`VITE_RELEASE_MANIFEST_URL` when the signed manifest is hosted elsewhere. If
verification is unavailable, games still open with their independent auth and
do not show the verified badge.

The launcher account uses the same `VITE_NAKAMA_*` values as the games. Keep
those builds on one Nakama server; an email identity is unique per server.

`build:web`:

1. builds the self-contained Chess and Carrom bundles
2. regenerates the catalog
3. builds the launcher
4. copies every available game's `dist/` into the launcher output at its
   `webPath` (currently `/chess/` and `/carrom/`)
5. copies `games.json` and the signed `release-manifest.json` beside the
   launcher

Keep `games.json`, `release-manifest.json`, and the release ZIP paths under the
same public base URL. The launcher resolves the manifest relative to its own
page URL.

The deployable directory is `launcher/dist/`:

```text
launcher/dist/
├── index.html
├── games.json
├── release-manifest.json
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
first-class browser app. For a verified official game, the browser handoff also
writes a one-game, session-scoped launcher identity into
`sessionStorage` before navigation. Native launch requests include
`accountMode: "shared"`, the launcher session, and the Nakama connection; the
native host must pass the same values through the normal game bridge. See the
native integration guides for a minimal embedding example:
[Flutter](../hosts/flutter/INTEGRATION.md) and
[React Native](../hosts/react-native/INTEGRATION.md).

## Account, invitations, and social model

- Guest or email identity is created once in the launcher. Every verified
  official game shares it. There is no per-game account choice for official
  games.
- The verified badge and shared handoff require a valid signed descriptor whose
  version, SHA-256, size, and key id match the catalog. A missing or invalid
  proof leaves Play available with the game's independent auth.
- Friends use Nakama's friend graph through the shared MoonGames RPCs, which add
  request/accept/decline/cancel notifications.
- Personal chats use persisted direct channels (`type: 2`) through
  `joinChat`, `writeChatMessage`, and `listChannelMessages`. The launcher does
  not add a custom chat database.
- Direct channels are resolved by joining the other user's id. Both players
  receive the same `4.<sorted-user-ids>.` channel.
- The Alerts drawer combines friend events, invites, unread direct messages,
  filters, and mark-read controls. Notification read state is stored in Nakama,
  so it survives relaunches; a `BroadcastChannel` refreshes other open tabs.
  Alerts page through Nakama's oldest-first notification cursor and refresh on
  focus, visibility, and drawer open, so a recent invite cannot be hidden
  behind older notifications.
- Invites can be created from friends or recent opponents. The authoritative
  game backend creates the private room at invite time; the launcher resolves,
  accepts, declines, cancels, and joins the returned match.
- Invite cards can live in launcher DMs. Outgoing cards copy a shareable token
  link. Deep links accept `/invite/<token>` or the stable `/invite/<inviteId>`
  (including the `moongames://` form), and the server still authorizes the
  sender or recipient. Native hosts receive the same card and token data
  through the SDK.
- Emoji pickers are part of MoonGames-owned chat UI: launcher friend chat and
  temporary in-game match chat. Host-owned chat UIs are not modified.
- Match chat is not shown here; it stays temporary inside each game and is never
  persisted.

Run the real-backend checks after starting the stack:

```bash
pnpm --filter @moongames/launcher smoke:account
pnpm --filter @moongames/launcher smoke:social
pnpm --filter @moongames/launcher smoke:invite
```

The invite smoke test creates a real Chess room, exercises token/id/deep-link
resolution, accept/decline/cancel, joins the accepted room from both sides,
checks notification read state and offline replay, and verifies a persisted
direct-chat invite card without leaking its creator token.

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
