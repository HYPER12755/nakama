import { Client } from "@heroiclabs/nakama-js";

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const SSL = process.env.NAKAMA_SSL === "true";

async function player(name) {
  const client = new Client(KEY, HOST, PORT, SSL);
  const session = await client.authenticateDevice(`uno-smoke-${Date.now()}-${name}`, true, name);
  const socket = client.createSocket(SSL, false);
  await socket.connect(session, true);
  return { client, session, socket };
}

function waitForMatch(socket) {
  return new Promise((resolve) => {
    socket.onmatchmakermatched = resolve;
  });
}

function waitForState(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no state received")), 10000);
    socket.onmatchdata = (data) => {
      if (data.op_code === 1) {
        const payload = JSON.parse(new TextDecoder().decode(data.data));
        if (Array.isArray(payload.players) && payload.players.length === 2) {
          clearTimeout(timer);
          resolve(payload);
        }
      }
    };
  });
}

const runId = Date.now();
const alice = await player(`a-${runId}`);
const bob = await player(`b-${runId}`);
try {
  const aliceMatched = waitForMatch(alice.socket);
  const bobMatched = waitForMatch(bob.socket);
  const query = "+properties.game:uno +properties.seats:2";
  const properties = { game: "uno", seats: "2" };
  await Promise.all([
    alice.socket.addMatchmaker(query, 2, 2, properties),
    bob.socket.addMatchmaker(query, 2, 2, properties),
  ]);
  const [alicePair, bobPair] = await Promise.all([aliceMatched, bobMatched]);
  if (alicePair.match_id !== bobPair.match_id) {
    throw new Error("the matchmaker did not pair both players into one room");
  }
  const aliceState = waitForState(alice.socket);
  await Promise.all([
    alice.socket.joinMatch(alicePair.match_id, alicePair.token),
    bob.socket.joinMatch(bobPair.match_id, bobPair.token),
  ]);
  const state = await aliceState;
  if (!Array.isArray(state.players) || state.players.length !== 2) {
    throw new Error("the table did not start with two players");
  }
  console.log("[ok] the matchmaker paired two Uno players at one table");
} finally {
  alice.socket.disconnect(false);
  bob.socket.disconnect(false);
}
