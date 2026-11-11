# MoonGames host setup

This guide covers the parts shared by every native host. For platform-specific
steps see:

- [Flutter integration](flutter/INTEGRATION.md)
- [React Native integration](react-native/INTEGRATION.md)

## Responsibility split

The native app is only a host. It must not contain Chess rules, AI, matchmaking,
rating calculations, or an authoritative game server.

The host app is responsible for:

- fetching and verifying a signed game bundle
- caching the bundle and falling back to an app-bundled copy
- loading the game in a WebView
- passing the host theme, locale, Nakama session, and Nakama server config
- forwarding lifecycle, toast, sound, analytics, URL, and session-refresh events

The game bundle and Nakama remain responsible for:

- game rules and UI
- local/AI/online gameplay
- authoritative moves, clocks, results, ratings, and history
- browser/native parity

## 1. Host the release manifest

The host reads a `release-manifest.json` and installs one signed game ZIP from
it. A manifest must be reachable over HTTPS in production.

The current release layout is:

```text
Games/releases/
├── release-manifest.json
├── games.json                 # optional custom-menu catalog
├── chess/
│   └── 0.3.0/
│       ├── chess-0.3.0.bundle.json
│       └── chess-0.3.0.zip
└── ...
```

Upload the contents of `Games/releases/` to a static host or CDN, for example:

```text
https://games.example.com/moongames/release-manifest.json
https://games.example.com/moongames/chess/0.3.0/chess-0.3.0.zip
```

The manifest stores a relative ZIP URL, so the whole `releases/` directory can
move to another CDN without re-signing the game. The ZIP URL is intentionally
not signed; the ZIP contents still have to match the signed descriptor.

### Local manifest server

From the repository:

```bash
cd Games
pnpm serve:releases
```

The tool serves `releases/` on `0.0.0.0:8099` with CORS enabled for local
development. Use `node tools/serve-releases.mjs --port 8099 --root releases`
if you prefer to run it directly.

Use the right host address for the platform:

| Target | Manifest URL |
| --- | --- |
| Android emulator | `http://10.0.2.2:8099/release-manifest.json` |
| iOS simulator | `http://127.0.0.1:8099/release-manifest.json` |
| Physical device | `http://<computer-lan-ip>:8099/release-manifest.json` |
| Production | `https://games.example.com/moongames/release-manifest.json` |

Local HTTP requires platform development exceptions. Production must use HTTPS,
and Nakama online play should use HTTPS/WSS.

### Games catalog

If the app wants its own game-list design, also upload:

```text
Games/releases/games.json
```

and serve it beside the manifest:

```text
https://games.example.com/moongames/games.json
```

The catalog contains display metadata for every game: name, tagline,
description, player counts, capabilities, tags, icon/accent, version, and a
release summary. Generate it after the release manifest:

```bash
cd Games
pnpm catalog:generate
```

Flutter exposes `fetchGamesCatalog` and `GamesCatalog`; React Native re-exports
`fetchGamesCatalog` and the shared types. A custom screen should filter for
`status == "available"`, render the fields it wants, and then pass the selected
catalog `id` to `MoonGamesHost`/`MoonGamesWebView` with the normal signed
fallback assets. Do not use the catalog's `webPath` to launch a native bundle.

The catalog is unsigned presentation data. It is not a trust root and must not
replace manifest selection, pinned-key checks, or ZIP verification. See the
[games catalog guide](../catalog/README.md). If the app wants a ready-made menu,
use the [web launcher](../launcher/README.md) instead.

## 2. Pin a signing key

The host trusts only the key ids and raw Ed25519 public keys compiled into the
app. The current repository release is development-signed:

```text
key id:     dev-1
public key: yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=
```

This is acceptable for local development. Do not ship the development key as
the production trust root. The matching private key is
`Games/.keys/dev-signing-key.pem`; it must never be in the app, the repository
release, or the CDN.

For production, generate a separate key and package the release with it:

```bash
cd Games

node tools/generate-signing-key.mjs \
  --out .keys/prod-signing-key.pem \
  --key-id prod-1

node tools/package-game.mjs \
  --game chess \
  --key .keys/prod-signing-key.pem \
  --key-id prod-1

node tools/release-manifest.mjs \
  --latest-only \
  --key 'prod-1=<public-key-from-the-generation-step>'

node tools/verify-bundle.mjs \
  releases/chess/0.3.0/chess-0.3.0.bundle.json \
  releases/chess/0.3.0/chess-0.3.0.zip \
  --key 'prod-1=<public-key-from-the-generation-step>'
```

Pin the same `prod-1` public key in Flutter and React Native. Keep the private
key on the release machine only.

## 3. Ship a bundled fallback

Both hosts require an app-bundled descriptor and ZIP for:

- first launch while offline
- manifest/network failure
- invalid or tampered remote artifacts
- store compliance and recovery

Copy these two files from the signed release into the native app:

```text
chess-0.3.0.bundle.json
chess-0.3.0.zip
```

