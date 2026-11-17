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
  DRAW_OFFER: 11,
  DRAW_DECLINED: 12,
  PONG: 15,
  SHOT_REQUEST: 101,
  REQUEST_STATE: 102,
  CHAT_SEND: 103,
  PING: 104,
  RESIGN: 105,
  DRAW_OFFER_REQUEST: 106,
  DRAW_ACCEPT: 107,
  DRAW_DECLINE: 108,
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
      matchId: matchData.match_id,
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
  return payload;
}

async function playTwoPlayerTable(runId) {
  const alice = await authenticate(`moongames-carrom-${runId}-alice`);
  const bob = await authenticate(`moongames-carrom-${runId}-bob`);
  try {
    const aliceEvents = createCollector(alice.socket, "alice");
    const bobEvents = createCollector(bob.socket, "bob");

    const room = await createPrivateRoom(alice, 2);
    const matchId = room.matchId;
    console.log(`[ok] private carrom room created: ${matchId}`);

    // The host is given a short code to read out, and that code is what the
    // other player joins with.
    assert(
      typeof room.roomCode === "string" && room.roomCode.length > 0,
      `the host was not given a room code: ${JSON.stringify(room)}`,
    );
    console.log(`[ok] the host was given the room code: ${room.roomCode}`);

    const resolved = await bob.client.rpc(
      bob.session,
      "moongames_room_code_resolve",
      { code: room.roomCode, gameId: "carrom" },
    );
    assert(
      resolved.payload?.ok === true &&
        resolved.payload.matchId === matchId,
      `the room code did not resolve: ${JSON.stringify(resolved.payload)}`,
    );
    console.log("[ok] the room code resolves to the table it was made for");

    const unknown = await bob.client.rpc(
      bob.session,
      "moongames_room_code_resolve",
      { code: "ZZZZZZ", gameId: "carrom" },
    );
    assert(
      unknown.payload?.ok === false,
      `an unknown room code was accepted: ${JSON.stringify(unknown.payload)}`,
    );
    console.log("[ok] an unknown room code is refused");

    await bob.socket.joinMatch(resolved.payload.matchId);
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

    const room = await createPrivateRoom(players[0], seats);
    const matchId = room.matchId;
    const events = createCollector(players[0].socket, "host");
    // The other three players join with the short code, so the code has to
    // open a four player table and not only a table of two.
    assert(
      typeof room.roomCode === "string" && room.roomCode.length > 0,
      `the host was not given a room code: ${JSON.stringify(room)}`,
    );
    for (const player of players.slice(1)) {
      const resolved = await player.client.rpc(
        player.session,
        "moongames_room_code_resolve",
        { code: room.roomCode, gameId: "carrom" },
      );
      assert(
        resolved.payload?.ok === true &&
          resolved.payload.matchId === matchId,
        `the room code did not resolve: ${JSON.stringify(resolved.payload)}`,
      );
      await player.socket.joinMatch(resolved.payload.matchId);
    }
    await players[0].socket.joinMatch(matchId);

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

async function playThreePlayerTable(runId) {
  const seats = 3;
  const players = [];
  try {
    for (let index = 0; index < seats; index += 1) {
      players.push(
        await authenticate(`moongames-carrom-${runId}-p${index}`),
      );
    }

    const room = await createPrivateRoom(players[0], seats);
    const matchId = room.matchId;
    const events = createCollector(players[0].socket, "host");
    // The other two players join with the short code.
    assert(
      typeof room.roomCode === "string" && room.roomCode.length > 0,
      `the host was not given a room code: ${JSON.stringify(room)}`,
    );
    for (const player of players.slice(1)) {
      const resolved = await player.client.rpc(
        player.session,
        "moongames_room_code_resolve",
        { code: room.roomCode, gameId: "carrom" },
      );
      assert(
        resolved.payload?.ok === true &&
          resolved.payload.matchId === matchId,
        `the room code did not resolve: ${JSON.stringify(resolved.payload)}`,
      );
      await player.socket.joinMatch(resolved.payload.matchId);
    }
    await players[0].socket.joinMatch(matchId);

    const started = await events.waitFor(
      (message) =>
        message.op === OP.STATE &&
        (message.data?.seats?.length ?? 0) === seats &&
        message.data?.game !== null,
      "the three player table to start",
    );
    assert(
      started.data.game.discs.length === 28,
      `expected 28 pieces, got ${started.data.game.discs.length}`,
    );
    const colours = started.data.seats.map((seat) => seat.colour);
    assert(
      colours.join(",") === "white,black,green",
      `unexpected three player seats: ${colours.join(",")}`,
    );
    console.log("[ok] the three player table joined by room code");
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

    const query = `+properties.game:carrom +properties.seats:2 +properties.variant:classic`;
    await alice.socket.addMatchmaker(query, 2, 2, {
      game: "carrom",
      seats: "2",
      variant: "classic",
    });
    await bob.socket.addMatchmaker(query, 2, 2, {
      game: "carrom",
      seats: "2",
      variant: "classic",
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

async function playTableSettings(runId) {
  const alice = await authenticate(`moongames-carrom-${runId}-settings-a`);
  const bob = await authenticate(`moongames-carrom-${runId}-settings-b`);
  try {
    const aliceEvents = createCollector(alice.socket, "settings-a");

    const response = await alice.client.rpc(
      alice.session,
      "carrom_create_private_match",
      { seats: 2, variant: "freestyle", turnSeconds: 15 },
    );
    const payload = response.payload;
    assert(
      payload?.ok === true && typeof payload.matchId === "string",
      `create private match failed: ${JSON.stringify(payload)}`,
    );
    const matchId = payload.matchId;

    await bob.socket.joinMatch(matchId);
    await alice.socket.joinMatch(matchId);

    const started = await aliceEvents.waitFor(
      (message) =>
        message.op === OP.STATE && message.data?.game?.discs?.length > 0,
      "the table to start",
    );
    const game = started.data.game;
    assert(
      game.rules?.id === "freestyle" && game.rules?.coverQueen === false,
      `the table did not keep the game type: ${JSON.stringify(game.rules)}`,
    );
    assert(
      game.turnSeconds === 15 && typeof game.turnDeadline === "number",
      `the table did not start the shot clock: ${JSON.stringify({
        turnSeconds: game.turnSeconds,
        turnDeadline: game.turnDeadline,
      })}`,
    );
    console.log("[ok] the table kept the game type and the shot clock");

    await alice.socket.sendMatchState(
      matchId,
      OP.SHOT_REQUEST,
      JSON.stringify({
        position: 0.5,
        angle: -Math.PI / 2,
        power: 0.6,
        striker: "heavy",
      }),
    );

    const afterShot = await aliceEvents.waitFor(
      (message) =>
        message.op === OP.STATE && (message.data?.game?.shotNumber ?? 0) > 0,
      "the shot to resolve",
    );
    assert(
      afterShot.data.game.strikers?.white === "heavy",
      `the striker was not kept: ${JSON.stringify(afterShot.data.game.strikers)}`,
    );
    assert(
      afterShot.data.lastShot?.striker === "heavy" &&
        afterShot.data.lastShot?.colour === "white",
      `the shot did not carry the striker: ${JSON.stringify(afterShot.data.lastShot)}`,
    );
    console.log("[ok] the striker a player brings is kept at the table");
  } finally {
    close(alice);
    close(bob);
  }
}

async function playTableControls(runId) {
  const alice = await authenticate(`moongames-carrom-${runId}-controls-a`);
  const bob = await authenticate(`moongames-carrom-${runId}-controls-b`);
  const watcher = await authenticate(`moongames-carrom-${runId}-controls-w`);
  try {
    const aliceEvents = createCollector(alice.socket, "controls-alice");
    const bobEvents = createCollector(bob.socket, "controls-bob");
    const room = await createPrivateRoom(alice, 2);
    await alice.socket.joinMatch(room.matchId);
    await bob.socket.joinMatch(room.matchId);
    await aliceEvents.waitFor(
      (message) => message.op === OP.STATE && message.data?.game?.discs?.length > 0,
      "the table to start",
    );

    // A watcher is seated beside the table, not in a player's seat.
    await bob.socket.sendMatchState(room.matchId, OP.PING, "{}");
    await bobEvents.waitFor((message) => message.op === OP.PONG, "the ping reply");
    console.log("[ok] the server answers a ping in a control table");

    const watcherEvents = createCollector(watcher.socket, "controls-watcher");
    await watcher.socket.joinMatch(room.matchId, undefined, { spectate: "1" });
    const watching = await watcherEvents.waitFor(
      (message) =>
        message.op === OP.STATE && (message.data?.spectators?.length ?? 0) > 0,
      "the spectator gallery",
    );
    assert(
      watching.data.spectators.some(
        (entry) => entry.user_id === watcher.session.user_id,
      ),
      `the watcher was not seated in the gallery: ${JSON.stringify(watching.data.spectators)}`,
    );
    console.log("[ok] a table can be watched by id");

    await alice.socket.sendMatchState(
      room.matchId,
      OP.DRAW_OFFER_REQUEST,
      "{}",
    );
    const offer = await bobEvents.waitFor(
      (message) => message.op === OP.STATE && message.data?.drawOffer != null,
      "the draw offer",
    );
    assert(
      offer.data.drawOffer.by === alice.session.user_id,
      `the offer came from the wrong player: ${JSON.stringify(offer.data.drawOffer)}`,
    );
    console.log("[ok] a draw offer reaches the other player");

    await bob.socket.sendMatchState(room.matchId, OP.DRAW_ACCEPT, "{}");
    const drawn = await aliceEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "the agreed draw",
    );
    assert(
      drawn.data.status === "draw",
      `the table did not end in a draw: ${JSON.stringify(drawn.data)}`,
    );
    console.log("[ok] an accepted draw ends the table");

    // A second table is ended by a resignation, the way a player leaves a
    // game that is still being played.
    const second = await createPrivateRoom(alice, 2);
    await alice.socket.joinMatch(second.matchId);
    await bob.socket.joinMatch(second.matchId);
    await aliceEvents.waitFor(
      (message) =>
        message.matchId === second.matchId &&
        message.op === OP.STATE &&
        message.data?.game?.discs?.length > 0 &&
        (message.data?.result ?? null) === null,
      "the second table to start",
      8000,
    );
    await bob.socket.sendMatchState(second.matchId, OP.RESIGN, "{}");
    const resigned = await aliceEvents.waitFor(
      (message) =>
        message.op === OP.GAME_OVER && message.matchId === second.matchId,
      "the resignation",
    );
    assert(
      resigned.data.status === "resign" && resigned.data.winnerColour === "white",
      `the resignation was not recorded: ${JSON.stringify(resigned.data)}`,
    );
    console.log("[ok] a resignation gives the table to the other player");
  } finally {
    close(alice);
    close(bob);
    close(watcher);
  }
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await playTwoPlayerTable(runId);
  await playThreePlayerTable(runId);
  await playFourPlayerTable(runId);
  await playQuickTable(runId);
  await playMatchmakerTable(runId);
  await playTableSettings(runId);
  await playTableControls(runId);
  console.log("carrom online smoke test passed");
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : String(cause));
  process.exit(1);
});
