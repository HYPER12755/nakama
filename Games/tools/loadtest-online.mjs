#!/usr/bin/env node
// Controlled online load simulation across Chess, Carrom and Ludo.
// Usage: node tools/loadtest-online.mjs [rooms] [actionsPerGame]

import { performance } from "node:perf_hooks";
import { Client } from "../Chess/web/node_modules/@heroiclabs/nakama-js/dist/nakama-js.esm.mjs";

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const SERVER_KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const USE_SSL = process.env.NAKAMA_SSL === "true";
const ROOMS = Math.max(1, Number(process.argv[2] ?? 2));
const ACTIONS = Math.max(1, Number(process.argv[3] ?? 3));
const RUN_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const decoder = new TextDecoder();

const OP = {
  chess: { STATE: 1, MOVE: 3, ERROR: 7, CHAT: 14, MOVE_REQUEST: 101, CHAT_SEND: 108 },
  carrom: { STATE: 1, SHOT: 2, ERROR: 4, CHAT: 8, SHOT_REQUEST: 101, CHAT_SEND: 103 },
  ludo: { STATE: 1, ROLL: 2, MOVE: 3, ERROR: 5, CHAT: 9, ROLL_REQUEST: 101, MOVE_REQUEST: 102, CHAT_SEND: 104 },
};

function decode(data) {
  if (typeof data === "string") return JSON.parse(data);
  return JSON.parse(decoder.decode(data));
}

function collector(socket, label, timings, errors) {
  const queue = [];
  const waiters = [];
  socket.onmatchdata = (message) => {
    const entry = { op: message.op_code, data: decode(message.data), at: performance.now() };
    if ([4, 5, 7].includes(message.op_code) && typeof entry.data?.message === "string") {
      errors.push(`${label}: server error: ${entry.data.message}`);
    }
    queue.push(entry);
    if (queue.length > 200) queue.shift();
    for (let i = waiters.length - 1; i >= 0; i -= 1) {
      if (waiters[i].predicate(entry)) {
        waiters.splice(i, 1)[0].resolve(entry);
      }
    }
  };
  return {
    label,
    queue,
    wait(predicate, description, sentAt = 0, timeoutMs = 8000) {
      const existing = queue.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          timer: 0,
          resolve: (entry) => {
            clearTimeout(waiter.timer);
            if (Number.isFinite(sentAt) && sentAt > 0) {
              timings.push({ name: description, ms: Math.max(0, entry.at - sentAt) });
            }
            resolve(entry);
          },
        };
        waiter.timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          errors.push(`${label}: timed out waiting for ${description}`);
          reject(new Error(`${label}: timed out waiting for ${description}`));
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
  };
}

async function authenticate(id) {
  const client = new Client(SERVER_KEY, HOST, PORT, USE_SSL);
  const session = await client.authenticateDevice(id, true);
  const socket = client.createSocket(USE_SSL, false);
  await socket.connect(session, true);
  return { client, session, socket };
}

async function createRoom(game, connection, seats) {
  const rpc = {
    chess: "chess_create_private_match",
    carrom: "carrom_create_private_match",
    ludo: "ludo_create_private_match",
  }[game];
  const payload = game === "chess"
    ? { timeControl: { initialMs: 300000, incrementMs: 0 } }
    : { seats };
  const started = performance.now();
  const response = await connection.client.rpc(connection.session, rpc, payload);
  if (response.payload?.ok !== true || typeof response.payload.matchId !== "string") {
    throw new Error(`${game}: create room failed: ${JSON.stringify(response.payload)}`);
  }
  timings.push({ name: `${game}.create`, ms: performance.now() - started });
  return response.payload.matchId;
}

const timings = [];
const errors = [];

async function runChessRoom(index) {
  const players = [];
  try {
    const alice = await authenticate(`load-chess-${RUN_ID}-${index}-a`);
    const bob = await authenticate(`load-chess-${RUN_ID}-${index}-b`);
    players.push(alice, bob);
    const aEvents = collector(alice.socket, "chess-a", timings, errors);
    const bEvents = collector(bob.socket, "chess-b", timings, errors);
    const matchId = await createRoom("chess", alice, 2);
    await alice.socket.joinMatch(matchId);
    await bob.socket.joinMatch(matchId);
    await aEvents.wait((m) => m.op === OP.chess.STATE && m.data?.match?.started, "chess start");
    const sentAt = performance.now();
    await alice.socket.sendMatchState(matchId, OP.chess.MOVE_REQUEST, JSON.stringify({ from: "e2", to: "e4" }));
    const reply = await aEvents.wait(
      (m) => m.op === OP.chess.MOVE || m.op === OP.chess.ERROR,
      "chess move reply",
      sentAt,
    );
    if (reply.op === OP.chess.ERROR) throw new Error(`chess move rejected: ${reply.data?.message ?? "unknown"}`);
    for (let action = 1; action < ACTIONS; action += 1) {
      const sender = action % 2 === 0 ? alice : bob;
      const text = `chess load ${RUN_ID} ${index} ${action}`;
      const chatSentAt = performance.now();
      await sender.socket.sendMatchState(matchId, OP.chess.CHAT_SEND, JSON.stringify({ text }));
      await bEvents.wait((m) => m.op === OP.chess.CHAT && m.data?.text === text, "chess chat", chatSentAt);
    }
    void aEvents;
  } catch (cause) {
    errors.push(`chess room ${index}: ${cause.message}`);
  } finally {
    for (const player of players) player.socket.disconnect(false);
  }
}

