# Shared MoonGames social backend

`moongames_social.lua` owns platform-level identity features shared by every
official game. It does not contain game rules. Games register an authoritative
room factory at boot:

```lua
local social = require("moongames_social")

social.register_game("chess", {
  create_room = function(context, params, recipient)
    local match_id = nk.match_create("chess_match", { ... })
    return {
      matchId = match_id,
      gameTitle = "Chess",
      mode = "private",
      previewUrl = "https://cdn.example.com/moongames/chess/cover.svg",
      metadata = { timeControl = params.timeControl },
    }
  end,
})
```

Nakama loads both `Games/shared/server/` and each game's `server/` directory.
`pnpm stack sync` and `tools/sync-nakama-modules.sh` copy both into the runtime
module path. Restart Nakama after changing modules.

`moongames_config.lua` reads values from Nakama's `runtime.env`, which setup
fills from `Games/.env`. Lua modules call `config.get(name, fallback)` to read
the same settings the stack and engine service use.

## Storage

| Collection | Owner | Contents |
| --- | --- | --- |
| `moongames_invites` | system | Invite record at `invite_<id>`, token index at `token_<sha256>` |
| `moongames_notification_state` | user | Read notification ids |
| `moongames_recent_players` | user | Completed-match opponents |
| `moongames_cleanup` | system | Hourly guest-cleanup run guard |

Invite records store a hashed token, never the raw token in the token index.
Raw tokens are returned only to the creator. Invite TTL is 24 hours. Temporary
in-match chat is never written to storage.

## Guest account cleanup

`moongames_guest_cleanup.lua` starts one authoritative cleanup match after the
first RPC, then runs a pass once an hour. It never touches a rating leaderboard.
It deletes only device-only accounts with no email or linked provider, in
batches of 200. Nakama removes the user row, devices, friends, notifications,
stored objects, chat, wallet ledger, groups and leaderboard records for each
deleted account; no tombstone is left. A storage version guard makes the run
safe when several server nodes start the same job. Guests who play again are
recreated by device authentication, so the job prunes stale guests rather than
banning their device. Only email accounts are written to the rating
leaderboards, so guests never appear there.

`moongames_cleanup_guest_accounts` runs the same pass on demand. It is a
server-key RPC: a client session is refused. Call it with the runtime HTTP key,
for example `POST /v2/rpc/moongames_cleanup_guest_accounts?http_key=<key>` with
the body `"{}"`. The response reports `scanned`, `deleted`, `failed` and
`skipped` counts.

## RPC contract

All RPCs require a user session and return JSON. Errors use:

```json
{ "ok": false, "error": { "code": "not_eligible", "message": "..." } }
```

### Invites

`moongames_invite_create`

```json
{
  "gameId": "chess",
  "mode": "private",
  "recipientId": "uuid",
  "recipientUsername": "optional",
  "message": "optional",
  "timeControl": "5+0",
  "metadata": {}
}
```

Only mutual friends and recent opponents are eligible; blocked players are
excluded. The game's registered room factory creates the authoritative room at
invite time. The creator response contains a public invite with `inviteId`, a
one-time-share `token`, `matchId`, `joinPath`, `deepLink`, `previewUrl`, status,
expiry, players, and metadata. The token is stored hashed; invite cards use the
stable invite id, while `inviteShareUrl` builds `/invite/<token>` share links.

`moongames_invite_resolve`

```json
{ "inviteId": "uuid" }
```

or `{ "token": "..." }`. Returns `{ invite, direction, canAccept, canDecline,
canCancel, canJoin }`. Only the sender or recipient may resolve an invite.

`moongames_invite_accept`, `moongames_invite_decline`, `moongames_invite_cancel`

Accept/decline require the recipient; cancel requires the sender. Repeated
accept, decline, and cancel calls return the stored state without duplicating
notifications. Expired invites cannot be accepted or cancelled as active. Each
state change sends a persistent Nakama notification to the other player.

### Notifications

`moongames_notifications_state` returns `{ readIds }`.

`moongames_notifications_mark_read`

```json
{ "ids": ["notification-id"], "all": false }
```

Returns the updated read ids. Notifications themselves are Nakama's built-in
persistent notifications. Hosts replay them after reconnect by calling
`listNotifications`; no MoonGames notification table is used.

Codes:

| Code | Meaning |
| --- | --- |
| `-2` | Friend request |
| `-3` | Friend accepted |
| `-9` | Nakama generic friend removal (suppressed by MoonGames clients) |
| `1102` | Friend accepted (legacy compatibility; Nakama sends `-3`) |
| `1103` | Friend declined |
| `1104` | Friend request cancelled |
| `1105` | Friend removed |
| `2101` | Game invite |
| `2102` | Invite accepted |
| `2103` | Invite declined |
| `2104` | Invite cancelled |
| `2105` | Invite expired |

Nakama emits `-9` whenever a friend edge is deleted, including declines and
cancellations. MoonGames clients suppress that generic event; the specific
`1103`-`1105` notifications preserve the actual action.

Invite notifications carry `{ "invite": { ...public invite... } }` so hosts can
render their own invite cards. The same card can be sent into a persisted direct
chat with `@moongames/social` or the Flutter `MoonGamesSocialClient`.

### Friends

`moongames_friend_request`, `moongames_friend_accept`,
`moongames_friend_decline`, `moongames_friend_cancel`, and
`moongames_friend_remove` accept `{ userId }` or `{ username }`. They wrap
Nakama's friend graph and send notifications for state changes.

### Recent players

`moongames_recent_players_list` returns the caller's recent opponents. Chess
records both players after authoritative match finalization. Invite eligibility
accepts a recent opponent even without a mutual friendship.
