# Signed bundle deltas

Deltas reduce update bandwidth by shipping only files that changed between two signed releases.

## Build

After packaging both releases:

```bash
cd Games
pnpm package:uno
pnpm build-delta --game uno --from 0.0.9 --to 0.1.0
pnpm release:manifest
```

The command reads the two signed release ZIPs, compares each entry by SHA-256, writes changed files under `objects/<sha256>`, and writes a signed `delta.json`.

## Layout

```text
releases/uno/0.1.0/deltas/0.0.9-0.1.0/
├── delta.json
└── objects/
    ├── 5d41402abc4b2a76b9719d911017c592...
    └── 7d793037a0760186574b0282f2f435e7...
```

## Descriptor

The delta descriptor contains:

- `format: 2`
- `gameId`
- `baseVersion` and `baseSha256`
- `targetVersion` and `targetSha256`
- `files`: path, SHA-256, size, and relative object URL
- `removed`: paths deleted in the target
- Ed25519 `keyId`, `publicKey`, and `signature`

The signature covers the path/hash/size list and the removed list. File URLs are not signed, so the CDN origin can move as long as the bytes match the signed hashes.

## Host behavior

The SDK derives the delta URL from the target bundle URL:

```text
<release>/<game>/<version>/deltas/<base>-<target>/delta.json
```

It then:

1. verifies the delta signature against pinned keys
2. checks base/target version and hash binding
3. copies the installed directory to a scratch directory
4. downloads and verifies each changed object
5. deletes removed paths
6. verifies the bundle entry exists
7. atomically renames the scratch directory into place
8. falls back to the full signed ZIP on any delta failure

## Tests

```bash
pnpm test:tools
```