async function runCarromRoom(index) {
  const players = [];
  try {
    const alice = await authenticate(`load-carrom-${RUN_ID}-${index}-a`);
    const bob = await authenticate(`load-carrom-${RUN_ID}-${index}-b`);
    players.push(alice, bob);
    const aEvents = collector(alice.socket, "carrom-a", timings, errors);
    const bEvents = collector(bob.socket, "carrom-b", timings, errors);
    const matchId = await createRoom("carrom", alice, 2);
    await bob.socket.joinMatch(matchId);
    await alice.socket.joinMatch(matchId);
    await aEvents.wait((m) => m.op === OP.carrom.STATE && m.data?.game?.discs?.length > 0, "carrom start");
    const sentAt = performance.now();
    await alice.socket.sendMatchState(matchId, OP.carrom.SHOT_REQUEST, JSON.stringify({
      position: 0.5,
      angle: -Math.PI / 2,
      power: 0.8,
    }));
    await bEvents.wait(
      (m) => m.op === OP.carrom.STATE && (m.data?.shotSerial ?? 0) >= 1,
      "carrom shot reply",
      sentAt,
    );
    for (let action = 1; action < ACTIONS; action += 1) {
      const sender = action % 2 === 0 ? alice : bob;
      const text = `carrom load ${RUN_ID} ${index} ${action}`;
      const chatSentAt = performance.now();
      await sender.socket.sendMatchState(matchId, OP.carrom.CHAT_SEND, JSON.stringify({ text }));
      await bEvents.wait((m) => m.op === OP.carrom.CHAT && m.data?.text === text, "carrom chat", chatSentAt);
    }
    void aEvents;
  } catch (cause) {
    errors.push(`carrom room ${index}: ${cause.message}`);
  } finally {
    for (const player of players) player.socket.disconnect(false);
  }
}

async function runLudoRoom(index) {
  const players = [];
  try {
    const alice = await authenticate(`load-ludo-${RUN_ID}-${index}-a`);
    const bob = await authenticate(`load-ludo-${RUN_ID}-${index}-b`);
    players.push(alice, bob);
    const aEvents = collector(alice.socket, "ludo-a", timings, errors);
    const bEvents = collector(bob.socket, "ludo-b", timings, errors);
    const matchId = await createRoom("ludo", alice, 2);
    await bob.socket.joinMatch(matchId);
    await alice.socket.joinMatch(matchId);
    const state = await aEvents.wait((m) => m.op === OP.ludo.STATE && m.data?.seats?.length === 2, "ludo start");
    const currentColour = state.data.game.players[state.data.game.current].color;
    const activeSeat = state.data.seats.find((seat) => seat.colour === currentColour);
    const active = activeSeat?.user_id === alice.session.user_id ? alice : bob;
    const activeEvents = active === alice ? aEvents : bEvents;
    const sentAt = performance.now();
    await active.socket.sendMatchState(matchId, OP.ludo.ROLL_REQUEST, JSON.stringify({}));
    await activeEvents.wait((m) => m.op === OP.ludo.ROLL, "ludo roll reply", sentAt);
    const idle = active === alice ? bob : alice;
    const idleEvents = idle === alice ? aEvents : bEvents;
    for (let action = 1; action < ACTIONS; action += 1) {
      const sender = action % 2 === 0 ? active : idle;
      const text = `ludo load ${RUN_ID} ${index} ${action}`;
      const chatSentAt = performance.now();
      await sender.socket.sendMatchState(matchId, OP.ludo.CHAT_SEND, JSON.stringify({ text }));
      await idleEvents.wait((m) => m.op === OP.ludo.CHAT && m.data?.text === text, "ludo chat", chatSentAt);
    }
  } catch (cause) {
    errors.push(`ludo room ${index}: ${cause.message}`);
  } finally {
    for (const player of players) player.socket.disconnect(false);
  }
}

async function main() {
  const started = performance.now();
  await Promise.all([
    ...Array.from({ length: ROOMS }, (_, i) => runChessRoom(i)),
    ...Array.from({ length: ROOMS }, (_, i) => runCarromRoom(i)),
    ...Array.from({ length: ROOMS }, (_, i) => runLudoRoom(i)),
  ]);
  const summarise = (rows) => {
    const sorted = rows.map((row) => row.ms).sort((a, b) => a - b);
    const p = (q) => sorted.length === 0 ? 0 : Math.round(sorted[Math.floor((sorted.length - 1) * q)]);
    return { count: sorted.length, p50: p(0.5), p95: p(0.95), max: Math.round(sorted.at(-1) ?? 0) };
  };
  const byName = new Map();
  for (const row of timings) {
    const bucket = byName.get(row.name) ?? [];
    bucket.push(row);
    byName.set(row.name, bucket);
  }
  const breakdown = Object.fromEntries(
    [...byName.entries()]
      .map(([name, rows]) => [name, summarise(rows)])
      .sort((a, b) => b[1].p95 - a[1].p95),
  );
  console.log(JSON.stringify({
    roomsPerGame: ROOMS,
    clients: ROOMS * 6,
    actionsPerRoom: ACTIONS,
    elapsedMs: Math.round(performance.now() - started),
    operations: timings.length,
    latencyMs: summarise(timings),
    breakdown,
    errors: errors.slice(0, 12),
    errorCount: errors.length,
  }, null, 2));
  if (errors.length > 0) process.exitCode = 1;
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
