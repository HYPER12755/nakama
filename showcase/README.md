# Nakama Feature Showcase + Reaction Duel

A playable, single-origin showcase of the Nakama platform. Open
**http://127.0.0.1:4001/** and every action in the UI talks to a real Nakama
server. The game (Reaction Duel) is the excuse; the feature tour is the point.

- **Go** owns the gateway, static files, Nakama reverse proxy, and the
  authoritative game WebSocket.
- **Nakama** owns identity, sessions, social graph, parties, chat, matchmaker,
  leaderboards, tournaments, wallet, storage, notifications and its own Lua
  authoritative match handler.
- **No Node process** runs at runtime. The vendored `@heroiclabs/nakama-js`
  bundle is served directly to the browser.
- Everything is reachable through **port 4001**, including Nakama HTTP and
  WebSocket traffic. The admin console is the one exception: `/console`
  redirects to Nakama's console on `127.0.0.1:7351` because its SPA expects its
  own origin.

## Quick start

```bash
cd /data/data/com.termux/files/home/showcase
./start.sh                 # starts Nakama/Postgres first if needed, builds, serves :4001
./start.sh                 # idempotent; says already running
./stop.sh                  # stop the showcase only
./stop.sh --all            # also stop Nakama and PostgreSQL
```

Useful environment overrides:

| Variable | Default | Meaning |
|---|---|---|
| `SHOWCASE_PORT` | `4001` | Gateway listen port |
| `SHOWCASE_ADDR` | `0.0.0.0:4001` | Go listen address |
| `NAKAMA_URL` | `http://127.0.0.1:7350` | Nakama HTTP API |
| `NAKAMA_HTTP_KEY` | `showcase_http_key` | Runtime HTTP key used by Go to call `showcase_result` |
| `SHOWCASE_SECRET` | `dev_showcase_secret_2026` | Must match `SECRET` in `showcase.lua` |
| `SHOWCASE_SKIP_BUILD` | `0` | Set to `1` to skip `go build` |

Logs are in `logs/showcase.log`. The PID is in `run/showcase.pid`.

Development mode serves `web/` from disk instead of the embedded copy:

```bash
./stop.sh
go build -o showcase . && ./showcase -dev
```

## URLs and credentials

| What | URL |
|---|---|
| Showcase | http://127.0.0.1:4001/ |
| Go health | http://127.0.0.1:4001/go/health |
| Go rooms | http://127.0.0.1:4001/go/rooms |
| Nakama health via gateway | http://127.0.0.1:4001/healthcheck |
| Nakama API via gateway | http://127.0.0.1:4001/v2/ |
| Nakama realtime via gateway | ws://127.0.0.1:4001/ws |
| Go game socket | ws://127.0.0.1:4001/go/ws |
| Nakama console (redirect) | http://127.0.0.1:4001/console → http://127.0.0.1:7351/ |

Demo-only local credentials:

- Nakama server key: `defaultkey`
- Runtime HTTP key: `showcase_http_key`
- Go → Nakama shared result secret: `dev_showcase_secret_2026`
- Console: user `admin`, password `a473e6bf26e7c40ff99d2c43`

> These are development credentials. Rotate them and put the gateway behind
> TLS/authentication before exposing it outside the device.

## Two-tab tour

1. Open `http://127.0.0.1:4001/`.
2. Click **Open player 2** (opens `/?new=1` with a new device identity) or open
   `/?new=1` yourself in a second tab.
3. On both tabs, use **Quick match** (or **Find opponent** in the game card).
   The current tab leaves its party first, creates a Nakama matchmaker ticket
   filtered by `game_id=reaction-duel`, `protocol_version=1` and
   `rules_version=1` (with `client_version` attached as a property), and both
   tabs connect to the same deterministic Go room when Nakama matches them.
4. Watch the countdown, then tap **TAP** as soon as **GO!** appears. The Go
   server measures both taps and decides the winner.
5. Check wallet, leaderboards, tournament records, notifications, and the
   Nakama console after the result.

Private room: click **Create private room** in one tab, copy the code, and join
it from the other tab. Bot match works with one tab. Relay and Lua-arena rooms
are separate realtime demonstrations and do not require a second tab.

Social flow: add the other tab's username under **Friends**, then accept the
incoming request from the other tab. Pending sent/received requests are shown
as such. Group chat becomes available after joining a group.

## Feature inventory

The browser UI has a live coverage tracker stored in `localStorage`. Actions
mark features only when the corresponding real API call completes.

**Identity & account**

- Device auth, custom auth, email auth
- Session refresh and logout
- Account read/update (display name, avatar, language, location, timezone)

**Realtime & matches**

- Nakama socket connect
- Custom status update + status presence/follow
- Global chat, direct messages, group chat, channel history
- Relayed Nakama match (`createMatch` / `joinMatch` / `sendMatchState`)
- Matchmaker ticket + matched event
- Lua authoritative match (`showcase_arena.lua`) with tick/echo/presence

**Social graph**

- Friends: request, incoming/outgoing state, accept, delete
- Groups: create, join, list memberships, join group chat
- Parties: create, join, party data, party presence, leave

**Game**

- Nakama session validation for a raw Go WebSocket
- Bot match and private two-player room
- Server-measured reaction time
- Verified result RPC updates wallet, leaderboards and notifications

**Economy & competition**

- Daily bonus with wallet ledger
- Store purchase + inventory read
- Leaderboards: read, client write, server write, own-record lookup
- Tournament: list, join, submit score, claim reward
- Notifications: list, send, receive, delete

