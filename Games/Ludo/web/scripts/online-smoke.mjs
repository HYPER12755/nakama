// End-to-end smoke test for the MoonGames Ludo Nakama backend.
// Run from Games/Ludo/web: node scripts/online-smoke.mjs

import { Client } from "@heroiclabs/nakama-js";

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const SERVER_KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const USE_SSL = process.env.NAKAMA_SSL === "true";

const OP = {
  STATE: 1, ROLL: 2, MOVE: 3, GAME_OVER: 4, ERROR: 5,
  PLAYER_JOINED: 6, MATCH_STARTED: 8, CHAT: 9, SPECTATOR_JOINED: 10,
  ROLL_REQUEST: 101, MOVE_REQUEST: 102, CHAT_SEND: 104, RESIGN: 106,
};

const decoder = new TextDecoder();
const decode = (data) => JSON.parse(typeof data === "string" ? data : decoder.decode(data));

function collector(socket, label) {
  const queue = [];
  const waiters = [];
  socket.onmatchdata = (message) => {
    const entry = { op: message.op_code, data: decode(message.data) };
    queue.push(entry);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(entry)) {
        waiters.splice(waiters.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(entry);
      }
    }
  };
  return {
    queue,
    wait(predicate, description, timeout = 15000) {
      const found = queue.find(predicate);
      if (found) return Promise.resolve(found);
      return new Promise((resolve, reject) => {
        const waiter = { predicate, resolve };
        waiter.timer = setTimeout(() => reject(new Error(`${label}: timed out waiting for ${description}`)), timeout);
        waiters.push(waiter);
      });
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function authenticate(id) {
  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  const session = await client.authenticateDevice(`ludo-smoke-${id}-${Date.now()}`, true);
  const socket = client.createSocket(USE_SSL, false);
  await socket.connect(session, true);
  return { client, session, socket, events: collector(socket, id), id };
}

async function main() {
  const a = await authenticate("a");
  const b = await authenticate("b");
  const watcher = await authenticate("watch");

  const response = await a.client.rpc(a.session, "ludo_create_private_match", { seats: 2 });
  const payload = response.payload;
  assert(payload?.ok === true && typeof payload.matchId === "string", "private match RPC failed");
  const matchId = payload.matchId;
  console.log("created private match", matchId, "code", payload.roomCode);

  await a.socket.joinMatch(matchId);
  await b.socket.joinMatch(matchId);
  await watcher.socket.joinMatch(matchId, undefined, { spectate: "1" });

  await a.events.wait((entry) => entry.op === OP.MATCH_STARTED, "match started");
  const stateEntry = await a.events.wait(
    (entry) => entry.op === OP.STATE && entry.data?.game && entry.data.spectators?.length === 1,
    "game state with spectator",
  );
  const state = stateEntry.data;
  assert(state.seats?.length === 2, "two seats");
  assert(state.spectators?.length === 1, "one spectator");
  assert(state.game?.playerCount === 2, "two-player game");
  assert(state.game?.seed !== undefined && state.game.seed !== 0, "server owns the dice seed");
  console.log("seats", state.seats.map((seat) => seat.colour).join(","));

  const currentColour = state.game.players[state.game.current].color;
  const active = state.seats.find((seat) => seat.colour === currentColour);
  const idle = state.seats.find((seat) => seat.colour !== currentColour);
  const activeClient = active.user_id === a.session.user_id ? a : b;
  const idleClient = active.user_id === a.session.user_id ? b : a;

  await idleClient.socket.sendMatchState(matchId, OP.ROLL_REQUEST, JSON.stringify({}));
  const refused = await idleClient.events.wait((entry) => entry.op === OP.ERROR, "not-your-turn error");
  assert(typeof refused.data.message === "string", "error message present");
  console.log("turn ownership enforced");

  await activeClient.socket.sendMatchState(matchId, OP.ROLL_REQUEST, JSON.stringify({}));
  const rolled = await activeClient.events.wait((entry) => entry.op === OP.ROLL, "roll broadcast");
  assert(rolled.data.value >= 1 && rolled.data.value <= 6, "valid die");
  console.log("rolled", rolled.data.value);

  await activeClient.socket.sendMatchState(matchId, OP.CHAT_SEND, JSON.stringify({ text: "hello table" }));
  const chat = await watcher.events.wait((entry) => entry.op === OP.CHAT, "chat reaches spectator");
  assert(chat.data.text === "hello table", "chat text");
  console.log("chat delivered to spectator");

  // A roll that cannot move passes the turn, so either seated player may be
  // current here. Both send a resignation; only the current seat is accepted.
  await a.socket.sendMatchState(matchId, OP.RESIGN, JSON.stringify({}));
  await b.socket.sendMatchState(matchId, OP.RESIGN, JSON.stringify({}));
  const over = await a.events.wait((entry) => entry.op === OP.GAME_OVER, "game over");
  assert(over.data.status === "resign", "resign result");
  assert(over.data.winnerUserId, "winner recorded");
  console.log("result", over.data.status, over.data.winnerColour);

  for (const player of [a, b, watcher]) player.socket.disconnect(false);
  console.log("Ludo online smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
