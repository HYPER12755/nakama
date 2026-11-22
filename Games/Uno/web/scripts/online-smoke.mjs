import { Client } from "@heroiclabs/nakama-js";

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const SERVER_KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const USE_SSL = process.env.NAKAMA_SSL === "true";

const OP = {
  STATE: 1,
  CHAT: 2,
  MOVE: 3,
  GAME_OVER: 4,
  ERROR: 5,
  PLAYER_JOINED: 6,
  PLAYER_LEFT: 7,
  MATCH_STARTED: 8,
  PONG: 9,
  SPECTATOR_JOINED: 10,
  SPECTATOR_LEFT: 11,
  PLAY_REQUEST: 101,
  DRAW_REQUEST: 102,
  CHALLENGE_REQUEST: 103,
  CHAT_SEND: 104,
  REQUEST_STATE: 105,
  RESIGN: 106,
  PING: 107,
  COLOR_CHOOSE: 108,
};

const ERROR_CODE = {
  NOT_YOUR_TURN: "not_your_turn",
  ILLEGAL_CARD: "illegal_card",
  BAD_CHALLENGE: "bad_challenge",
  GAME_OVER: "game_over",
  UNKNOWN_CARD: "unknown_card",
  MISSING_COLOR: "missing_color",
};

const STATE_TIMEOUT_MS = 20000;
const ERROR_TIMEOUT_MS = 5000;
const MATCHMAKER_TIMEOUT_MS = 30000;
const HAND_SIZE = 7;
const STARTING_DECK_COUNT = 91;
const STARTING_CARD_ID = "red-draw2-0";
const QUICK_QUERY = "+properties.game:uno +properties.seats:2 +properties.seed:123456789";
const QUICK_PROPERTIES = { game: "uno", seats: "2", seed: "123456789" };

const decoder = new TextDecoder();
const collectors = new WeakMap();
const connections = [];
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function decodeData(data) {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  return JSON.parse(decoder.decode(data));
}

function attachCollector(socket, label) {
  const collector = { label, queue: [], waiters: [], latestState: null };
  collectors.set(socket, collector);
  socket.onmatchdata = (message) => {
    const entry = { op: message.op_code, data: decodeData(message.data) };
    collector.queue.push(entry);
    if (entry.op === OP.STATE) {
      collector.latestState = entry.data;
    }
    for (let index = collector.waiters.length - 1; index >= 0; index -= 1) {
      const waiter = collector.waiters[index];
      if (waiter.predicate(entry)) {
        collector.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(entry);
      }
    }
  };
  return socket;
}

function removeQueued(collector, entry) {
  const index = collector.queue.indexOf(entry);
  if (index >= 0) {
    collector.queue.splice(index, 1);
  }
}

function waitFor(socket, predicate, description, timeoutMs = STATE_TIMEOUT_MS) {
  const collector = collectors.get(socket);
  assert(collector, "socket has no message collector");
  const existingIndex = collector.queue.findIndex(predicate);
  if (existingIndex >= 0) {
    return Promise.resolve(collector.queue.splice(existingIndex, 1)[0]);
  }
  return new Promise((resolve, reject) => {
    const waiter = {
      predicate,
      resolve: (entry) => {
        removeQueued(collector, entry);
        resolve(entry);
      },
      timer: null,
    };
    waiter.timer = setTimeout(() => {
      const index = collector.waiters.indexOf(waiter);
      if (index >= 0) {
        collector.waiters.splice(index, 1);
      }
      const recent = collector.queue
        .slice(-12)
        .map((entry) => ({ op: entry.op, data: entry.data }));
      console.error(`${collector.label}: timed out waiting for ${description}`);
      console.error(`${collector.label}: last 12 queued messages: ${JSON.stringify(recent)}`);
      reject(new Error(`${collector.label}: timed out waiting for ${description}`));
    }, timeoutMs);
    collector.waiters.push(waiter);
  });
}

function waitState(socket, description, predicate = () => true, timeoutMs = STATE_TIMEOUT_MS) {
  return waitFor(
    socket,
    (message) => message.op === OP.STATE && predicate(message.data),
    description,
    timeoutMs,
  );
}

function latestState(socket) {
  return collectors.get(socket)?.latestState ?? null;
}

