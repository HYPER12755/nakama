// End-to-end smoke test for the MoonGames Carrom Nakama backend.
//
// Run from Games/Carrom/web:
//   node scripts/online-smoke.mjs
//
// Environment:
//   NAKAMA_HOST=127.0.0.1 NAKAMA_PORT=7350 NAKAMA_SERVER_KEY=defaultkey

import { Client } from "@heroiclabs/nakama-js";

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const SERVER_KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const USE_SSL = process.env.NAKAMA_SSL === "true";

const OP = {
  STATE: 1,
  SHOT: 2,
  GAME_OVER: 3,
  ERROR: 4,
  PLAYER_JOINED: 5,
  PLAYER_LEFT: 6,
  MATCH_STARTED: 7,
  CHAT: 8,
  SPECTATOR_JOINED: 9,
  SPECTATOR_LEFT: 10,
  PONG: 15,
  SHOT_REQUEST: 101,
  REQUEST_STATE: 102,
  CHAT_SEND: 103,
  PING: 104,
};

const decoder = new TextDecoder();

function decodeData(data) {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  return JSON.parse(decoder.decode(data));
}

function createCollector(socket, label) {
  const queue = [];
  const waiters = [];

  socket.onmatchdata = (matchData) => {
    const message = {
      op: matchData.op_code,
      data: decodeData(matchData.data),
    };
    queue.push(message);
    for (let index = waiters.length - 1; index >= 0; index -= 1) {
      const waiter = waiters[index];
      if (waiter.predicate(message)) {
        waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      }
    }
  };

  return {
    label,
    queue,
    waitFor(predicate, description, timeoutMs = 20000) {
      const existing = queue.find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }

      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) {
              waiters.splice(index, 1);
            }
            reject(
              new Error(
                `${label}: timed out waiting for ${description}. Received: ${JSON.stringify(queue)}`,
              ),
            );
          }, timeoutMs),
        };
        waiters.push(waiter);
      });
    },
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function authenticate(deviceId) {
  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  const session = await client.authenticateDevice(deviceId, true);
  const socket = client.createSocket(USE_SSL, false);
  await socket.connect(session, true);
  return { client, session, socket };
}

function close(connection) {
  try {
    connection.socket.disconnect(false);
  } catch {
    // Ignore cleanup errors.
  }
}

async function createPrivateRoom(connection, seats) {
  const response = await connection.client.rpc(
    connection.session,
    "carrom_create_private_match",
    { seats },
  );
  const payload = response.payload;
  assert(
    payload?.ok === true && typeof payload.matchId === "string",
    `create private match failed: ${JSON.stringify(payload)}`,
  );
  return payload.matchId;
}

async function playTwoPlayerTable(runId) {
  const alice = await authenticate(`moongames-carrom-${runId}-alice`);
  const bob = await authenticate(`moongames-carrom-${runId}-bob`);
  try {
    const aliceEvents = createCollector(alice.socket, "alice");
    const bobEvents = createCollector(bob.socket, "bob");

    const matchId = await createPrivateRoom(alice, 2);
    console.log(`[ok] private carrom room created: ${matchId}`);

    await bob.socket.joinMatch(matchId);
    await alice.socket.joinMatch(matchId);

    const started = await aliceEvents.waitFor(
      (message) =>
        message.op === OP.STATE && message.data?.game?.discs?.length > 0,
      "the table to start",
    );
    const seats = started.data.seats ?? [];
    assert(seats.length === 2, `expected two seats, got ${seats.length}`);
    assert(
      seats[0].colour === "white" && seats[1].colour === "black",
      `unexpected seat colours: ${JSON.stringify(seats)}`,
    );
    assert(
      started.data.game.discs.length === 19,
      `expected 19 pieces, got ${started.data.game.discs.length}`,
    );
    console.log("[ok] the two player table started with the ICF medallion");

    await alice.socket.sendMatchState(
      matchId,
      OP.PING,
      JSON.stringify({ clientTime: 1234 }),
    );
    const pong = await aliceEvents.waitFor(
      (message) => message.op === OP.PONG,
      "the ping reply",
      8000,
    );
    console.log(`[ok] the server answered a ping: ${JSON.stringify(pong.data)}`);

    await alice.socket.sendMatchState(
      matchId,
      OP.SHOT_REQUEST,
      JSON.stringify({ position: 0.5, angle: -Math.PI / 2, power: 0.8 }),
    );

    let afterShot;
    try {
      afterShot = await bobEvents.waitFor(
        (message) => message.op === OP.STATE && (message.data?.shotSerial ?? 0) >= 1,
        "the shot to resolve",
      );
    } catch (cause) {
      console.error(
        `alice errors: ${JSON.stringify(
          aliceEvents.queue
            .filter((entry) => entry.op === 4)
            .map((entry) => entry.data),
        )}`,
      );
      throw cause;
    }
    assert(
      afterShot.data.game.turn === "black",
      `the turn did not pass: ${JSON.stringify(afterShot.data.game.turn)}`,
    );
    assert(
      afterShot.data.game.shotNumber === 1,
      `the shot was not counted: ${afterShot.data.game.shotNumber}`,
    );
    console.log("[ok] the server resolved the shot and passed the turn");

    await alice.socket.sendMatchState(
      matchId,
      OP.SHOT_REQUEST,
      JSON.stringify({ position: 0.5, angle: -Math.PI / 2, power: 0.8 }),
    );
    const rejection = await aliceEvents.waitFor(
      (message) => message.op === OP.ERROR,
      "the out of turn shot to be refused",
    );
    assert(
      rejection.data.message === "It is not your turn",
      `unexpected refusal: ${rejection.data.message}`,
    );
    console.log("[ok] a shot out of turn is refused");

    await bob.socket.sendMatchState(
      matchId,
      OP.CHAT_SEND,
      JSON.stringify({ text: "good luck" }),
    );
    const chat = await aliceEvents.waitFor(
      (message) => message.op === OP.CHAT,
      "the chat message",
    );
    assert(chat.data.text === "good luck", `unexpected chat: ${chat.data.text}`);
    console.log("[ok] the table chat reached the other player");
  } finally {
    close(alice);
    close(bob);
  }
}

