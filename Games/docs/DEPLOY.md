# Putting MoonGames on the internet

The whole platform runs behind **one address**. The menu, the games and the
game server are all reached through the same host and port, so a tunnel, a
proxy or a CDN only needs one name and one port.

## How a player reaches the server

The client never guesses a port. It takes the address of the page it is
running in:

```
https://games.example.com/          the menu and the games
https://games.example.com/v2/...     the calls to the server
wss://games.example.com/ws           the socket the server holds
```

That is why the same build works on a laptop, on a phone on the same
network, and behind a tunnel. Nothing in the client knows the port of the
server.

## What the web server does

`tools/serve-web.mjs` serves the built menu and the games, and passes the
parts that belong to the game server straight through to it:

| Path          | Served by                        |
| ------------- | -------------------------------- |
| `/`           | the menu                         |
| `/chess/`     | the chess game                   |
| `/carrom/`    | the carrom game                  |
| `/v2/...`     | the game server (calls)          |
| `/ws`         | the game server (socket)         |
| `/healthcheck`| the game server (health)         |

The server it passes them to is set with `--server`:

```
node tools/serve-web.mjs --port 4174 --server 127.0.0.1:7350
```

The local stack already does this, so `pnpm stack start` serves
everything on one port.

## Behind a tunnel

A tunnel that forwards a port needs nothing else:

```
bore local 4174 --to bore.pub
```

The player opens `http://bore.pub:<port>/` and the menu, the games and the
server are all reached through that one address.

## Behind a proxy or a CDN

Point the proxy at the local stack and forward the two server paths:

```nginx
server {
    listen 443 ssl;
    server_name games.example.com;

    # The menu and the games.
    root /srv/moongames/launcher/dist;

    # The game server.
    location /v2/ { proxy_pass http://127.0.0.1:7350; }
    location /ws  {
        proxy_pass http://127.0.0.1:7350;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    location /healthcheck { proxy_pass http://127.0.0.1:7350; }
}
```

The proxy must allow the socket upgrade, and the menu and the games must
be served from the same name as the server, because that is where the
client looks.

## A server that is somewhere else

A host that runs the server apart from the menu says where it is with
three settings, which are read when the client is built:

```
VITE_NAKAMA_HOST=api.example.com
VITE_NAKAMA_PORT=443
VITE_NAKAMA_SSL=true
```

Without them the client uses the address of the page it is on, which is
what a single machine and a tunnel need.

## What a real app needs

The native shells (React Native and Flutter) do the same thing as the
browser: they hand the game the address of the server and the shared
account, and the game connects through that address. The launcher already
passes both in the launch request, so a shell only has to open the game
with the same address the menu was served from.

## The account

The account is on the server, so it needs the server to be reachable. That
is the one thing that cannot live on the device: a guest account and a
signed in account are both kept by the server, so a player sees the same
account on every device they play on, and the games can rank each other.