function waitForMatchmaker(socket, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}: timed out waiting for matchmaker`));
    }, MATCHMAKER_TIMEOUT_MS);
    socket.onmatchmakermatched = (matched) => {
      clearTimeout(timer);
      resolve(matched);
    };
  });
}

async function authenticate(label) {
  const suffix = `${runId}-${label}`;
  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  const session = await client.authenticateDevice(
    `uno-smoke-${suffix}`,
    true,
    `Uno ${label} ${suffix}`,
  );
  const socket = client.createSocket(USE_SSL, false);
  attachCollector(socket, label);
  await socket.connect(session, true);
  const connection = { label, client, session, socket };
  connections.push(connection);
  return connection;
}

async function rpc(connection, id, payload = {}) {
  const response = await connection.client.rpc(connection.session, id, payload);
  return response.payload;
}

function send(connection, matchId, op, payload = {}) {
  return connection.socket.sendMatchState(matchId, op, JSON.stringify(payload));
}

function legalCardIds(state) {
  const value = state.legalCards;
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value;
  }
  assert(
    typeof value === "object" && Object.keys(value).length === 0,
    `legalCards should be a list, got ${JSON.stringify(value)}`,
  );
  return [];
}

function seatOf(state, connection) {
  return state.players.find((player) => player.userId === connection.session.user_id);
}

function otherSeat(state, connection) {
  return state.players.find((player) => player.userId !== connection.session.user_id);
}

async function waitForStart(connection, label) {
  await waitFor(
    connection.socket,
    (message) => message.op === OP.MATCH_STARTED,
    `${label} match started`,
    STATE_TIMEOUT_MS,
  );
  return waitState(
    connection.socket,
    `${label} initial state`,
    (state) => state.started === true && state.players.length === 2,
  );
}

async function quickPair(label) {
  const alice = await authenticate(`${label}-alice`);
  const bob = await authenticate(`${label}-bob`);
  const aliceMatched = waitForMatchmaker(alice.socket, `${label}-alice`);
  const bobMatched = waitForMatchmaker(bob.socket, `${label}-bob`);
  await Promise.all([
    alice.socket.addMatchmaker(QUICK_QUERY, 2, 2, QUICK_PROPERTIES),
    bob.socket.addMatchmaker(QUICK_QUERY, 2, 2, QUICK_PROPERTIES),
  ]);
  const [alicePair, bobPair] = await Promise.all([aliceMatched, bobMatched]);
  assert(
    alicePair.match_id === bobPair.match_id,
    `${label}: matchmaker did not pair both clients into one room`,
  );
  const matchId = alicePair.match_id;
  await Promise.all([
    alice.socket.joinMatch(matchId, alicePair.token),
    bob.socket.joinMatch(matchId, bobPair.token),
  ]);
  return { alice, bob, matchId };
}

function pickLegalCard(state, connection) {
  const legalCards = legalCardIds(state);
  assert(legalCards.length > 0, `${connection.label}: no legal card to play`);
  const hand = seatOf(state, connection)?.hand ?? [];
  const card = (id) => hand.find((entry) => entry.id === id);
  const numberId = legalCards.find((id) => /^(red|yellow|green|blue)-\d+-\d+$/.test(id));
  const plainId = legalCards.find((id) => !id.startsWith("wild"));
  const cardId = numberId ?? plainId ?? legalCards[0];
  const chosen = card(cardId);
  const payload = { cardId };
  if (chosen && (chosen.kind === "wild" || chosen.kind === "wild4")) {
    payload.chosenColor = "red";
  }
  return { cardId, payload, kind: chosen?.kind };
}

async function assertInitialState(state, connection, label) {
  assert(state.started === true, `${label}: match did not start`);
  assert(state.seats === 2, `${label}: expected two seats, got ${state.seats}`);
  assert(state.turn === 1, `${label}: Draw Two starter should pass seat 0 and start seat 1, got ${state.turn}`);
  assert(
    state.deckCount === STARTING_DECK_COUNT,
    `${label}: expected deck ${STARTING_DECK_COUNT}, got ${state.deckCount}`,
  );
  assert(
    state.topCard?.id === STARTING_CARD_ID,
    `${label}: expected starter ${STARTING_CARD_ID}, got ${JSON.stringify(state.topCard)}`,
  );
  const mine = seatOf(state, connection);
  const other = otherSeat(state, connection);
  const expectedHand = mine?.seat === 0 ? HAND_SIZE + 2 : HAND_SIZE;
  assert(
    Array.isArray(mine?.hand) && mine.hand.length === expectedHand,
    `${label}: viewer should see ${expectedHand} cards`,
  );
  assert(other?.count === (other.seat === 0 ? HAND_SIZE + 2 : HAND_SIZE), `${label}: opponent count`);
  assert(other.hand === undefined, `${label}: opponent hand must stay hidden`);
  const legalCards = legalCardIds(state);
  assert(
    legalCards.every((id) => mine.hand.some((entry) => entry.id === id)),
    `${label}: legalCards must come from the viewer hand`,
  );
  assert(
    state.canDraw === (state.turn === mine.seat),
    `${label}: only the current player may draw`,
  );
}

async function quickMatchAndPlay() {
  const { alice, bob, matchId } = await quickPair("quick");
  await Promise.all([
    waitFor(alice.socket, (m) => m.op === OP.MATCH_STARTED, "alice match started"),
    waitFor(bob.socket, (m) => m.op === OP.MATCH_STARTED, "bob match started"),
  ]);
  const aliceStart = await waitState(
    alice.socket,
    "alice initial state",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "bob initial state",
    (state) => state.started === true && state.players.length === 2,
  );
  await assertInitialState(aliceStart.data, alice, "alice");
  await assertInitialState(bobStart.data, bob, "bob");
  assert(legalCardIds(aliceStart.data).length === 0, "alice should not have legal cards after Draw Two starter");
  assert(legalCardIds(bobStart.data).length > 0, "bob should have legal cards first");
  console.log("[ok] quick match starts with deterministic two-player state");

  const aliceCard = seatOf(aliceStart.data, alice).hand[0].id;
  await send(alice, matchId, OP.PLAY_REQUEST, { cardId: aliceCard });
  const rejected = await waitFor(
    alice.socket,
    (m) => m.op === OP.ERROR,
    "out-of-turn rejection",
    ERROR_TIMEOUT_MS,
  );
  assert(
    rejected.data.code === ERROR_CODE.NOT_YOUR_TURN,
    `expected ${ERROR_CODE.NOT_YOUR_TURN}, got ${JSON.stringify(rejected.data)}`,
  );
  console.log("[ok] out-of-turn play is rejected");

  const choice = pickLegalCard(bobStart.data, bob);
  const handBefore = seatOf(bobStart.data, bob).count;
  await send(bob, matchId, OP.PLAY_REQUEST, choice.payload);
  const moved = (message) =>
    message.op === OP.MOVE &&
    (message.data.action?.card_id ?? message.data.action?.cardId) === choice.cardId &&
    (message.data.action?.player_id ?? message.data.action?.playerId) === bob.session.user_id;
  await waitFor(alice.socket, moved, "bob move broadcast", ERROR_TIMEOUT_MS);
  await waitFor(bob.socket, moved, "bob move broadcast", ERROR_TIMEOUT_MS);
  const alicePlayed = await waitState(
    alice.socket,
    "alice state after play",
    (state) => state.topCard?.id === choice.cardId,
  );
  const bobPlayed = await waitState(
    bob.socket,
    "bob state after play",
    (state) => state.topCard?.id === choice.cardId,
  );
  for (const [state, label] of [[alicePlayed.data, "alice"], [bobPlayed.data, "bob"]]) {
    assert(
      seatOf(state, bob).count === handBefore - 1,
      `${label}: actor hand should shrink after a play`,
    );
    assert(
      otherSeat(state, bob).count === HAND_SIZE + 2,
      `${label}: opponent count should stay unchanged`,
    );
  }
  if (choice.kind === "number") {
    assert(alicePlayed.data.turn === 0 && bobPlayed.data.turn === 0, "turn should advance to seat 0");
  }
  console.log("[ok] legal play is broadcast and applied on both clients");

  const countBeforeDraw = seatOf(bobPlayed.data, alice).count;
  await send(alice, matchId, OP.DRAW_REQUEST, {});
  const aliceDrawn = await waitState(
    alice.socket,
    "alice state after draw",
    (state) => seatOf(state, alice)?.count === countBeforeDraw + 1,
  );
  const bobDrawn = await waitState(
    bob.socket,
    "bob state after draw",
    (state) => seatOf(state, alice)?.count === countBeforeDraw + 1,
  );
  const drawnCard = seatOf(aliceDrawn.data, alice).hand?.at(-1);
  assert(drawnCard?.id, "the drawn card should be appended to the hand");
  const drawnLegal = legalCardIds(aliceDrawn.data);
  const playable = drawnLegal.includes(drawnCard.id);
  if (playable) {
    assert(aliceDrawn.data.canDraw === false, "a playable drawn card closes the draw option");
    assert(
      drawnLegal.length === 1 && drawnLegal[0] === drawnCard.id,
      "only the drawn card should be legal",
    );
    assert(aliceDrawn.data.turn === 0, "the turn should stay with the drawing player");
  } else {
    assert(aliceDrawn.data.turn === 1, "an unplayable draw should pass the turn");
    assert(drawnLegal.length === 0, "no legal cards after a passed draw");
    assert(bobDrawn.data.canDraw === true, "the next player regains the draw option");
  }
  console.log("[ok] draw updates hand counts and turn by drawn-card legality");

  await send(alice, matchId, OP.CHAT_SEND, { text: "  hello   table  " });
  const aliceChat = await waitFor(
    alice.socket,
    (m) => m.op === OP.CHAT,
    "alice chat",
    ERROR_TIMEOUT_MS,
  );
  const bobChat = await waitFor(
    bob.socket,
    (m) => m.op === OP.CHAT,
    "bob chat",
    ERROR_TIMEOUT_MS,
  );
  assert(aliceChat.data.text === "hello table", "chat text should be normalized");
  assert(bobChat.data.text === "hello table", "both clients see normalized chat");
  assert(bobChat.data.userId === alice.session.user_id, "chat should identify the sender");
  console.log("[ok] chat is normalized and broadcast to both clients");

  const clientTime = Date.now();
  await send(alice, matchId, OP.PING, { clientTime });
  await waitFor(
    alice.socket,
    (m) => m.op === OP.PONG && m.data.clientTime === clientTime,
    "pong with clientTime echo",
    ERROR_TIMEOUT_MS,
  );
  console.log("[ok] ping returns a pong with the echoed clientTime");

  await send(alice, matchId, OP.RESIGN, {});
  const aliceOver = await waitFor(
    alice.socket,
    (m) => m.op === OP.GAME_OVER,
    "alice game over",
  );
  const bobOver = await waitFor(
    bob.socket,
    (m) => m.op === OP.GAME_OVER,
    "bob game over",
  );
  for (const [over, label] of [[aliceOver, "alice"], [bobOver, "bob"]]) {
    assert(over.data.status === "finished", `${label}: result status should be finished`);
    assert(
      over.data.winnerUserId === bob.session.user_id,
      `${label}: the other player should win by resignation`,
    );
  }
  const aliceFinal = await waitState(
    alice.socket,
    "alice final state",
    (state) => state.result?.winnerUserId === bob.session.user_id,
  );
  const bobFinal = await waitState(
    bob.socket,
    "bob final state",
    (state) => state.result?.winnerUserId === bob.session.user_id,
  );
  assert(latestState(alice.socket)?.result?.winnerUserId === bob.session.user_id, "alice final cache");
  assert(latestState(bob.socket)?.result?.winnerUserId === bob.session.user_id, "bob final cache");
  assert(aliceFinal.data.started === true && bobFinal.data.started === true, "final state stays started");
  console.log("[ok] resignation publishes a public result and final state");

  const profiles = await Promise.all([
    rpc(alice, "uno_get_profile"),
    rpc(bob, "uno_get_profile"),
  ]);
  const expectedOpponents = [bob.session.user_id, alice.session.user_id];
  for (const [index, profile] of profiles.entries()) {
    assert(profile?.ok === true, `profile ${index} RPC failed: ${JSON.stringify(profile)}`);
    const entry = (profile.history ?? []).find((item) => item.matchId === matchId);
    assert(entry, `profile ${index} should record the finished match`);
    assert(
      entry.opponent?.userId === expectedOpponents[index],
      `profile ${index} should identify the opponent`,
    );
    assert(typeof entry.ratingBefore === "number", `profile ${index} ratingBefore`);
    assert(typeof entry.ratingAfter === "number", `profile ${index} ratingAfter`);
    assert(typeof entry.ratingDelta === "number", `profile ${index} ratingDelta`);
    assert(entry.endedAt > 0, `profile ${index} endedAt`);
    assert(Array.isArray(entry.steps), `profile ${index} steps`);
  }
  console.log("[ok] guest profiles persist the match history");
}

async function privateRoomCodeAndSpectator() {
  const alice = await authenticate("private-alice");
  const bob = await authenticate("private-bob");
  const watcher = await authenticate("private-watcher");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 123456789,
  });
  assert(
    created?.ok === true &&
      typeof created.matchId === "string" &&
      typeof created.roomCode === "string" &&
      created.roomCode.length > 0,
    `private room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `room code did not resolve: ${JSON.stringify(resolved)}`,
  );
  console.log("[ok] a private room code resolves to the created table");

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitForStart(alice, "alice");
  const bobStart = await waitForStart(bob, "bob");
  await assertInitialState(aliceStart.data, alice, "private alice");
  await assertInitialState(bobStart.data, bob, "private bob");
  assert(
    seatOf(aliceStart.data, alice)?.seat === 0 && seatOf(bobStart.data, bob)?.seat === 1,
    "the creator should hold seat 0",
  );
  console.log("[ok] a non-creator joins the private table by its code");

  await watcher.socket.joinMatch(matchId, undefined, { spectate: "1" });
  await waitFor(
    alice.socket,
    (m) => m.op === OP.SPECTATOR_JOINED && m.data.userId === watcher.session.user_id,
    "alice sees spectator",
    ERROR_TIMEOUT_MS,
  );
  await waitFor(
    bob.socket,
    (m) => m.op === OP.SPECTATOR_JOINED && m.data.userId === watcher.session.user_id,
    "bob sees spectator",
    ERROR_TIMEOUT_MS,
  );
  const watcherState = await waitState(
    watcher.socket,
    "watcher state",
    (state) =>
      Array.isArray(state.spectators) &&
      state.spectators.some((entry) => entry.userId === watcher.session.user_id),
  );
  assert(watcherState.data.players.length === 2, "watcher should see both players");
  for (const player of watcherState.data.players) {
    assert(player.hand === undefined, "watcher must not receive any hand");
  }
  assert(legalCardIds(watcherState.data).length === 0, "watcher must not receive legal cards");
  await send(watcher, matchId, OP.PLAY_REQUEST, { cardId: STARTING_CARD_ID });
  const spectatorError = await waitFor(
    watcher.socket,
    (m) => m.op === OP.ERROR,
    "spectator play rejection",
    ERROR_TIMEOUT_MS,
  );
  const reason = `${spectatorError.data.code ?? ""} ${spectatorError.data.message ?? ""}`;
  assert(
    /not_your_turn|not a player/i.test(reason),
    `spectator should not play: ${JSON.stringify(spectatorError.data)}`,
  );
  console.log("[ok] spectator is read-only and receives hand-free state");

  const choice = pickLegalCard(bobStart.data, bob);
  await send(bob, matchId, OP.PLAY_REQUEST, choice.payload);
  const watcherPlayState = await waitState(
    watcher.socket,
    "watcher state after play",
    (state) => state.topCard?.id === choice.cardId,
  );
  for (const player of watcherPlayState.data.players) {
    assert(player.hand === undefined, "watcher still must not receive hands after a play");
  }
  const aliceCountBeforeDraw = seatOf(watcherPlayState.data, alice).count;
  await send(alice, matchId, OP.DRAW_REQUEST, {});
  const watcherDrawState = await waitState(
    watcher.socket,
    "watcher state after draw",
    (state) => seatOf(state, alice)?.count === aliceCountBeforeDraw + 1,
  );
  for (const player of watcherDrawState.data.players) {
    assert(player.hand === undefined, "watcher still must not receive hands after a draw");
  }
  console.log("[ok] watcher follows authoritative play and draw without hands");

  await send(alice, matchId, OP.RESIGN, {});
  const watcherOver = await waitFor(
    watcher.socket,
    (m) => m.op === OP.GAME_OVER,
    "watcher game over",
  );
  assert(watcherOver.data.status === "finished", "watcher should see a finished result");
  assert(
    watcherOver.data.winnerUserId === bob.session.user_id,
    "watcher should see the public winner",
  );
  const watcherFinal = await waitState(
    watcher.socket,
    "watcher final state",
    (state) => state.result?.winnerUserId === bob.session.user_id,
  );
  for (const player of watcherFinal.data.players) {
    assert(player.hand === undefined, "watcher final state stays hand-free");
  }
  console.log("[ok] watcher receives the public result and final state");
}