async function playFourPlayerTable(runId) {
  const seats = 4;
  const players = [];
  try {
    for (let index = 0; index < seats; index += 1) {
      players.push(
        await authenticate(`moongames-carrom-${runId}-p${index}`),
      );
    }

    const matchId = await createPrivateRoom(players[0], seats);
    const events = createCollector(players[0].socket, "host");
    for (const player of players) {
      await player.socket.joinMatch(matchId);
    }

    const started = await events.waitFor(
      (message) =>
        message.op === OP.STATE &&
        (message.data?.seats?.length ?? 0) === seats &&
        message.data?.game !== null,
      "the four player table to start",
    );
    assert(
      started.data.game.discs.length === 37,
      `expected 37 pieces, got ${started.data.game.discs.length}`,
    );
    const colours = started.data.seats.map((seat) => seat.colour);
    assert(
      colours.join(",") === "white,yellow,black,green",
      `unexpected four player seats: ${colours.join(",")}`,
    );
    console.log("[ok] the four player table started with 37 pieces");
  } finally {
    for (const player of players) {
      close(player);
    }
  }
}

async function playQuickTable(runId) {
  const alice = await authenticate(`moongames-carrom-${runId}-quick-a`);
  const bob = await authenticate(`moongames-carrom-${runId}-quick-b`);
  try {
    const aliceEvents = createCollector(alice.socket, "quick-a");
    const bobEvents = createCollector(bob.socket, "quick-b");

    const response = await alice.client.rpc(alice.session, "carrom_quick_match", {
      seats: 2,
    });
    const payload = response.payload ?? {};
    assert(
      payload.ok === true && typeof payload.matchId === "string",
      `quick match RPC failed: ${JSON.stringify(payload)}`,
    );
    console.log(`[ok] the quick match RPC opened a table: ${payload.matchId}`);

    await bob.socket.joinMatch(payload.matchId);
    await alice.socket.joinMatch(payload.matchId);

    const started = await aliceEvents.waitFor(
      (message) => message.op === OP.STATE && message.data?.game?.discs?.length > 0,
      "the quick table to start",
    );
    assert(
      started.data.seats.length === 2,
      `expected two seats, got ${started.data.seats.length}`,
    );
    console.log("[ok] the quick table started for two players");
  } finally {
    close(alice);
    close(bob);
  }
}

async function playMatchmakerTable(runId) {
  const alice = await authenticate(`moongames-carrom-${runId}-mm-a`);
  const bob = await authenticate(`moongames-carrom-${runId}-mm-b`);
  try {
    const aliceEvents = createCollector(alice.socket, "mm-a");
    const bobEvents = createCollector(bob.socket, "mm-b");

    const aliceMatched = new Promise((resolve) => {
      alice.socket.onmatchmakermatched = resolve;
    });
    const bobMatched = new Promise((resolve) => {
      bob.socket.onmatchmakermatched = resolve;
    });

    const query = `+properties.game:carrom +properties.seats:2`;
    await alice.socket.addMatchmaker(query, 2, 2, {
      game: "carrom",
      seats: "2",
    });
    await bob.socket.addMatchmaker(query, 2, 2, {
      game: "carrom",
      seats: "2",
    });

    const [aliceMatch, bobMatch] = await Promise.all([
      aliceMatched,
      bobMatched,
    ]);
    assert(
      typeof aliceMatch.match_id === "string" &&
        aliceMatch.match_id === bobMatch.match_id,
      "the matchmaker did not pair the two players",
    );

    await alice.socket.joinMatch(aliceMatch.match_id, aliceMatch.token);
    await bob.socket.joinMatch(bobMatch.match_id, bobMatch.token);

    const started = await aliceEvents.waitFor(
      (message) => message.op === OP.STATE && message.data?.game?.discs?.length > 0,
      "the matched table to start",
    );
    assert(
      started.data.seats.length === 2,
      `expected two seats, got ${started.data.seats.length}`,
    );
    console.log("[ok] the matchmaker paired two players at one table");
  } finally {
    close(alice);
    close(bob);
  }
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await playTwoPlayerTable(runId);
  await playFourPlayerTable(runId);
  await playQuickTable(runId);
  await playMatchmakerTable(runId);
  console.log("carrom online smoke test passed");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exit(1);
});
