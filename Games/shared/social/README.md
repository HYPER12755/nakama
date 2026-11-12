# @moongames/social

Host-facing TypeScript client for MoonGames identity, friends, direct chat,
invites, and notifications. It calls MoonGames Nakama RPCs and never reads or
writes a host app's social database.

The package re-exports no UI. Hosts render their own invite cards, notification
centers, and chat screens from the returned data.

## Account linking

The host supplies its signed-in email and username. Email is the stable MoonGames
identity key. The host must ask the user which option they want:

- **New MoonGames account:** collect consent and a MoonGames password, then call
  `linkHostAccount({ mode: "create" })`. The current guest account is linked, so
  rating and history are preserved.
- **Existing MoonGames account:** collect the MoonGames password, then call
  `linkHostAccount({ mode: "existing" })`. A host-supplied email can never take
  over the account without that password.

```ts
import {
  linkHostAccount,
  syncMoonGamesUsername,
} from "@moongames/social";

const session = await linkHostAccount({
  client,
  guestSession,
  email: hostAccount.email,
  username: hostAccount.username,
  password: chosenMoonGamesPassword,
  mode: "existing", // or "create"
});

// When the host app changes its display name later:
await syncMoonGamesUsername({
  client,
  session,
  username: hostAccount.username,
});
```

If the email already exists, Nakama rejects the create/link path. Show the
existing-account password flow instead. If only the username collides, ask for a
different name or add a prefix/suffix. The returned session contains the actual
name, so hosts can detect a collision and then call `syncMoonGamesUsername`
after the user chooses another. Email remains the stable identity key.

## Invite events

```ts
const social = new MoonGamesSocialClient({
  client,
  session,
  socket,
  selfUserId: session.user_id,
});

social.onNotification((notification) => {
  if (notification.invite) {
    hostRenderInviteCard(notification.invite);
  }
});

// Notifications received before the UI mounted.
const queued = social.drainPendingNotifications();

// After a reconnect, replay persistent invite/friend notifications from Nakama.
const pendingInvites = await social.replayInvites();
```

`MoonGamesInvite` contains the game id/title, sender, recipient, status, expiry,
token, match id, share/deep-link paths, preview URL, and safe metadata. Use
`inviteShareUrl` to build a token share link and `inviteTokenFromLink` to parse
web paths or native deep links before calling `resolveInvite`. The helper also
accepts the stable invite id carried by `deepLink`; the server enforces sender
or recipient access either way.

## Direct chat and invites

`joinDirectChat`, `listDirectMessages`, `sendDirectMessage`, and
`sendInviteMessage` use Nakama's persisted direct-channel type `2`. Direct
messages and invite cards are persisted. Temporary in-match chat remains in the
authoritative game match and is never stored here.

## Notifications

`listNotifications` merges Nakama persistent notifications with MoonGames read
state. `replayInvites` returns only invite-related events. `markNotificationsRead`
supports selected ids or everything. Live events are delivered by
`onNotification` while the socket is connected; `drainPendingNotifications`
handles events that arrived before the host UI attached. MoonGames suppresses
Nakama's generic `-9` friend-removal event because the shared backend sends the
action-specific `1103`-`1105` events; accepted requests use Nakama's built-in
`-3` notification.

The same API surface is exposed by the React Native host package and mirrored in
Flutter by `MoonGamesSocialClient` from `moongames_host`.