async function reconnectResign() {
  const { alice, bob, matchId } = await quickPair("reconnect");
  const aliceStart = await waitForStart(alice, "reconnect alice");
  const bobStart = await waitForStart(bob, "reconnect bob");
  const before = seatOf(bobStart.data, bob);
  assert(aliceStart.data.started === true, "reconnect table should be started");
  const expectedBefore = before?.seat === 0 ? HAND_SIZE + 2 : HAND_SIZE;
  assert(before?.hand?.length === expectedBefore, "bob should have a full hand before leaving");

  bob.socket.disconnect(false);
  await waitFor(
    alice.socket,
    (m) => m.op === OP.PLAYER_LEFT && m.data.userId === bob.session.user_id,
    "alice sees bob leave",
    ERROR_TIMEOUT_MS,
  );
  const reconnectSocket = bob.client.createSocket(USE_SSL, false);
  attachCollector(reconnectSocket, "bob-reconnected");
  await reconnectSocket.connect(bob.session, true);
  connections.push({ label: "bob-reconnected", client: bob.client, session: bob.session, socket: reconnectSocket });
  await reconnectSocket.joinMatch(matchId);
  const restored = await waitState(
    reconnectSocket,
    "reconnected state",
    (state) =>
      state.players.some(
        (player) => player.userId === bob.session.user_id && player.connected === true,
      ),
  );
  const after = seatOf(restored.data, bob);
  assert(after?.seat === before.seat, "reconnect should restore the same seat");
  assert(after.username === before.username, "reconnect should restore the username");
  assert(after.count === before.count, "reconnect should restore the hand count");
  assert(after.hand?.length === before.hand.length, "reconnect should restore the hand");
  console.log("[ok] reconnect restores the seat and hand within grace");

  await send(alice, matchId, OP.RESIGN, {});
  const aliceOver = await waitFor(
    alice.socket,
    (m) => m.op === OP.GAME_OVER,
    "alice game over after reconnect",
  );
  const bobOver = await waitFor(
    reconnectSocket,
    (m) => m.op === OP.GAME_OVER,
    "bob game over after reconnect",
  );
  assert(aliceOver.data.winnerUserId === bob.session.user_id, "alice should see bob win");
  assert(bobOver.data.winnerUserId === bob.session.user_id, "bob should see himself win");
  console.log("[ok] resignation after reconnect is authoritative for both sockets");
}