Never construct the descriptor or ZIP by hand, and never load an unsigned
fallback. The host verifies the bundled pair before extraction.

When a new release is published, keep the bundled fallback at a known-good
version; it does not have to match the newest remote version.

## 4. Use the same Nakama account

For exact profile, rating, and history parity with the browser, the native host
must pass:

- the app's Nakama session
- the same Nakama host, port, server key, and TLS setting used by the app

If the host omits both values, the game falls back to its own device auth and
local server defaults. That can create a different Nakama account from the one
used in the browser.

The game session shape is:

```ts
{
  token: string;
  refreshToken?: string;
  userId: string;
  username: string;
  expiresAt: number;
}
```

When the game sends `requestSessionRefresh`, refresh the app's Nakama session and
update the `session` prop. Both host packages push the new session into the
already-running game.

## 5. Theme and lifecycle

Pass the app's current theme into the host. Both wrappers forward:

- initial theme in `init`
- live theme changes after the game is ready
- `pause` when the app is backgrounded
- `resume` when it returns to the foreground

Server clocks keep running while the app is paused. The host must not pause the
Nakama match or local game rules itself.

## 6. Native launch queries and deep links

Browser invite links work directly:

```text
?match=<matchId>
?match=<matchId>&spectate=1
```

Native apps can forward the same query through the host:

```dart
// Flutter: after parsing your app's deep link.
final uri = Uri.parse(deepLink);
MoonGamesHost(
  gameId: 'chess',
  launchQuery: uri.query, // match=<matchId>&spectate=1
  // ...
)
```

```tsx
// React Native: after parsing your app's deep link.
const parsed = new URL(deepLink);
<MoonGamesWebView
  gameId="chess"
  launchQuery={parsed.search.replace(/^\?/, "")}
  // ...
/>;
```

The host sends a normalized `launch` object in the game `init` config:

```json
{
  "query": "match=<matchId>&spectate=1",
  "params": { "match": "<matchId>", "spectate": "1" }
}
```

Games use that context exactly like a browser query string. The Chess bundle
joins the invited match or watches it when `spectate=1`. Empty queries and
queries longer than 4096 characters are ignored.

The native app still owns the platform deep-link setup (scheme or universal
link). Host packages only forward the parsed query; they do not register URL
handlers.

## 7. Release verification checklist

Before wiring the app, verify the artifact:

```bash
cd Games

node tools/verify-bundle.mjs \
  releases/chess/0.3.0/chess-0.3.0.bundle.json \
  releases/chess/0.3.0/chess-0.3.0.zip \
  --key 'dev-1=yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs='
```

The current release should report:

```text
key:    dev-1
sha256: acc60583d99df496c476f0fa83f74ec39ae2bc8961e29f7e515e3f364c704d9b
size:   122556 bytes
```

If the artifact is re-packaged, update any app-bundled fallback and do not reuse
an old descriptor.

## 8. Host QA matrix

Run these checks on each platform:

| Check | Expected result |
| --- | --- |
| Manifest unavailable, first launch | bundled fallback loads |
| Manifest available, first launch | remote bundle installs and `source=remote` |
| Relaunch offline | installed cache loads and `source=cache` |
| Publish a newer version | app installs it |
| Serve an older manifest after install | host rejects downgrade |
| Tamper with ZIP bytes | host rejects size/SHA/signature |
| Wrong pinned key | host rejects descriptor before download |
| Change theme prop | game updates theme |
| Refresh session | game keeps/reuses the new Nakama session |
| Online game | profile/rating matches the same account in the browser |
| Quick match, no concurrent partner | after about five seconds a persistent quick table opens |
| Quick match, second player arrives later | the later player joins the open quick table |
| Cancel quick match | matchmaker ticket is removed and no table is opened |
| Invite link in browser | opens the correct match |
| Native match link | `launchQuery` reaches the game and joins/spectates the correct match |
| Custom menu catalog | loads, filters `available`, and launches by `game.id` |
| Catalog unavailable/tampered | menu shows its fallback; game bundle verification still applies |

## 9. Common failures

### `No game bundle is available offline`

The manifest failed and there is no installed cache or valid bundled fallback.
Check the manifest URL, network permission, DNS, TLS certificate, and fallback
asset declaration.

### Descriptor or signature rejected

The host's pinned `keyId`/public key does not match the descriptor, or the
manifest points at an artifact signed with another key. Verify the release with
`tools/verify-bundle.mjs` and update both the release and the pinned host key.

### Remote bundle is ignored after an update

Check `minHostProtocol` in the manifest. A bundle requiring a higher host
protocol is not selectable by an older app. Publish a compatible bundle or update
the host app.

### Android device cannot reach localhost

`127.0.0.1` points at the device, not the development machine. Use `10.0.2.2`
for the Android emulator or the computer's LAN IP for a physical device. Local
HTTP also needs a cleartext-development exception.

### Online profile does not match the browser

The native host is probably not passing the app's Nakama session/server config,
or it points at a different Nakama server. Pass `session` and `nakama` and verify
the server address.
