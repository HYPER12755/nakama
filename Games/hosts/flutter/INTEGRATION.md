# Flutter integration guide

This guide wires `moongames_host` into a Flutter app. Start with the shared
[host setup](../HOST_SETUP.md) for release hosting, signing keys, fallback
artifacts, Nakama identity, and the QA matrix.

## What you add to the app

A Flutter host app needs:

1. the `moongames_host` package
2. a signed fallback ZIP and descriptor in the app assets
3. one full-screen `MoonGamesHost` route
4. the app's Nakama session and server config
5. Android/iOS network configuration for local or production servers
6. optionally, the games catalog for a custom game-list screen

No Chess, card-game, Ludo, or Carrom rules belong in the Flutter app.

## 1. Add the package

If your Flutter app lives inside this repository, for example under
`Games/apps/flutter_app`, use:

```yaml
dependencies:
  moongames_host:
    path: ../../hosts/flutter
```

If the app lives elsewhere, point at the checkout:

```yaml
dependencies:
  moongames_host:
    path: ../MoonGames/Games/hosts/flutter
```

Then:

```bash
flutter pub get
```

The package requires Flutter 3.27 or newer.

## 2. Add the fallback assets

Copy the current signed files into the Flutter app:

```text
assets/moongames/chess-0.3.0.bundle.json
assets/moongames/chess-0.3.0.zip
```

Declare them in `pubspec.yaml`:

```yaml
flutter:
  assets:
    - assets/moongames/chess-0.3.0.bundle.json
    - assets/moongames/chess-0.3.0.zip
```

The JSON descriptor is the `.bundle.json` file from
`Games/releases/chess/0.3.0/`. Do not create or edit it by hand.

## 3. Map the app session

The host needs a `MoonGamesSession`:

```dart
MoonGamesSession(
  token: appSession.token,
  refreshToken: appSession.refreshToken,
  userId: appSession.userId,
  username: appSession.username,
  expiresAt: appSession.expiresAt,
)
```

Adjust the field names to match your Nakama/auth layer. `expiresAt` is the
session expiry used by the host/game contract.

Passing the session is what makes the native game use the same Nakama account
as the rest of your app and the browser. If you pass `null`, the game falls back
to its own device authentication and may show a different profile and rating.

## 4. Add the Chess screen

Use `MoonGamesHost` as the full-screen child of a route:

```dart
import 'dart:async';

import 'package:flutter/material.dart';
import 'package:moongames_host/moongames_host.dart';

class ChessScreen extends StatefulWidget {
  const ChessScreen({
    super.key,
    required this.session,
    required this.onRefreshSession,
  });

  final MoonGamesSession? session;
  final Future<MoonGamesSession> Function() onRefreshSession;

  @override
  State<ChessScreen> createState() => _ChessScreenState();
}

class _ChessScreenState extends State<ChessScreen> {
  late MoonGamesSession? _session = widget.session;

  Future<void> _refreshSession() async {
    final refreshed = await widget.onRefreshSession();
    if (!mounted) {
      return;
    }
    setState(() => _session = refreshed);
  }

  @override
  Widget build(BuildContext context) {
    final brightness = Theme.of(context).brightness;

    return Scaffold(
      body: SafeArea(
        child: MoonGamesHost(
          gameId: 'chess',

          // Replace with your production manifest.
          manifestUrl: const String.fromEnvironment(
            'MOONGAMES_MANIFEST_URL',
            defaultValue:
                'https://games.example.com/moongames/release-manifest.json',
          ),

          hostProtocol: 1,

          // Development key from the current repository release.
          // Replace with your production public key before shipping.
          trustedKeys: const {
            'dev-1': 'yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=',
          },

          bundledDescriptorAsset:
              'assets/moongames/chess-0.3.0.bundle.json',
          bundledZipAsset: 'assets/moongames/chess-0.3.0.zip',

          locale: Localizations.localeOf(context).toLanguageTag(),

          theme: MoonGamesTheme(
            mode: brightness == Brightness.dark
                ? MoonGamesThemeMode.dark
                : MoonGamesThemeMode.light,
          ),

          session: _session,

          // Use the same Nakama server as the rest of the app.
          nakama: const MoonGamesNakamaConfig(
            host: 'nakama.example.com',
            port: '443',
            serverKey: 'your-production-server-key',
            useSSL: true,
          ),

          onReady: (launch) {
            debugPrint(
              'MoonGames ready: '
              '${launch.descriptor.gameId} '
              '${launch.descriptor.version} '
              'source=${launch.source}',
            );
          },

          onExit: (reason) {
            Navigator.of(context).maybePop();
          },

          onToast: (message, level) {
            if (!mounted) {
              return;
            }
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(message)),
            );
          },

          onSound: (name) {
            // Route to the app audio service.
          },

          onAnalytics: (event, properties) {
            debugPrint('MoonGames analytics: $event $properties');
          },

          onOpenUrl: (url) {
            // The host already opens the URL externally.
            debugPrint('MoonGames opened: $url');
          },

          onRequestSessionRefresh: () {
            unawaited(_refreshSession());
          },

          onError: (error) {
            debugPrint('MoonGames error: $error');
          },
        ),
      ),
    );
  }
}
```

`MoonGamesHost` handles its own loading spinner, error state, and retry button.
You do not need to call `BundleManager.resolve()` yourself unless you want to
preflight a version or show custom loading UI.

### Native match links

If your app receives a deep link such as:

```text
moongames://game/chess?match=<matchId>&spectate=1
```

pass the parsed query to the host:

```dart
final uri = Uri.parse(deepLink);
MoonGamesHost(
  gameId: 'chess',
  launchQuery: uri.query,
  // ...
)
```

The host sends the query in the game `init` config. Chess joins the invited
match, or watches when `spectate=1`, using the same flow as browser invite
links. Add a `launchQuery` field to your screen if a link can arrive while the
app is already running. Registering the URL scheme or universal link remains
the app's responsibility.

## 5. Local run

```bash
flutter run \
  --dart-define=MOONGAMES_MANIFEST_URL=http://10.0.2.2:8099/release-manifest.json
```

Use `127.0.0.1` on the iOS simulator and the computer's LAN IP on a physical
device. See [local manifest hosting](../HOST_SETUP.md#local-manifest-server).

## 6. Platform configuration

### Android

Add the Internet permission to
`android/app/src/main/AndroidManifest.xml`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

For local HTTP development only, allow cleartext traffic in a debug manifest or
a debug-only network security config. Remove the cleartext exception before
release. Production manifest and Nakama traffic should use HTTPS/WSS.

### iOS

Production requires valid HTTPS/WSS certificates. For local HTTP development,
add an ATS exception in the debug configuration only. Do not ship an arbitrary
`NSAllowsArbitraryLoads` exception.

## 7. What the widget forwards

After the game sends `ready`, `MoonGamesHost` sends:

- `init` with protocol, game id, locale, theme, session, Nakama config, and
  the optional launch query
- live `theme` changes when the Flutter theme changes
- live `session` updates when the app rebuilds with a new session
- `pause`/`resume` from Flutter app lifecycle events

It also handles game-to-host events:

| Game event | Flutter behavior |
| --- | --- |
| `toast` | `onToast`; show a SnackBar or your toast service |
| `haptic` | calls Flutter `HapticFeedback` |
| `sound` | `onSound`; play it in the app |
| `openUrl` | opens externally with `url_launcher` |
| `analytics` | `onAnalytics` |
| `requestSessionRefresh` | `onRequestSessionRefresh` |
| `exit` | `onExit` |

Sound is not bundled in this first Chess release. Wire `onSound` to the app's
audio service when a game starts sending sound events.

## 8. Integration checklist

- [ ] `flutter pub get` succeeds with the package path.
- [ ] Both fallback assets are listed in `pubspec.yaml`.
- [ ] `trustedKeys` contains the production public key, not the dev key.
- [ ] `manifestUrl` is reachable from the device.
- [ ] Falling back to bundled assets works with the manifest disabled.
- [ ] A remote install reports `BundleSource.remote` in `onReady`.
- [ ] A second launch while offline reports `BundleSource.cache`.
- [ ] Theme changes reach the game.
- [ ] The app session and Nakama config produce the same online profile/rating
      as the browser.
- [ ] Android/iOS builds are run on a Flutter-capable machine.
- [ ] If using a custom game list, the catalog loads and selected ids launch
      through the verified host.
- [ ] A native match deep link reaches `launchQuery` and joins or spectates the
      correct match.

## Custom games list (optional)

If you want your own game panel instead of the browser menu, fetch the catalog
and render it with your own widgets:

```dart
import 'package:moongames_host/moongames_host.dart';

Future<List<GameCatalogEntry>> loadGames() async {
  final catalog = await fetchGamesCatalog(
    'https://games.example.com/moongames/games.json',
  );
  return catalog.availableGames();
}

// Example item; wire onTap to the MoonGamesHost route from section 4.
ListTile(
  leading: Text(game.icon, style: const TextStyle(fontSize: 28)),
  title: Text(game.name),
  subtitle: Text(game.tagline),
  trailing: Text('${game.minPlayers}–${game.maxPlayers}'),
  onTap: () => openGameScreen(game.id),
)
```

`GameCatalogEntry` exposes `tagline`, `description`, `status`, `tags`,
`capabilities`, `accent`, `icon`, `version`, `release`, `webPath`, and player
counts. Use those fields for your own cards. Keep the signed fallback assets
per game; the catalog only tells the app what to show.

`openGameScreen` is the same `MoonGamesHost` route from section 4 with
`gameId: game.id` and that game's descriptor/ZIP. The catalog's `webPath` is for
the browser menu and must not be used as a native bundle URL.

The catalog is display data, not a trust root. Bundle selection and verification
still go through the signed release manifest and the pinned keys. See
[the catalog guide](../../catalog/README.md).

### Using the ready-made web menu

If the app does not want to design its own game list, embed
`https://games.example.com/moongames/` in an `InAppWebView`. The launcher will
call the `moongamesLaunchGame` JavaScript handler instead of navigating away:

```dart
controller.addJavaScriptHandler(
  handlerName: 'moongamesLaunchGame',
  callback: (args) {
    final payload = Map<String, dynamic>.from(args.first as Map);
    final gameId = payload['gameId'] as String;
    // Push the MoonGamesHost route for gameId with that game's verified
    // bundled descriptor/ZIP.
    return null;
  },
);
```

Add `flutter_inappwebview` as a direct app dependency if you embed the menu.
Ignore the payload's `webUrl` for native loading; it is the browser link, not a
trusted bundle URL.

The menu also works on its own in a browser when no host bridge is present.

## Current validation status

The descriptor, signature, archive, remote, cache, offline, and bundled paths
were validated with a pure-Dart harness against the signed Chess release. The
generated catalog, its HTTP fetch, and web-link resolution were also validated
with a pure-Dart local-server harness. The Flutter SDK is not installed in this
environment, so `flutter analyze`, `flutter test`, `flutter pub get`, and an
Android/iOS build must still be run on a Flutter-capable machine before
shipping.