async function sevenOBattle() {
  const alice = await authenticate("seven-o-alice");
  const bob = await authenticate("seven-o-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 58,
    rulesMode: "sevenO",
  });
  assert(
    created?.ok === true && created.rulesMode === "sevenO" && typeof created.matchId === "string",
    `sevenO room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `sevenO room code failed: ${JSON.stringify(resolved)}`,
  );

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "sevenO alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "sevenO bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  assert(aliceStart.data.rulesMode === "sevenO", "sevenO mode must be in state");
  assert(bobStart.data.rulesMode === "sevenO", "sevenO mode must reach both clients");
  assert(aliceStart.data.turn === 0, "seed 58 should start at seat 0");
  assert(legalCardIds(aliceStart.data).includes("yellow-7-0"), "seed 58 should offer a yellow 7");
  assert(legalCardIds(aliceStart.data).includes("yellow-0-0"), "seed 58 should offer a yellow 0");

  const aliceBefore = seatOf(aliceStart.data, alice).hand.map((card) => card.id);
  const bobBefore = seatOf(bobStart.data, bob).hand.map((card) => card.id);
  await send(alice, matchId, OP.PLAY_REQUEST, {
    cardId: "yellow-7-0",
    targetId: bob.session.user_id,
  });
  await waitState(
    alice.socket,
    "sevenO state after seven",
    (state) => seatOf(state, alice)?.count === HAND_SIZE,
  );
  const sevenState = await waitState(
    bob.socket,
    "sevenO bob state after seven",
    (state) => seatOf(state, bob)?.count === HAND_SIZE - 1,
  );
  const bobAfterSeven = seatOf(sevenState.data, bob).hand?.map((card) => card.id) ?? [];
  assert(
    bobAfterSeven.includes("yellow-0-0"),
    "the 7 swap should move Alice's yellow 0 into Bob's hand",
  );
  assert(!bobAfterSeven.includes("yellow-7-0"), "the played 7 should leave both hands");
  assert(bobAfterSeven.length === 6, "Bob should hold Alice's six remaining cards");
  assert(aliceBefore.includes("yellow-7-0") && bobBefore.length === HAND_SIZE, "starting hands");
  console.log("[ok] Seven-O 7 swaps hands on the live server");

  await send(bob, matchId, OP.PLAY_REQUEST, { cardId: "yellow-0-0" });
  const zeroState = await waitState(
    bob.socket,
    "sevenO state after zero",
    (state) => seatOf(state, bob)?.count === HAND_SIZE,
  );
  const aliceZeroState = await waitState(
    alice.socket,
    "sevenO alice state after zero",
    (state) => seatOf(state, alice)?.count === HAND_SIZE - 2,
  );
  assert(aliceZeroState.data.turn === 0, "play should advance back to seat 0 after the 0");
  assert(zeroState.data.topCard?.id === "yellow-0-0", "the 0 should be on the discard pile");
  const aliceAfterZero = seatOf(aliceZeroState.data, alice).hand?.map((card) => card.id) ?? [];
  assert(
    aliceAfterZero.length === 5 && !aliceAfterZero.includes("yellow-0-0"),
    "the 0 rotation should give Alice Bob's five-card hand",
  );
  console.log("[ok] Seven-O 0 rotates every hand on the live server");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "sevenO game over", STATE_TIMEOUT_MS);
}

async function progressiveRoom() {
  const alice = await authenticate("progressive-alice");
  const bob = await authenticate("progressive-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 25,
    rulesMode: "progressive",
  });
  assert(
    created?.ok === true && created.rulesMode === "progressive" && typeof created.matchId === "string",
    `progressive room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `progressive room code failed: ${JSON.stringify(resolved)}`,
  );

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "progressive alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "progressive bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  assert(aliceStart.data.rulesMode === "progressive", "progressive mode must reach alice");
  assert(bobStart.data.rulesMode === "progressive", "progressive mode must reach bob");
  assert(aliceStart.data.turn === 0, "seed 25 should start at seat 0");
  assert(legalCardIds(aliceStart.data).includes("yellow-draw2-0"), "seed 25 should offer Draw Two");
  assert(
    seatOf(bobStart.data, bob).hand.some((card) => card.id === "red-draw2-0"),
    "Bob should hold a Draw Two to answer the stack",
  );
  console.log("[ok] progressive private room reports rulesMode on both clients");

  await send(alice, matchId, OP.PLAY_REQUEST, { cardId: "yellow-draw2-0" });
  const aliceStack = await waitState(
    alice.socket,
    "progressive stack after first draw two",
    (state) => state.pendingStack?.kind === "draw2" && state.pendingStack.amount === 2,
  );
  const bobStack = await waitState(
    bob.socket,
    "progressive bob stack",
    (state) => state.pendingStack?.kind === "draw2" && state.pendingStack.amount === 2,
  );
  assert(aliceStack.data.pendingStack.targetId === bob.session.user_id, "stack targets Bob");
  assert(bobStack.data.pendingStack.ownerId === alice.session.user_id, "Alice owns the stack");
  assert(legalCardIds(bobStack.data).includes("red-draw2-0"), "Bob should be allowed to stack");
  console.log("[ok] Progressive Draw Two opens an authoritative stack");

  await send(bob, matchId, OP.PLAY_REQUEST, { cardId: "red-draw2-0" });
  const aliceDouble = await waitState(
    alice.socket,
    "progressive doubled stack",
    (state) => state.pendingStack?.amount === 4 && state.pendingStack.ownerId === bob.session.user_id,
  );
  const bobDouble = await waitState(
    bob.socket,
    "progressive bob doubled stack",
    (state) => state.pendingStack?.amount === 4 && state.pendingStack.ownerId === bob.session.user_id,
  );
  assert(aliceDouble.data.pendingStack.targetId === alice.session.user_id, "stack returns to Alice");
  assert(bobDouble.data.pendingStack.kind === "draw2", "stack kind remains draw2");
  console.log("[ok] Progressive Draw Two stacks and doubles the penalty");

  const countBefore = seatOf(aliceDouble.data, alice).count;
  await send(alice, matchId, OP.DRAW_REQUEST, {});
  const taken = await waitState(
    bob.socket,
    "progressive stack taken",
    (state) => state.pendingStack == null && seatOf(state, alice)?.count === countBefore + 4,
  );
  assert(taken.data.pendingStack == null, "taking clears the pending stack");
  console.log("[ok] Progressive stack resolves with accumulated draw");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "progressive game over", STATE_TIMEOUT_MS);
}

