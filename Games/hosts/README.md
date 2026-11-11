# Host wrappers

Full integration guides:

- [Shared host setup](HOST_SETUP.md)
- [Flutter integration](flutter/INTEGRATION.md)
- [React Native integration](react-native/INTEGRATION.md)
- [Games catalog API](../catalog/README.md): ready-made game-list data for
  custom native menus
- [Web launcher](../launcher/README.md): the browser game menu

This folder contains the generic host packages that load every MoonGames
title:

```text
hosts/
├── core/          # shared TypeScript bundle verification and selection
├── flutter/       # one Flutter package, parameterised by game id
└── react-native/  # one React Native package, parameterised by game id
```

Both wrappers implement the same contract from `shared/sdk/`:

- fetch a release manifest and select the newest compatible bundle
- require the descriptor key id/public key to match app-pinned keys
- verify the ZIP SHA-256, size, and Ed25519 signature before extraction
- cache the bundle, reject downgrades, and keep a bundled fallback
- pass the Nakama session, server configuration, theme, locale, and lifecycle
  events to the game
- receive `ready`, `exit`, `toast`, `haptic`, `sound`, `openUrl`, analytics,
  and session-refresh messages
- keep the game code sandboxed in a file-backed WebView

The current Chess bundle is a single self-contained `index.html` with inline
JavaScript and CSS. Hosts therefore do not depend on `file://` ES-module or
relative-asset loading, which is inconsistent across WebView engines.

The wrappers currently load the descriptor entry through `file://` only.
Multi-file games with external audio/art, dynamic-import chunks, Workers, WASM,
or normal Vite output need a secure local origin or platform asset loader. That
loader is a planned host update and must land before those bundles ship.

The loader is a generic static-file adapter, not game logic. The browser will
serve the same extracted/built bundle through a normal HTTP origin; native hosts
will expose the same files through a platform asset loader or local origin. Only
the origin changes. Gameplay, rules, AI, physics, and online client logic stay in
the web bundle and shared core, never in Flutter or React Native.

The wrappers contain no chess or card-game rules. Game rules stay in each
game's `core/` and `server/` folders.

## Trust model

Release artifacts are produced by `tools/package-game.mjs` with an Ed25519
private key. Only the public key is compiled into the host app. The remote
release manifest is a transport/discovery file; it is not trusted by itself.
A host must:

1. choose a descriptor for the requested game and host protocol
2. require its `keyId` and `publicKey` to match a pinned key
3. verify the descriptor signature
4. download the ZIP
5. verify its size, SHA-256, and descriptor signature again
6. reject versions older than the installed bundle

The descriptor URL is deliberately not signed, so the same signed artifact can
move between CDN hosts. The SHA-256 and signature still bind the downloaded
contents.

## Build status

The shared TypeScript core is tested. The React Native package typechecks against
native-module shims but has not been built on this arm64/Termux host because the
React Native Android toolchain is unavailable. The Flutter descriptor and bundle
manager were exercised with a pure-Dart 3.13 harness against the signed Chess
release (remote, cache, offline, and bundled paths); the InAppWebView widget was
typechecked against local API stubs, but `flutter analyze`, `flutter test`, and
platform builds still need a Flutter-capable machine. Their READMEs list the
real-device checks required before shipping.
