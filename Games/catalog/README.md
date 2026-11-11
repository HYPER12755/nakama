# Games catalog

`games.json` is the public discovery API for MoonGames. It lets a browser menu,
Flutter app, or React Native app render its own game list without parsing game
bundles or hard-coding titles.

It is **display metadata only**. Executable code is still discovered through the
signed `release-manifest.json` and verified by the host before it is loaded.

## Endpoint

Publish `games.json` beside the release manifest:

```text
https://games.example.com/moongames/games.json
https://games.example.com/moongames/release-manifest.json
https://games.example.com/moongames/chess/0.3.0/chess-0.3.0.zip
```

Both files are generated in `Games/releases/` and can be uploaded together. Use
normal CDN caching. The catalog format is versioned with the top-level
`format: 1` field.

Generate it locally:

```bash
cd Games
pnpm catalog:generate
```

The command reads:

- every real game's `Games/<Game>/manifest.json`
- `Games/catalog/planned-games.json` for announced titles that do not have a
  package yet
- `Games/releases/release-manifest.json`, when present, for the latest released
  version and size/hash summary

It writes:

```text
releases/games.json
launcher/public/games.json   # build input for the web menu
```

Do not hand-edit the generated files. Edit the game manifest or planned-game
metadata, then regenerate.

## Native custom menu

Native apps can make their own game panel and use the catalog only as data.
Launching a game should pass the catalog `id` to the verified host; native apps
should not navigate to `webPath` (that field is for the browser menu).

### Flutter

```dart
import 'package:moongames_host/moongames_host.dart';

final catalog = await fetchGamesCatalog(
  'https://games.example.com/moongames/games.json',
);

ListView(
  children: [
    for (final game in catalog.availableGames())
      ListTile(
        leading: Text(game.icon, style: const TextStyle(fontSize: 28)),
        title: Text(game.name),
        subtitle: Text(game.tagline),
        trailing: Text('${game.minPlayers}–${game.maxPlayers}'),
        onTap: () => openGameScreen(game.id),
      ),
  ],
);
```

`openGameScreen` should create `MoonGamesHost(gameId: game.id, ...)` with that
game's signed fallback descriptor/ZIP and the shared `manifestUrl`.

### React Native

```tsx
import { fetchGamesCatalog } from "@moongames/react-native-host";

const catalog = await fetchGamesCatalog(
  "https://games.example.com/moongames/games.json",
);
const available = catalog.games.filter((game) => game.status === "available");

// Render `available` with your own cards, then pass `game.id` to
// MoonGamesWebView along with that game's verified bundled fallback.
```

The React Native host re-exports the catalog types and helpers from
`@moongames/game-sdk`. Flutter exposes the same JSON contract through
`GamesCatalog.fromJson` and `fetchGamesCatalog`.

## Schema

```json
{
  "format": 1,
  "generatedAt": "2026-11-11T06:52:02.968Z",
  "games": [
    {
      "id": "chess",
      "name": "Chess",
      "tagline": "Classic chess. Local, AI, or rated online.",
      "description": "Standard chess with local, AI, online, ...",
      "status": "available",
      "version": "0.3.0",
      "minPlayers": 2,
      "maxPlayers": 2,
      "capabilities": ["local", "ai", "online"],
      "orientation": "any",
      "tags": ["strategy", "1v1", "rated"],
      "accent": "#e5b85c",
      "icon": "♞",
      "featured": true,
      "sortOrder": 10,
      "webPath": "chess/",
      "release": {
        "version": "0.3.0",
        "minHostProtocol": 1,
        "publishedAt": "2026-11-11T06:52:01.783Z",
        "sha256": "acc60583d99df496c476f0fa83f74ec39ae2bc8961e29f7e515e3f364c704d9b",
        "size": 122556,
        "keyId": "dev-1"
      }
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `id` | Stable game id used with the host and release manifest. |
| `name`, `tagline`, `description` | Ready-to-render display text. Keep `tagline` short. |
| `status` | `available`, `coming-soon`, or `hidden`. The generator omits hidden entries. |
| `version` | Latest declared/released version, for display. |
| `release` | Advisory summary of the latest descriptor; verify the actual bundle with the host. |
| `minPlayers`, `maxPlayers` | Playable player-count range. |
| `capabilities` | Shared capability names such as `local`, `ai`, `online`, `spectators`, `invite-links`, `replay`. |
| `orientation` | `portrait`, `landscape`, or `any`. Hosts may ignore it until they support locking. |
| `tags`, `accent`, `icon`, `featured`, `sortOrder` | Menu presentation hints. |
| `webPath` | Browser-only path relative to the catalog URL. Do not use as a native bundle URL. |
| `cover`, `screenshots` | Optional artwork paths/URLs for richer menus. Today these are empty unless a game manifest supplies them. |

## Trust and validation

- The catalog is served by the operator and is not signed by the bundle signing
  key. Treat it as presentation data, not as proof that a ZIP is safe.
- The actual game ZIP is selected from the signed release manifest and checked
  by the host against pinned Ed25519 keys, size, SHA-256, and signature.
- The catalog's `release` object is a display summary. Do not install a bundle
  from a URL supplied only by the catalog.
- The shared SDK validates the catalog and rejects malformed ids, unknown
  capabilities, unsafe paths/protocols, duplicate ids, bad colors, and invalid
  release metadata.
- Future fields are additive within `format: 1`; clients should ignore fields
  they do not recognize.

## Adding a game

1. Fill the catalog fields in `Games/<Game>/manifest.json` (or list an
   unreleased title in `planned-games.json`).
2. Build and package the game with the normal release workflow.
3. Regenerate `release-manifest.json` and then `pnpm catalog:generate`.
4. Upload `release-manifest.json` and `games.json`, then refresh the CDN cache.