async function jumpInRoom() {
  const alice = await authenticate("jumpin-alice");
  const bob = await authenticate("jumpin-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 10,
    rulesMode: "jumpIn",
  });
  assert(
    created?.ok === true && created.rulesMode === "jumpIn" && typeof created.matchId === "string",
    `jumpIn room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `jumpIn room code failed: ${JSON.stringify(resolved)}`,
  );

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "jumpIn alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "jumpIn bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  assert(aliceStart.data.rulesMode === "jumpIn", "jumpIn mode must reach alice");
  assert(bobStart.data.rulesMode === "jumpIn", "jumpIn mode must reach bob");
  assert(legalCardIds(aliceStart.data).includes("yellow-8-0"), "seed 10 should offer yellow 8");
  assert(
    seatOf(bobStart.data, bob).hand.some((card) => card.id === "yellow-8-1"),
    "Bob should hold the matching yellow 8",
  );
  console.log("[ok] jumpIn private room reports rulesMode on both clients");

  await send(alice, matchId, OP.PLAY_REQUEST, { cardId: "yellow-8-0" });
  const aliceWindow = await waitState(
    alice.socket,
    "jumpIn alice window",
    (state) => state.jumpWindow?.ownerId === alice.session.user_id,
  );
  const bobWindow = await waitState(
    bob.socket,
    "jumpIn bob window",
    (state) => state.jumpWindow?.ownerId === alice.session.user_id,
  );
  assert(aliceWindow.data.jumpWindow.cardId === "yellow-8-0", "window card should be Alice's 8");
  assert(legalCardIds(bobWindow.data).includes("yellow-8-1"), "Bob should be allowed to jump");
  console.log("[ok] Jump-In opens a short exact-match jump window");

  const bobBefore = seatOf(bobWindow.data, bob).count;
  await send(bob, matchId, OP.PLAY_REQUEST, { cardId: "yellow-8-1", jump: true });
  const aliceJump = await waitState(
    alice.socket,
    "jumpIn alice after jump",
    (state) => state.topCard?.id === "yellow-8-1",
  );
  const bobJump = await waitState(
    bob.socket,
    "jumpIn bob after jump",
    (state) => state.topCard?.id === "yellow-8-1",
  );
  assert(seatOf(bobJump.data, bob).count === bobBefore - 1, "jumping removes the played card");
  assert(
    bobJump.data.jumpWindow?.ownerId === bob.session.user_id,
    "the jumper owns the next window",
  );
  assert(aliceJump.data.jumpWindow?.ownerId === bob.session.user_id, "both clients see new window");
  console.log("[ok] Jump-In lets the next player play out of turn and keeps the jump alive");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "jumpIn game over", STATE_TIMEOUT_MS);
}

async function attackRoom() {
  const alice = await authenticate("attack-alice");
  const bob = await authenticate("attack-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 31,
    rulesMode: "attack",
  });
  assert(
    created?.ok === true && created.rulesMode === "attack" && typeof created.matchId === "string",
    `attack room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `attack room code failed: ${JSON.stringify(resolved)}`,
  );

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "attack alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "attack bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  assert(aliceStart.data.rulesMode === "attack", "attack mode must reach alice");
  assert(bobStart.data.rulesMode === "attack", "attack mode must reach bob");
  assert(aliceStart.data.turn === 0, "seed 31 should start at seat 0");
  assert(aliceStart.data.topCard?.id === "yellow-1-1", "seed 31 starter should be yellow 1");
  assert(aliceStart.data.pendingHit == null, "no pending hit at the start");
  assert(legalCardIds(aliceStart.data).includes("yellow-hit1-0"), "Alice should be able to play a Hit card");
  assert(
    seatOf(bobStart.data, bob).hand.some((card) => card.id === "green-hit1-0"),
    "Bob should hold a Hit card to deflect",
  );
  console.log("[ok] attack private room reports rulesMode and a deterministic hit setup on both clients");

  await send(alice, matchId, OP.PLAY_REQUEST, { cardId: "yellow-hit1-0" });
  const aliceHit = await waitState(
    alice.socket,
    "attack first hit on alice",
    (state) => state.pendingHit?.amount === 1,
  );
  const bobHit = await waitState(
    bob.socket,
    "attack first hit on bob",
    (state) => state.pendingHit?.amount === 1,
  );
  for (const [state, label] of [[aliceHit.data, "alice"], [bobHit.data, "bob"]]) {
    assert(state.pendingHit.targetId === bob.session.user_id, `${label}: first hit should target Bob`);
    assert(state.pendingHit.ownerId === alice.session.user_id, `${label}: Alice should own the first hit`);
    assert(state.turn === 1, `${label}: the hit target should hold the turn`);
  }
  assert(legalCardIds(bobHit.data).includes("green-hit1-0"), "Bob should be allowed to deflect");
  console.log("[ok] a Hit card opens an authoritative pending hit aimed at the next player");

  await send(bob, matchId, OP.PLAY_REQUEST, { cardId: "green-hit1-0" });
  const aliceDeflected = await waitState(
    alice.socket,
    "attack deflected hit on alice",
    (state) => state.pendingHit?.amount === 2 && state.pendingHit.targetId === alice.session.user_id,
  );
  const bobDeflected = await waitState(
    bob.socket,
    "attack deflected hit on bob",
    (state) => state.pendingHit?.amount === 2 && state.pendingHit.targetId === alice.session.user_id,
  );
  for (const [state, label] of [[aliceDeflected.data, "alice"], [bobDeflected.data, "bob"]]) {
    assert(state.pendingHit.ownerId === bob.session.user_id, `${label}: Bob should own the deflected hit`);
    assert(state.turn === 0, `${label}: the deflected target should hold the turn`);
    assert(state.topCard?.id === "green-hit1-0", `${label}: the deflect card should be on top`);
  }
  console.log("[ok] a Hit deflection adds to the hit and redirects it");

  const before = seatOf(aliceDeflected.data, alice).count;
  await send(alice, matchId, OP.DRAW_REQUEST, {});
  const postTake = (state) => state.pendingHit == null
    && state.topCard?.id === "green-hit1-0"
    && state.turn === 1;
  const taken = await waitState(
    bob.socket,
    "attack hit taken on bob",
    postTake,
  );
  const takenAlice = await waitState(
    alice.socket,
    "attack hit taken on alice",
    postTake,
  );
  for (const [state, label] of [[taken.data, "bob"], [takenAlice.data, "alice"]]) {
    assert(state.turn === 1, `${label}: taking the hit should pass the turn to the deflector`);
    const after = seatOf(state, alice).count;
    assert(
      after >= before && after <= before + 6,
      `${label}: launcher draw should be 0..6 cards for a two-count hit, got ${after - before}`,
    );
  }
  console.log("[ok] taking a hit resolves the launcher draw on both clients");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "attack game over", STATE_TIMEOUT_MS);
}

