# MoonGames provider architecture

## Decisions

- MoonGames is a full managed provider: signed releases, catalog, updates, Nakama accounts, social, and leaderboards.
- First supported hosts are React Native and Flutter. The web launcher remains the browser host.
- First launch may perform one download. After that, a full game must launch and play offline, including local and AI modes. Online multiplayer requires a connection.
- Partner apps add the MoonGames SDK and configure its behavior; they do not rebuild games or implement bundle management.
- Cache policy keeps the current and previous version. Updates install silently in the background.
- Bandwidth is the primary constraint. The 10 GB server budget must not be spent on repeated manifest or bundle downloads.
- Static release artifacts are served CDN-first with the existing release server as origin fallback.
- Signed bundle and delta formats move to an additive v2 while v1 keeps working.
- Telemetry is off. No anonymous bandwidth pings, no usage beacons.
- The APK-derived Uno sounds are acceptable for internal testing only. They must be replaced or cleared before partner distribution.

## Layers

### Release plane

`tools/package-game.mjs` builds deterministic signed ZIPs. `tools/release-manifest.mjs` indexes them. `tools/generate-catalog.mjs` produces display metadata. `tools/build-delta.mjs` creates signed file-level deltas between two installed versions.

All executable content is verified against Ed25519 keys pinned in the host. The catalog is presentation data and is never a trust root.

Release artifacts are immutable:

```text
releases/
├── release-manifest.json
├── games.json
└── uno/
    └── 0.1.0/
        ├── uno-0.1.0.zip
        ├── uno-0.1.0.bundle.json
        └── deltas/
            └── 0.0.9-0.1.0/
                ├── delta.json
                └── objects/<sha256>
```

The release server (`tools/serve-releases.mjs`, port 8099) is the origin. In production, put a CDN or object store in front of it. Because bundle URLs are outside the signature, the CDN origin can move without re-signing releases.

### SDK plane

The SDK owns:

- manifest fetch, ETag conditional requests, and a six-hour freshness cache
- pinned-key and signature checks before any bundle is installed
- current/previous cache retention
- delta-first update installation with verified full-ZIP fallback
- atomic extraction and install
- offline fallback to the installed bundle, then to an app-bundled fallback
- bridge setup, theme, locale, lifecycle, session, and deep-link forwarding

Partner apps configure `BundleUpdatePolicy`. The default is silent background updates, six-hour checks, cellular allowed, and two retained versions.

### Backend plane

Nakama and PostgreSQL remain managed by MoonGames. They own accounts, friends, direct chats, invites, matches, ratings, and leaderboards.

Online features require a connection. Local rules, AI, preferences, and installed bundles do not. The web launcher keeps the current behavior: a game stays playable until the browser page is refreshed; native hosts persist the installed bundle across app restarts.

### Partner plane

Partners prove a user's email through a server-to-server endpoint. The endpoint verifies an HMAC proof and exchanges it for a MoonGames Nakama session through Nakama custom authentication. The normalized email determines a stable MoonGames custom id, so the same person gets the same shared account across partner apps.

Plain email strings are never accepted as proof. See [Partner auth](PARTNER_AUTH.md).

## Bandwidth rules

1. The SDK uses the cached manifest for six hours and does not contact the origin during that window.
2. After the window, the SDK sends `If-None-Match`; a `304` transfers no manifest body.
3. A bundle is downloaded once per version. A cached installed version is selected without network transfer.
4. Updates use a signed delta containing only changed files; a full ZIP is downloaded only if the delta is missing, invalid, or fails verification.
5. Deltas are content-addressed, so unchanged files are never resent.
6. Only the current and previous versions are retained. Older extracted bundles are deleted.
7. No telemetry is sent from hosts or SDKs.

Expected steady-state origin traffic per active install is one small conditional manifest request every six hours, plus a few changed files per published update.

## Install flow

1. Partner app starts with game id, trusted keys, manifest URL, and update policy.
2. SDK loads the installed bundle from local storage and verifies its descriptor and signature.
3. SDK uses a fresh cached manifest, or performs a conditional request.
4. SDK selects the newest compatible signed bundle.
5. If installed version matches, launch immediately from cache.
6. If a newer version exists, SDK verifies its descriptor, tries the signed delta, then falls back to the signed full ZIP.
7. SDK installs atomically, prunes old versions, and launches the new bundle.
8. If everything remote fails, SDK uses the installed bundle, then the app-bundled fallback.

## Update policy

| Mode | Behavior |
| --- | --- |
| `background` | Install silently and activate on next launch. Default. |
| `forced` | Require the update; fail if it cannot be installed. |
| `prompt` | Notify the app and keep the installed version until the app applies it. |
| `manual` | Use only cached metadata and installed content. |

`checkIntervalMs`, `allowCellular`, and `keepVersions` are also configurable.

## Ownership

| Concern | Partner app | MoonGames |
| --- | --- | --- |
| App shell and store listing | yes | no |
| SDK configuration | yes | no |
| Theme, locale, lifecycle | yes | no |
| Signed bundles and deltas | no | yes |
| Bundle verification and caching | SDK | SDK contract |
| Nakama account and social | no | yes |
| Game rules and UI | no | yes |
| Asset rights for bundled titles | no | yes |

## Rollout

1. Add v2 delta tooling and host support. Keep v1 releases selectable.
2. Put release artifacts behind CDN-first hosting with origin fallback.
3. Enable partner auth endpoint for staging partners.
4. Run RN and Flutter sample apps through offline, cache-hit, delta-update, and full-fallback QA.
5. Replace internal-only Uno audio before public partner distribution.
6. Sign production releases with a production key and pin only that key in partner SDK builds.

## Risks

- App stores can restrict downloaded executable code. The app-bundled fallback and local game execution model must be reviewed per store.
- CDN caches must serve immutable artifacts with long TTLs. Never overwrite a versioned ZIP or delta object.
- Key rotation requires a new pinned key in partner apps; ship a key list with overlap.
- The partner auth endpoint depends on Nakama custom authentication being available on the managed server.
- No telemetry means bandwidth regressions must be caught by origin logs and release QA.
