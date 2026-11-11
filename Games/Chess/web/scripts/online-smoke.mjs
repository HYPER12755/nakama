// End-to-end smoke test for the MoonGames Chess Nakama backend.
//
// Run from Games/Chess/web:
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
  CLOCK: 2,
  MOVE: 3,
  GAME_OVER: 4,
  DRAW_OFFER: 5,
  DRAW_DECLINED: 6,
  ERROR: 7,
  PLAYER_JOINED: 8,
  PLAYER_LEFT: 9,
  MATCH_STARTED: 10,
  PONG: 11,
  SPECTATOR_JOINED: 12,
  SPECTATOR_LEFT: 13,
  MOVE_REQUEST: 101,
  RESIGN: 102,
  DRAW_OFFER_REQUEST: 103,
  DRAW_ACCEPT: 104,
  DRAW_DECLINE: 105,
  REQUEST_STATE: 106,
  PING: 107,
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
    waitFor(predicate, description, timeoutMs = 8000) {
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

function waitForMatchmaker(socket, label, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}: timed out waiting for matchmaker`));
    }, timeoutMs);

    socket.onmatchmakermatched = (matched) => {
      clearTimeout(timer);
      resolve(matched);
    };
  });
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

async function fetchProfile(connection, label) {
  const response = await connection.client.rpc(
    connection.session,
    "chess_get_profile",
    {},
  );
  const payload = response.payload;
  assert(payload?.ok, `${label}: profile RPC failed: ${JSON.stringify(payload)}`);
  if (!Array.isArray(payload.history)) {
    assert(
      payload.history && Object.keys(payload.history).length === 0,
      `${label}: profile history has an invalid shape`,
    );
    payload.history = [];
  }
  return payload;
}

async function fetchLeaderboard(connection, label) {
  const response = await connection.client.rpc(
    connection.session,
    "chess_get_leaderboard",
    { limit: 10 },
  );
  const payload = response.payload;
  assert(
    payload?.ok,
    `${label}: leaderboard RPC failed: ${JSON.stringify(payload)}`,
  );
  if (!Array.isArray(payload.entries)) {
    assert(
      payload.entries && Object.keys(payload.entries).length === 0,
      `${label}: leaderboard entries have an invalid shape`,
    );
    payload.entries = [];
  }
  return payload;
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const connections = [];

  try {
    const alice = await authenticate(`moongames-smoke-${runId}-alice`);
    const bob = await authenticate(`moongames-smoke-${runId}-bob`);
    connections.push(alice, bob);

    const aliceEvents = createCollector(alice.socket, "alice");
    let bobEvents = createCollector(bob.socket, "bob");

    const privateRpc = await alice.client.rpc(
      alice.session,
      "chess_create_private_match",
      { timeControl: { initialMs: 300000, incrementMs: 0 } },
    );
    const privateMatch = privateRpc.payload;
    assert(privateMatch?.ok, "create private match RPC failed");
    console.log(`[ok] private match created: ${privateMatch.matchId}`);

    // The opponent joins first; white must stay reserved for the creator.
    await bob.socket.joinMatch(privateMatch.matchId);
    await alice.socket.joinMatch(privateMatch.matchId);

    const aliceStart = await aliceEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "alice match started",
    );
    const bobStart = await bobEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "bob match started",
    );

    assert(aliceStart.data.players.length === 2, "alice should see two players");
    assert(bobStart.data.players.length === 2, "bob should see two players");

    const alicePlayer = aliceStart.data.players.find(
      (player) => player.userId === alice.session.user_id,
    );
    const bobPlayer = bobStart.data.players.find(
      (player) => player.userId === bob.session.user_id,
    );
    assert(alicePlayer?.color === "w", "creator should be white");
    assert(bobPlayer?.color === "b", "opponent should be black");
    console.log("[ok] private match seats creator as white");

    const eve = await authenticate(`moongames-smoke-${runId}-eve`);
    connections.push(eve);
    const eveEvents = createCollector(eve.socket, "eve");
    await eve.socket.joinMatch(privateMatch.matchId, undefined, {
      spectate: "1",
    });
    const eveSpectatorState = await eveEvents.waitFor(
      (message) =>
        message.op === OP.STATE &&
        Array.isArray(message.data.spectators) &&
        message.data.spectators.some(
          (spectator) => spectator.userId === eve.session.user_id,
        ),
      "eve spectator state",
    );
    assert(
      eveSpectatorState.data.players.length === 2,
      "spectator should still see both players",
    );
    assert(
      eveSpectatorState.data.spectators.length === 1,
      "spectator list should include eve",
    );
    await eve.socket.sendMatchState(
      privateMatch.matchId,
      OP.MOVE_REQUEST,
      JSON.stringify({ from: "e2", to: "e4" }),
    );
    const spectatorRejection = await eveEvents.waitFor(
      (message) => message.op === OP.ERROR,
      "spectator move rejection",
    );
    assert(
      spectatorRejection.data.message.includes("not a player"),
      "spectator must not be able to move",
    );
    await eve.socket.sendMatchState(
      privateMatch.matchId,
      OP.REQUEST_STATE,
      JSON.stringify({}),
    );
    await eveEvents.waitFor(
      (message) => message.op === OP.STATE,
      "spectator requested state",
    );
    console.log("[ok] spectator joins read-only and receives state");

    await alice.socket.sendMatchState(
      privateMatch.matchId,
      OP.MOVE_REQUEST,
      JSON.stringify({ from: "e2", to: "e4" }),
    );

    const aliceMove = await aliceEvents.waitFor(
      (message) => message.op === OP.MOVE,
      "alice e4 move",
    );
    const bobMove = await bobEvents.waitFor(
      (message) => message.op === OP.MOVE,
      "bob sees e4 move",
    );
    assert(aliceMove.data.move.san === "e4", "alice move should be e4");
    assert(bobMove.data.move.san === "e4", "bob should see e4");
    assert(aliceMove.data.state.turn === "b", "turn should pass to black");
    console.log("[ok] authoritative move broadcast");

    await bob.socket.sendMatchState(
      privateMatch.matchId,
      OP.MOVE_REQUEST,
      JSON.stringify({ from: "e7", to: "e5" }),
    );
    await bobEvents.waitFor(
      (message) => message.op === OP.MOVE && message.data.move.san === "e5",
      "bob e5 move",
    );
    console.log("[ok] second player move accepted");

    const clockBefore = await aliceEvents.waitFor(
      (message) => message.op === OP.CLOCK,
      "clock update",
      4000,
    );
    assert(clockBefore.data.whiteMs > 0, "white clock should be positive");
    assert(clockBefore.data.blackMs > 0, "black clock should be positive");
    console.log("[ok] server clock updates");

    // Reconnect within the grace window and confirm the seat is restored.
    bob.socket.disconnect(false);
    await aliceEvents.waitFor(
      (message) =>
        message.op === OP.PLAYER_LEFT &&
        message.data.userId === bob.session.user_id,
      "alice sees bob leave",
    );

    const bobReconnectSocket = bob.client.createSocket(false, false);
    bobEvents = createCollector(bobReconnectSocket, "bob-reconnected");
    await bobReconnectSocket.connect(bob.session, true);
    await bobReconnectSocket.joinMatch(privateMatch.matchId);
    const bobReconnectState = await bobEvents.waitFor(
      (message) =>
        message.op === OP.STATE &&
        message.data.players.some(
          (player) =>
            player.userId === bob.session.user_id && player.connected,
        ),
      "bob reconnect state",
    );
    assert(
      bobReconnectState.data.players.some(
        (player) => player.userId === bob.session.user_id && player.color === "b",
      ),
      "reconnect should restore the black seat",
    );
    bob.socket = bobReconnectSocket;
    console.log("[ok] reconnect restores the seat within grace");

    // A state snapshot should include a pending draw offer for reconnecting
    // clients and late screen loads.
    await alice.socket.sendMatchState(
      privateMatch.matchId,
      OP.DRAW_OFFER_REQUEST,
      JSON.stringify({}),
    );
    const bobDrawOffer = await bobEvents.waitFor(
      (message) => message.op === OP.DRAW_OFFER,
      "bob receives private draw offer",
    );
    assert(bobDrawOffer.data.by === "w", "white offered the draw");
    await bob.socket.sendMatchState(
      privateMatch.matchId,
      OP.REQUEST_STATE,
      JSON.stringify({}),
    );
    const drawOfferSnapshot = await bobEvents.waitFor(
      (message) => message.op === OP.STATE && message.data.drawOffer?.by === "w",
      "state snapshot includes draw offer",
    );
    assert(
      drawOfferSnapshot.data.drawOffer.userId === alice.session.user_id,
      "draw offer snapshot should identify the offering user",
    );
    await bob.socket.sendMatchState(
      privateMatch.matchId,
      OP.DRAW_DECLINE,
      JSON.stringify({}),
    );
    await aliceEvents.waitFor(
      (message) => message.op === OP.DRAW_DECLINED,
      "alice sees draw declined",
    );
    console.log("[ok] draw offer is included in state snapshots");

    await alice.socket.sendMatchState(
      privateMatch.matchId,
      OP.RESIGN,
      JSON.stringify({}),
    );
    const aliceGameOver = await aliceEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "alice game over",
    );
    const bobGameOver = await bobEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "bob game over",
    );
    assert(aliceGameOver.data.result.status === "resign", "result is resign");
    assert(aliceGameOver.data.result.winnerColor === "b", "black wins by resign");
    assert(bobGameOver.data.result.winnerColor === "b", "bob sees black win");
    const eveGameOver = await eveEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "eve sees game over",
    );
    assert(
      eveGameOver.data.result.winnerColor === "b",
      "spectator sees the same result",
    );
    await eve.socket.leaveMatch(privateMatch.matchId);
    console.log("[ok] resignation ends the match for players and spectators");

    const aliceProfile = await fetchProfile(alice, "alice");
    const bobProfile = await fetchProfile(bob, "bob");
    assert(aliceProfile.profile.rating === 1200, "private match is unrated");
    assert(aliceProfile.profile.games === 1, "alice has one recorded game");
    assert(aliceProfile.profile.losses === 1, "alice lost the private match");
    assert(aliceProfile.profile.ratedGames === 0, "private game is casual");
    assert(
      aliceProfile.profile.casualGames === 1,
      "private game counts as casual",
    );
    assert(bobProfile.profile.wins === 1, "bob won the private match");
    assert(bobProfile.profile.rating === 1200, "bob's rating stays at 1200");

    const aliceHistory = aliceProfile.history.find(
      (entry) => entry.matchId === privateMatch.matchId,
    );
    assert(aliceHistory, "alice history should include the private match");
    assert(aliceHistory.outcome === "loss", "alice history should be a loss");
    assert(aliceHistory.rated === false, "alice history should be casual");
    assert(
      aliceHistory.opponent.userId === bob.session.user_id,
      "alice history should identify bob",
    );
    assert(aliceHistory.pgn.includes("e4"), "alice history should include PGN");
    assert(
      Array.isArray(aliceHistory.sans) && aliceHistory.sans[0] === "e4",
      "alice history should include replay SANs",
    );

    const aliceLeaderboard = await fetchLeaderboard(alice, "alice");
    assert(
      aliceLeaderboard.me == null,
      "a private-only player should not have a rating record",
    );
    console.log("[ok] completed private match persisted with casual stats");

    // Matchmaker pairs two clients atomically, without relying on match_list
    // consistency between runtime workers.
    const carol = await authenticate(`moongames-smoke-${runId}-carol`);
    const dave = await authenticate(`moongames-smoke-${runId}-dave`);
    connections.push(carol, dave);

    const carolEvents = createCollector(carol.socket, "carol");
    const daveEvents = createCollector(dave.socket, "dave");
    const carolMatched = waitForMatchmaker(carol.socket, "carol");
    const daveMatched = waitForMatchmaker(dave.socket, "dave");

    const matchmakerQuery =
      "+properties.game:chess +properties.timeControlKey:300000_0";
    const matchmakerProperties = {
      game: "chess",
      timeControl: "5+0",
      timeControlKey: "300000_0",
    };
    await Promise.all([
      carol.socket.addMatchmaker(matchmakerQuery, 2, 2, matchmakerProperties),
      dave.socket.addMatchmaker(matchmakerQuery, 2, 2, matchmakerProperties),
    ]);

    const quickMatch = await carolMatched;
    const quickMatchAgain = await daveMatched;
    assert(
      quickMatch.match_id === quickMatchAgain.match_id,
      "both clients should receive the same matchmaker match",
    );
    assert(quickMatch.match_id, "matchmaker did not return a match id");

    await carol.socket.joinMatch(quickMatch.match_id, quickMatch.token);
    await dave.socket.joinMatch(quickMatchAgain.match_id, quickMatchAgain.token);

    const carolStart = await carolEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "carol quick match started",
    );
    const daveStart = await daveEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "dave quick match started",
    );
    assert(carolStart.data.players.length === 2, "carol should see two players");
    assert(daveStart.data.players.length === 2, "dave should see two players");
    console.log("[ok] matchmaker paired two clients");

    await carol.socket.sendMatchState(
      quickMatch.match_id,
      OP.DRAW_OFFER_REQUEST,
      JSON.stringify({}),
    );
    await daveEvents.waitFor(
      (message) => message.op === OP.DRAW_OFFER,
      "dave receives draw offer",
    );
    await dave.socket.sendMatchState(
      quickMatch.match_id,
      OP.DRAW_ACCEPT,
      JSON.stringify({}),
    );
    const carolDraw = await carolEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "carol draw game over",
    );
    assert(carolDraw.data.result.status === "draw", "result is a draw");
    assert(carolDraw.data.result.reason === "agreement", "draw by agreement");
    console.log("[ok] draw offer and acceptance");

    const carolDrawProfile = await fetchProfile(carol, "carol after draw");
    const daveDrawProfile = await fetchProfile(dave, "dave after draw");
    assert(carolDrawProfile.profile.rating === 1200, "draw leaves rating at 1200");
    assert(carolDrawProfile.profile.draws === 1, "carol draw is recorded");
    assert(carolDrawProfile.profile.ratedGames === 1, "quick draw is rated");
    assert(daveDrawProfile.profile.draws === 1, "dave draw is recorded");

    const carolDrawHistory = carolDrawProfile.history.find(
      (entry) => entry.matchId === quickMatch.match_id,
    );
    assert(carolDrawHistory, "carol history should include the rated draw");
    assert(carolDrawHistory.outcome === "draw", "draw history outcome");
    assert(carolDrawHistory.rated === true, "draw history should be rated");
    assert(carolDrawHistory.ratingDelta === 0, "equal draw has zero Elo delta");

    const carolDrawLeaderboard = await fetchLeaderboard(carol, "carol after draw");
    const daveDrawLeaderboard = await fetchLeaderboard(dave, "dave after draw");
    assert(carolDrawLeaderboard.me?.rating === 1200, "rated draw creates a record");
    assert(daveDrawLeaderboard.me?.rating === 1200, "dave draw creates a record");
    console.log("[ok] rated draw persisted with rating history");

    const carolDecisiveEvents = createCollector(
      carol.socket,
      "carol-decisive",
    );
    const daveDecisiveEvents = createCollector(dave.socket, "dave-decisive");
    const carolMatchedAgain = waitForMatchmaker(
      carol.socket,
      "carol decisive",
      25000,
    );
    const daveMatchedAgain = waitForMatchmaker(
      dave.socket,
      "dave decisive",
      25000,
    );

    await Promise.all([
      carol.socket.addMatchmaker(
        matchmakerQuery,
        2,
        2,
        matchmakerProperties,
      ),
      dave.socket.addMatchmaker(
        matchmakerQuery,
        2,
        2,
        matchmakerProperties,
      ),
    ]);

    const decisiveMatch = await carolMatchedAgain;
    const decisiveMatchAgain = await daveMatchedAgain;
    assert(
      decisiveMatch.match_id === decisiveMatchAgain.match_id,
      "second matchmaker pairing should use one match",
    );
    assert(
      decisiveMatch.match_id !== quickMatch.match_id,
      "second quick match should be a new match",
    );

    await carol.socket.joinMatch(decisiveMatch.match_id, decisiveMatch.token);
    await dave.socket.joinMatch(
      decisiveMatchAgain.match_id,
      decisiveMatchAgain.token,
    );
    await carolDecisiveEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "carol decisive match started",
    );
    await daveDecisiveEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "dave decisive match started",
    );
    console.log("[ok] matchmaker paired a second quick match");

    await carol.socket.sendMatchState(
      decisiveMatch.match_id,
      OP.RESIGN,
      JSON.stringify({}),
    );
    const carolDecisiveOver = await carolDecisiveEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "carol decisive game over",
    );
    const daveDecisiveOver = await daveDecisiveEvents.waitFor(
      (message) => message.op === OP.GAME_OVER,
      "dave decisive game over",
    );
    assert(
      carolDecisiveOver.data.result.winnerUserId === dave.session.user_id,
      "dave should win the decisive quick match",
    );
    assert(
      daveDecisiveOver.data.result.winnerUserId === dave.session.user_id,
      "dave should see himself as the winner",
    );

    const carolFinal = await fetchProfile(carol, "carol after resignation");
    const daveFinal = await fetchProfile(dave, "dave after resignation");
    assert(carolFinal.profile.rating === 1184, "carol rating drops to 1184");
    assert(carolFinal.profile.games === 2, "carol has two recorded games");
    assert(carolFinal.profile.losses === 1, "carol has one loss");
    assert(carolFinal.profile.draws === 1, "carol has one draw");
    assert(carolFinal.profile.ratedGames === 2, "both carol games are rated");
    assert(carolFinal.profile.peakRating === 1200, "carol peak stays at 1200");
    assert(daveFinal.profile.rating === 1216, "dave rating rises to 1216");
    assert(daveFinal.profile.wins === 1, "dave has one win");
    assert(daveFinal.profile.draws === 1, "dave has one draw");
    assert(daveFinal.profile.peakRating === 1216, "dave peak rises to 1216");

    const carolDecisiveHistory = carolFinal.history.find(
      (entry) => entry.matchId === decisiveMatch.match_id,
    );
    assert(carolDecisiveHistory, "carol decisive history should exist");
    assert(carolDecisiveHistory.outcome === "loss", "carol decisive loss");
    assert(carolDecisiveHistory.ratingBefore === 1200, "carol rating before");
    assert(carolDecisiveHistory.ratingAfter === 1184, "carol rating after");
    assert(carolDecisiveHistory.ratingDelta === -16, "carol Elo delta is -16");

    const daveDecisiveHistory = daveFinal.history.find(
      (entry) => entry.matchId === decisiveMatch.match_id,
    );
    assert(daveDecisiveHistory, "dave decisive history should exist");
    assert(daveDecisiveHistory.outcome === "win", "dave decisive win");
    assert(daveDecisiveHistory.ratingDelta === 16, "dave Elo delta is +16");
    console.log("[ok] rated resignation updates Elo and match history");

    const carolLeaderboard = await fetchLeaderboard(carol, "carol final");
    const daveLeaderboard = await fetchLeaderboard(dave, "dave final");
    assert(carolLeaderboard.me?.rating === 1184, "carol leaderboard is 1184");
    assert(daveLeaderboard.me?.rating === 1216, "dave leaderboard is 1216");
    assert(carolLeaderboard.me?.rank >= 1, "carol has a leaderboard rank");
    console.log("[ok] rating leaderboard reflects current Elo");

    // The web client falls back to the quick-match RPC when the atomic
    // matchmaker does not find a concurrent partner. That path must let a
    // second player join a table opened earlier.
    const gina = await authenticate(`moongames-smoke-${runId}-gina`);
    const hank = await authenticate(`moongames-smoke-${runId}-hank`);
    connections.push(gina, hank);
    const ginaEvents = createCollector(gina.socket, "gina");
    const hankEvents = createCollector(hank.socket, "hank");
    const slowQuickTimeControl = { initialMs: 600000, incrementMs: 0 };

    const ginaQuick = await gina.client.rpc(
      gina.session,
      "chess_quick_match",
      { timeControl: slowQuickTimeControl },
    );
    assert(
      ginaQuick.payload?.ok && ginaQuick.payload.matchId,
      `gina quick table failed: ${JSON.stringify(ginaQuick.payload)}`,
    );
    await gina.socket.joinMatch(ginaQuick.payload.matchId);
    await ginaEvents.waitFor(
      (message) => message.op === OP.STATE,
      "gina receives quick table state",
    );
    // A real second player arrives after the search fallback delay. match_list
    // is eventually consistent, so wait briefly before checking the table.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    const hankQuick = await hank.client.rpc(
      hank.session,
      "chess_quick_match",
      { timeControl: slowQuickTimeControl },
    );
    assert(
      hankQuick.payload?.ok,
      `hank quick table failed: ${JSON.stringify(hankQuick.payload)}`,
    );
    assert(
      hankQuick.payload.matchId === ginaQuick.payload.matchId,
      "a later player should find the open quick table",
    );

    await hank.socket.joinMatch(hankQuick.payload.matchId);
    await ginaEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "gina delayed quick match started",
    );
    await hankEvents.waitFor(
      (message) => message.op === OP.MATCH_STARTED,
      "hank delayed quick match started",
    );
    console.log("[ok] quick table fallback pairs players who arrive later");

    console.log("\nAll online smoke checks passed.");
  } finally {
    for (const connection of connections) {
      close(connection);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