async function noMercyRoom() {
  const alice = await authenticate("no-mercy-alice");
  const bob = await authenticate("no-mercy-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 13,
    rulesMode: "noMercy",
  });
  if (created?.error?.code === "invalid_rules_mode") {
    console.log(
      `[skip] noMercy is not deployed on this server (${created.error.message}); skipping the battle scenario`,
    );
    return;
  }
  assert(
    created?.ok === true && created.rulesMode === "noMercy" && typeof created.matchId === "string",
    `noMercy room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `noMercy room code failed: ${JSON.stringify(resolved)}`,
  );

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "noMercy alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "noMercy bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  assert(aliceStart.data.rulesMode === "noMercy", "noMercy mode must reach alice");
  assert(bobStart.data.rulesMode === "noMercy", "noMercy mode must reach bob");
  assert(
    aliceStart.data.deckCount === 153,
    `noMercy deck should hold 153 cards after dealing 14 and flipping a starter, got ${aliceStart.data.deckCount}`,
  );
  assert(aliceStart.data.topCard?.id === "yellow-2-0", "seed 13 starter should be a yellow 2");
  assert(legalCardIds(aliceStart.data).includes("wilddraw6-1"), "seed 13 should offer Wild Draw Six");
  assert(legalCardIds(aliceStart.data).includes("wildroulette-3"), "seed 13 should offer Wild Roulette");
  assert(
    aliceStart.data.players.every((player) => player.out === false),
    "no seat starts out",
  );
  console.log("[ok] No Mercy private room reports rulesMode and a 168-card setup");

  await send(alice, matchId, OP.PLAY_REQUEST, {
    cardId: "wilddraw6-1",
    chosenColor: "red",
  });
  const stackPredicate = (state) =>
    state.pendingStack?.kind === "wildDraw6" &&
    state.pendingStack.amount === 6 && state.pendingStack.value === 6;
  const aliceStack = await waitState(alice.socket, "noMercy alice stack", stackPredicate);
  const bobStack = await waitState(bob.socket, "noMercy bob stack", stackPredicate);
  for (const [state, label] of [[aliceStack.data, "alice"], [bobStack.data, "bob"]]) {
    assert(state.pendingStack.targetId === bob.session.user_id, `${label}: +6 stack should target Bob`);
    assert(state.pendingStack.ownerId === alice.session.user_id, `${label}: Alice should own the +6 stack`);
    assert(state.currentColor === "red", `${label}: the chosen colour should apply`);
  }
  console.log("[ok] No Mercy Wild Draw Six opens an authoritative stack with value 6");

  const bobBefore = seatOf(bobStack.data, bob).count;
  await send(bob, matchId, OP.DRAW_REQUEST, {});
  const taken = await waitState(
    alice.socket,
    "noMercy stack taken",
    (state) => state.pendingStack == null && seatOf(state, bob)?.count === bobBefore + 6,
  );
  assert(taken.data.turn === 0, "taking the stack should return the turn to Alice");
  console.log("[ok] No Mercy stack resolves with the accumulated six cards");

  await send(alice, matchId, OP.PLAY_REQUEST, { cardId: "wildroulette-3" });
  const roulettePredicate = (state) => state.pendingRoulette?.chooserId === bob.session.user_id;
  const aliceRoulette = await waitState(alice.socket, "noMercy alice roulette", roulettePredicate);
  const bobRoulette = await waitState(bob.socket, "noMercy bob roulette", roulettePredicate);
  assert(
    aliceRoulette.data.pendingRoulette.ownerId === alice.session.user_id,
    "Alice should own the roulette card",
  );
  assert(bobRoulette.data.turn === 1, "the chooser should hold the turn during roulette");
  console.log("[ok] No Mercy Wild Colour Roulette opens with the next player as chooser");

  await send(bob, matchId, OP.COLOR_CHOOSE, { colour: "yellow" });
  const rouletteDone = (state) => state.pendingRoulette == null && state.turn === 0;
  await waitState(alice.socket, "noMercy alice roulette resolved", rouletteDone);
  await waitState(bob.socket, "noMercy bob roulette resolved", rouletteDone);
  console.log("[ok] opcode 108 resolves Wild Colour Roulette on both clients");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "noMercy game over", STATE_TIMEOUT_MS);
}

async function flipRoom() {
  const alice = await authenticate("flip-alice");
  const bob = await authenticate("flip-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 19,
    rulesMode: "flip",
  });
  if (created?.error?.code === "invalid_rules_mode") {
    console.log(
      `[skip] flip is not deployed on this server (${created.error.message}); skipping the battle scenario`,
    );
    return;
  }
  assert(
    created?.ok === true && created.rulesMode === "flip" && typeof created.matchId === "string",
    `flip room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  const resolved = await rpc(bob, "moongames_room_code_resolve", {
    code: created.roomCode,
    gameId: "uno",
  });
  assert(
    resolved?.ok === true && resolved.matchId === matchId,
    `flip room code failed: ${JSON.stringify(resolved)}`,
  );

  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "flip alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "flip bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  for (const [state, label] of [[aliceStart.data, "alice"], [bobStart.data, "bob"]]) {
    assert(state.rulesMode === "flip", `${label}: flip mode must reach the client`);
    assert(state.flipSide === "light", `${label}: flip rooms must start on the light side`);
    assert(state.currentColor === "yellow", `${label}: seed 19 starter colour`);
    assert(state.topCard?.id === "light-yellow-1-1", `${label}: seed 19 starter card`);
  }
  assert(seatOf(aliceStart.data, alice)?.seat === 0, "the creator should hold seat 0");
  assert(
    legalCardIds(aliceStart.data).includes("light-yellow-9-1"),
    "seed 19 should offer a light yellow 9 to Alice",
  );
  assert(
    seatOf(bobStart.data, bob).hand.some((card) => card.id === "light-yellow-flip-0"),
    "Bob should hold the light yellow Flip card",
  );
  console.log("[ok] flip private room starts on the light side on both clients");

  await send(alice, matchId, OP.PLAY_REQUEST, { cardId: "light-yellow-9-1" });
  const alicePlayed = await waitState(
    alice.socket,
    "flip alice played a number",
    (state) => state.topCard?.id === "light-yellow-9-1" && state.turn === 1,
  );
  const bobPlayed = await waitState(
    bob.socket,
    "flip bob sees the number",
    (state) => state.topCard?.id === "light-yellow-9-1" && state.turn === 1,
  );
  assert(alicePlayed.data.flipSide === "light", "the number play should keep the light side");
  assert(bobPlayed.data.flipSide === "light", "the number play should keep the light side on both clients");
  assert(
    legalCardIds(bobPlayed.data).includes("light-yellow-flip-0"),
    "Bob should be able to play the Flip card after Alice's number",
  );
  console.log("[ok] a legal light-side number is applied on both clients");

  await send(bob, matchId, OP.PLAY_REQUEST, { cardId: "light-yellow-flip-0" });
  const flipped = (state) => state.flipSide === "dark";
  const aliceFlipped = await waitState(alice.socket, "flip alice sees dark side", flipped);
  const bobFlipped = await waitState(bob.socket, "flip bob sees dark side", flipped);
  for (const [state, label] of [[aliceFlipped.data, "alice"], [bobFlipped.data, "bob"]]) {
    assert(state.currentColor === "orange", `${label}: flipping yellow should select orange`);
    assert(state.topCard?.id === "dark-orange-1-1", `${label}: the starter should flip to dark orange`);
    for (const player of state.players) {
      if (player.hand === undefined) continue;
      assert(
        player.hand.every((card) => card.id.startsWith("dark-")),
        `${label}: ${player.username} should hold dark-side cards after the flip`,
      );
    }
  }
  console.log("[ok] a Flip card turns both clients to the dark side");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "flip game over", STATE_TIMEOUT_MS);
}

