# Flutter host

`moongames_host` is the generic Flutter host for signed MoonGames web bundles.
It contains no game rules. One integration can load Chess today and the card,
Ludo, and Carrom packages later by changing the game id, manifest URL, and
bundled fallback.

See the full [Flutter integration guide](INTEGRATION.md) and the shared
[host setup guide](../HOST_SETUP.md).

## What it does

- fetches a `release-manifest.json` from the configured CDN
- selects the newest bundle compatible with the host protocol
- requires the descriptor's key id and public key to match the app's pinned keys
- downloads the ZIP, checks its SHA-256 and size, and verifies its Ed25519
  descriptor signature
- extracts the signed ZIP with path-traversal protection
- caches the installed bundle and re-verifies the descriptor on later launches
- falls back to a ZIP and descriptor bundled in the app
- loads the bundle in a file-backed `InAppWebView`
- implements the shared host/game bridge, including init, launch queries,
  theme, session, lifecycle, toast, haptic, sound, analytics, URL, and
  session-refresh events
- exposes `fetchGamesCatalog` and typed catalog models so the app can render its
  own game list instead of using the web launcher

The current Chess bundle is one self-contained `index.html` with inline
JavaScript and CSS, so it does not depend on `file://` ES-module or
relative-asset behavior. File access remains enabled for future multi-file
bundles.

The private signing key never belongs in this package. Only a public key is
pinned in the host app.

## Integration

Add the package with a path dependency while the packages live in this
repository:

```yaml
dependencies:
  moongames_host:
    path: ../../hosts/flutter
```

Declare the fallback assets in the host app:

```yaml
flutter:
  assets:
    - assets/games/chess/bundle.zip
    - assets/games/chess/bundle.json
```

Use it from a full-screen route:

```dart
MoonGamesHost(
  gameId: 'chess',
  manifestUrl: 'https://cdn.example.com/moongames/release-manifest.json',
  trustedKeys: const {
    'release-1': '<base64 raw Ed25519 public key>',
  },
  bundledDescriptorAsset: 'assets/games/chess/bundle.json',
  bundledZipAsset: 'assets/games/chess/bundle.zip',
  // Optional: forward match=...&spectate=1 from a native deep link.
  launchQuery: deepLinkUri.query,
  theme: const MoonGamesTheme(mode: MoonGamesThemeMode.dark),
  session: session,
  nakama: const MoonGamesNakamaConfig(
    host: 'nakama.example.com',
    port: '443',
    serverKey: 'defaultkey',
    useSSL: true,
  ),
  onToast: (message, level) => showSnackBar(message),
  onExit: (_) => Navigator.of(context).maybePop(),
  onRequestSessionRefresh: refreshNakamaSession,
)
```

The `bundle.json` is the output of `pnpm package:chess`; copy it and the ZIP
into the app's assets for the fallback. Never fall back to an unsigned file.
Provide both `session` and `nakama` for online play; otherwise the web bundle
falls back to automatic device authentication and its local server default.

## Custom games list

```dart
final catalog = await fetchGamesCatalog(
  'https://cdn.example.com/moongames/games.json',
);
final games = catalog.availableGames();
```

Use `GameCatalogEntry.name`, `tagline`, `description`, `icon`, `accent`, tags,
capabilities, and player counts in your own cards. Pass the selected `id` to
`MoonGamesHost`; keep using the signed fallback assets and release manifest for
the actual bundle. See [the catalog guide](../../catalog/README.md).

## Status

The bundle descriptor, Ed25519 verification, archive inspection, remote
download, cache, offline fallback, and bundled fallback paths were exercised
with Dart 3.13 against a real signed Chess release on this arm64/Termux host.
The games-catalog model, HTTP fetch, and web-link resolution were also validated
with a pure-Dart local-server harness.
The Flutter SDK is not installed, so `flutter analyze`, `flutter test`, and the
InAppWebView widget have not been built or run. Run those plus an Android/iOS
build on a Flutter-capable machine before shipping.

The Android host app needs the `INTERNET` permission. Use HTTPS for production
Nakama; local cleartext HTTP development may also require an Android network
security exception.
