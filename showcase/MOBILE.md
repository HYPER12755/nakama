# Flutter, React Native, and server-pushed games

The showcase is a normal web client with no React/Flutter dependency. The same
HTML/JS bundle can run in a desktop browser, an Android/iOS WebView inside a
Flutter app, or a `react-native-webview` in a React Native app.

This document separates what is implemented from the contract a host app
should use when the showcase is turned into a multi-game platform.

## Status

| Piece | Status |
|---|---|
| Playable browser/WebView client | Implemented: `web/` |
| Nakama auth/realtime/economy integration | Implemented and tested |
| Go authoritative room server | Implemented: `/go/ws` |
| Flutter/React Native WebView wrapper | Not bundled; wrapper contract below |
| Server-pushed game catalog | Manifest contract below; not wired into this single-game UI |
| Native engine plugin tier | Design only |
| WASM tier | Design only |

The current playable game is deliberately served from the same origin as the
platform APIs. A host app does **not** need to reimplement Nakama UI in Dart or
JavaScript; it hosts the game surface and provides the session/material bridge.

## Why WebView first

- Nakama's JS SDK is mature and already covers socket, matchmaker, parties,
  chat, wallet, storage and RPC.
- The same bundle runs on Flutter and React Native without two native game
  plugins.
- The server can push new **content and game modes** without an app-store
  release, as long as the bundle format and bridge stay stable.
- Native plugins cannot be server-pushed; that is why native engine games are a
  separate, explicitly configured tier.

App Store rules for mini-game platforms are strict. Check current App Store
Review Guidelines 2.5.2 and 4.7 before shipping a host that downloads and runs
new games. Android/Play policies differ.

## Runtime tiers

| Tier | Runtime | Use | Transport |
|---|---|---|---|
| 1 | WebView | Casual/HTML5 games, current showcase | Nakama JS SDK + Go WebSocket |
| 2 | Native engine | Action/heavy games (Unity, Godot, custom C++) | WebSocket/gRPC to Go rooms |
| 3 | WASM | Sandboxed deterministic sims | WASM module + host bridge |

All tiers share the same manifest and result-verification contract. The host
must not trust a client-reported winner; only the Go game server submits
`showcase_result` to Nakama.

## Manifest contract

Store manifests in a public Nakama storage collection so every client reads the
same catalog:

- collection: `showcase_catalog`
- key: `games`
- permission_read: `2` (public)
- permission_write: `0` (server only)

Example value:

```json
{
  "schema_version": 1,
  "updated_at": "2026-11-09T00:00:00Z",
  "games": [
    {
      "id": "reaction-duel",
      "title": "Reaction Duel",
      "version": "1.0.0",
      "runtime": "webview",
      "entry": "/games/reaction-duel/index.html",
      "integrity": "sha256-...",
      "orientation": "portrait",
      "min_host_version": "1.0.0",
      "capabilities": ["nakama_session", "go_room", "result_notifications"],
      "room_mode": "pvp",
      "enabled": true
    }
  ]
}
```

Host rules:

1. Fetch the catalog after authentication and validate `schema_version`,
   `runtime`, `min_host_version`, `enabled`, and `integrity`.
2. Load only entries whose runtime the host supports. Never execute arbitrary
   remote script without an integrity check and a pinned origin.
3. Pin a host/app version; refuse manifests that request an unknown
   capability.
4. Keep a last-known-good manifest and roll back on failure.
5. Use server-side feature flags (Nakama storage/RPC) for staged rollout.

`entry` must be same-origin with the gateway. Cross-origin game bundles should
be proxied or explicitly allowlisted; do not trust the manifest to widen the
host's WebView navigation policy.

## Session handoff

Do not put a long-lived Nakama session token in a URL if it can be avoided: URLs
can land in history, logs, screenshots and referrers. The current browser client
uses a query parameter for `/go/ws` because browser WebSocket cannot set an
`Authorization` header. A production mobile host should use a short-lived game
ticket instead:

1. Native host authenticates with Nakama and gets a session.
2. Host calls a privileged RPC (for example `showcase_game_ticket`) to mint a
   single-use, 60-second ticket bound to the user and game/room.
3. Host opens the game with the ticket, not the session token.
4. Go game server redeems the ticket once, binds the connection, and rejects
   reuse.

The current code does step 1 directly: `/go/ws?token=<session>` validates the
token against Nakama and caches the identity for 60 seconds. That is acceptable
for a local showcase, but not the final mobile security model.

## Host ↔ game bridge

Keep the bridge narrow and versioned. The game bundle sends messages to the
host; the host sends only commands and session facts.

Host → game:

```json
{"type":"host_ready","protocol":1,"platform":"flutter"}
{"type":"session","token":"<short-lived-ticket>","user_id":"...","username":"..."}
{"type":"pause"}
{"type":"resume"}
{"type":"close"}
```

Game → host:

```json
{"type":"ready","protocol":1,"game_id":"reaction-duel","version":"1.0.0"}
{"type":"state","state":"lobby|countdown|live|result"}
{"type":"result","winner":"...","ms":123}
{"type":"error","message":"..."}
{"type":"request_close"}
```

Flutter sketch:

```dart
final controller = WebViewController()
  ..setJavaScriptMode(JavaScriptMode.unrestricted)
  ..addJavaScriptChannel('ShowcaseHost', onMessageReceived: (message) {
    final event = jsonDecode(message.message);
    if (event['type'] == 'result') showResult(event);
  })
  ..loadRequest(Uri.parse('https://game.example/games/reaction-duel/index.html'));

await controller.runJavaScript(
  'window.ShowcaseHost.postMessage(${jsonEncode({
    'type': 'session',
    'token': ticket,
    'user_id': user.id,
  })});',
);
```

React Native sketch:

```tsx
<WebView
  source={{ uri: 'https://game.example/games/reaction-duel/index.html' }}
  injectedJavaScriptBeforeContentLoaded={`
    window.SHOWCASE_HOST = 'react-native';
    window.postHostMessage = function (msg) {
      window.ReactNativeWebView.postMessage(JSON.stringify(msg));
    };
  `}
  onMessage={(event) => {
    const msg = JSON.parse(event.nativeEvent.data);
    if (msg.type === 'result') handleResult(msg);
  }}
  originWhitelist={['https://game.example']}
  javaScriptEnabled
  domStorageEnabled
/>
```

The current `web/` bundle does not yet consume this bridge; it authenticates
directly and is intended to be usable as a standalone demonstration. When
adding the bridge, keep the standalone path working so the browser remains the
reference client.

## Result path

```
game client --tap--> Go room --server measurement--> showcase_result RPC
                                                      │
                                                      ├─ wallet ledger
                                                      ├─ leaderboard records
                                                      ├─ tournament score
                                                      └─ persistent notification
```

The shared secret, Nakama runtime HTTP key, and server key stay on the Go/Nakama
side. A client can request a result notification but cannot forge a verified
score without compromising the Go server.

## Deployment checklist for a new game

1. Add a manifest entry and host the bundle on the same origin.
2. Add a Go game mode/handler or point the manifest at an existing mode.
3. Keep Nakama for identity, matchmaker filters (`game_id`, `client_version`,
   `protocol_version`, `rules_version`), economy, and persistence.
4. Add the game to the host's capability map and version gate.
5. Test in both Flutter and React Native WebViews: background/resume, network
   loss, orientation, touch latency, and session expiry.
6. Run a two-account result test; verify only the Go server writes scores.
7. Roll out to a test group with a storage feature flag before enabling it for
   everyone.