async function swapPackBattle() {
  const alice = await authenticate("swap-pack-alice");
  const bob = await authenticate("swap-pack-bob");
  const created = await rpc(alice, "uno_create_private_match", {
    seats: 2,
    seed: 37,
    rulesMode: "swapPack",
  });
  assert(
    created?.ok === true && created.rulesMode === "swapPack" && typeof created.matchId === "string",
    `swap pack room creation failed: ${JSON.stringify(created)}`,
  );
  const matchId = created.matchId;
  await alice.socket.joinMatch(matchId);
  await bob.socket.joinMatch(matchId);
  const aliceStart = await waitState(
    alice.socket,
    "swap pack alice start",
    (state) => state.started === true && state.players.length === 2,
  );
  const bobStart = await waitState(
    bob.socket,
    "swap pack bob start",
    (state) => state.started === true && state.players.length === 2,
  );
  assert(aliceStart.data.rulesMode === "swapPack", "swap pack mode must reach alice");
  assert(bobStart.data.rulesMode === "swapPack", "swap pack mode must reach bob");
  assert(aliceStart.data.deckCount === 109, "swap pack deck should hold 124 cards");
  assert(legalCardIds(aliceStart.data).includes("yellow-swap1-0"), "seed 37 should offer Swap 1");

  const giveCard = seatOf(aliceStart.data, alice).hand.find((card) => card.id !== "yellow-swap1-0");
  assert(giveCard !== undefined, "Alice should have a card to give");
  await send(alice, matchId, OP.PLAY_REQUEST, {
    cardId: "yellow-swap1-0",
    targetId: bob.session.user_id,
    giveCardId: giveCard.id,
  });
  const aliceSwapped = await waitState(
    alice.socket,
    "swap pack alice after swap",
    (state) => state.topCard?.id === "yellow-swap1-0",
  );
  const bobSwapped = await waitState(
    bob.socket,
    "swap pack bob after swap",
    (state) => state.topCard?.id === "yellow-swap1-0",
  );
  const bobHand = seatOf(bobSwapped.data, bob).hand ?? [];
  assert(bobHand.some((card) => card.id === giveCard.id), "the given card must reach the target");
  assert(seatOf(aliceSwapped.data, alice).count === 6, "the actor plays one card and trades one card");
  assert(seatOf(bobSwapped.data, bob).count === 7, "the target trades one card and receives one card");
  console.log("[ok] Swap Pack Swap 1 exchanges a card on the live server");

  await send(alice, matchId, OP.RESIGN, {});
  await waitFor(alice.socket, (m) => m.op === OP.GAME_OVER, "swap pack game over", STATE_TIMEOUT_MS);
}

async function noEagerQuick() {
  const solo = await authenticate("no-eager-quick");
  let rejected = false;
  let payload = null;
  try {
    const response = await solo.client.rpc(solo.session, "uno_quick_match", {});
    payload = response.payload;
  } catch (error) {
    rejected = true;
  }
  assert(
    rejected || payload?.ok === false || payload?.error != null,
    `uno_quick_match should not be callable: ${JSON.stringify(payload)}`,
  );
  console.log("[ok] there is no eager quick-match RPC");
}

async function main() {
  try {
    await quickMatchAndPlay();
    await privateRoomCodeAndSpectator();
    await reconnectResign();
    await sevenOBattle();
    await progressiveRoom();
    await jumpInRoom();
    await attackRoom();
    await noMercyRoom();
    await flipRoom();
    await swapPackBattle();
    await noEagerQuick();
  } finally {
    for (const connection of connections) {
      try {
        connection.socket.disconnect(false);
      } catch (error) {
        console.error(`${connection.label}: disconnect failed: ${error.message}`);
      }
    }
  }
}

main()
  .then(() => {
    console.log("[ok] Uno online smoke passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