**Storage & RPC**

- Storage write/read/list/delete
- Public config object readable by everyone
- Custom RPC calls

**Ops**

- Nakama healthcheck, Go health, live room count
- Console access (separate origin via `/console` redirect)

## Architecture

```
browser (HTML/JS, vendored nakama-js)
        │
        │  same origin :4001
        ▼
Go gateway + authoritative game server (main.go, game.go)
        ├── /              embedded web client
        ├── /go/ws         Go reaction-duel WebSocket
        ├── /go/health     Go + Nakama health
        ├── /go/rooms      live rooms
        ├── /go/room-code  private room code
        ├── /v2/, /v1/     reverse proxy → Nakama :7350
        ├── /ws            reverse proxy → Nakama realtime :7350
        └── /healthcheck   reverse proxy → Nakama
                    │
                    ▼
Nakama :7350 ── PostgreSQL :5432
        │
        ├── Lua platform glue: data/modules/showcase.lua
        └── Lua authoritative arena: data/modules/showcase_arena.lua
```

The gateway upgrades `/go/ws`, validates the Nakama session token against
`GET /v2/account`, and then runs a small authoritative game loop. Verified
results are sent to `showcase_result` with the runtime HTTP key and a shared
secret. The browser never receives that secret or the HTTP key.

### Go reaction-duel protocol

Connect:

```
ws://127.0.0.1:4001/go/ws?token=<nakama-session>&mode=pvp|bot&room=<code>
```

Messages from the server include `hello`, `waiting`, `peer_joined`,
`peer_left`, `countdown`, `go`, `result`, `pong`, `room_closed`, and `error`.
Client messages are JSON objects:

```json
{"type":"tap"}
{"type":"ping"}
{"type":"rematch"}
```

The room code is sanitized and scoped by mode. `GET /go/room-code` returns a
new random PvP code and a ready-to-share join URL.

## Nakama resources

Seeded by `showcase_seed` in `showcase.lua`:

- Leaderboards
  - `showcase_reaction_ms` — ascending, best score
  - `showcase_reaction_wins` — descending, increment
- Tournament
  - `showcase_reaction_daily` — daily reset
- Public storage object
  - collection `showcase`, key `config`
- Demo group
  - “Showcase Lounge”

Client storage examples use collection `showcase_player`. Daily claims and
tournament claims are guarded by user-scoped storage objects, so reloading the
page does not grant the reward twice.

RPCs exposed by the Lua module:

`showcase_seed`, `showcase_info`, `showcase_daily`, `showcase_purchase`,
`showcase_claim_tournament`, `showcase_notify`, `showcase_demo_group`,
`showcase_create_arena`, and the privileged `showcase_result`.

## Configuration-gated or unavailable

These are deliberately visible as configuration-gated features rather than
fake successes:

- **IAP receipt validation** needs Apple/Google credentials and a validation
  endpoint. The store purchase here is a Nakama wallet/purchase-validation
  **demo**, not a real store receipt.
- **Social provider auth** (Apple, Google, Facebook, etc.) needs provider
  client IDs/secrets. Device, custom, and email auth are fully exercised.
- **Achievements and stats APIs** are not present in the Nakama version used
  here. The showcase does not pretend to call them; equivalent storage/RPC
  patterns are shown instead.
- **Nakama console** is a separate SPA origin at `:7351`. `/console` on 4001
  redirects to it rather than proxying it and breaking its routing.
- **Native engine games** (Unity/Godot/native Flutter engines) need a client
  plugin; the current playable client is framework-agnostic HTML/JS and works
  in a WebView. See `MOBILE.md` for the Flutter/React Native contract.

## Mobile and server-pushed games

The playable client is deliberately plain browser JavaScript. A Flutter or
React Native host can embed it in a WebView and pass the authenticated session
through a narrow bridge. `MOBILE.md` documents the manifest, transport tiers,
and bridge contract for shipping additional minigames without rebuilding the
host app.

The Go game server is already room- and mode-scoped; adding another game means
adding a new room mode/handler (or a separate native/WASM runtime profile) while
keeping Nakama for identity, matchmaking, economy and persistence.

## Verification performed

- Go build, `go vet`, and embedded static asset serving on `:4001`
- Nakama + PostgreSQL health and Lua module loading
- Two-client Nakama realtime chat and presence
- Relayed matches, matchmaker matching, parties, group chat
- Lua authoritative arena tick/echo
- Two-client Go PvP through `/go/ws`, bot duel, disconnect forfeit
- Matchmaker → deterministic Go room → two-client result path
- Wallet/ledger, leaderboard, tournament score/claim, storage, notifications
- jsdom end-to-end UI drive: auth, groups, chat, status, party, relay, arena,
  matchmaker ticket, daily, purchase, notifications, storage, leaderboard,
  tournament, bot game, health and room list

## Troubleshooting

**`/go/health` says `nakama: "down"`** — start Nakama:
`cd ../nakama && ./start.sh`, or rerun `./start.sh`.

**Port 4001 is already in use** — `./stop.sh` then `./start.sh`. The start
script refuses to attach to an unmanaged process.

**Matchmaker does not pair two tabs** — both tabs must be different Nakama
accounts. Use **Open player 2** / `/?new=1`. Both tabs must also leave any
existing party first; Quick match does this automatically.

**Session refresh warning in Nakama logs** — this checkout sets
`session.refresh_token_expiry_sec: 604800` in `../nakama/nakama.yml`.

**Console redirects to `:7351`** — expected. Open it directly if the redirect
is blocked; the console credentials above are local-only.
