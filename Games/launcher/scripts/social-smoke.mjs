#!/usr/bin/env node
/**
 * Local Nakama smoke test for the launcher's social layer.
 *
 * It creates two disposable device accounts, exchanges a friend request,
 * accepts it, joins the same persisted direct-chat channel from both sides,
 * and verifies live delivery plus history. No browser or database reset needed.
 */
import { Client } from "@heroiclabs/nakama-js";

const serverUrl = process.env.NAKAMA_URL ?? "http://127.0.0.1:7350";
const serverKey = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";
const parsed = new URL(serverUrl);
const useSSL = parsed.protocol === "https:";
const client = new Client(
  serverKey,
  parsed.hostname,
  parsed.port || (useSSL ? "443" : "80"),
  useSSL,
);

const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const names = {
  alpha: `mga${suffix}`.slice(0, 20),
  beta: `mgb${suffix}`.slice(0, 20),
};

function fail(message) {
  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connect(name, deviceId) {
  const session = await client.authenticateDevice(deviceId, true);
  await client.updateAccount(session, { username: name });
  const socket = client.createSocket(useSSL, false);
  await socket.connect(session, true);
  return { name, session, socket };
}

async function friendState(session, userId) {
  const result = await client.listFriends(session);
  return result.friends?.find((friend) => friend.user?.id === userId)?.state;
}

async function waitForMessage(socket, channelId, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const previous = socket.onchannelmessage;
    const timer = setTimeout(() => {
      socket.onchannelmessage = previous;
      reject(new Error("Timed out waiting for the direct-chat message."));
    }, timeoutMs);
    socket.onchannelmessage = (message) => {
      if (message.channel_id === channelId) {
        clearTimeout(timer);
        socket.onchannelmessage = previous;
        resolve(message);
      }
    };
  });
}

async function main() {
  console.log(`Nakama social smoke test → ${serverUrl}`);
  const alpha = await connect(names.alpha, `launcher-smoke-a-${suffix}`);
  const beta = await connect(names.beta, `launcher-smoke-b-${suffix}`);
  if (!alpha.session.user_id || !beta.session.user_id) {
    fail("Nakama did not return both user IDs.");
  }

  try {
    await client.addFriends(alpha.session, undefined, [beta.name]);
    const alphaPending = await friendState(alpha.session, beta.session.user_id);
    const betaIncoming = await friendState(beta.session, alpha.session.user_id);
    if (alphaPending !== 1) {
      fail(`Expected outgoing state 1, received ${String(alphaPending)}.`);
    }
    if (betaIncoming !== 2) {
      fail(`Expected incoming state 2, received ${String(betaIncoming)}.`);
    }

    await client.addFriends(beta.session, [alpha.session.user_id]);
    await delay(250);
    const alphaState = await friendState(alpha.session, beta.session.user_id);
    const betaState = await friendState(beta.session, alpha.session.user_id);
    if (alphaState !== 0 || betaState !== 0) {
      fail(
        `Expected mutual friendship, received ${String(alphaState)} and ${String(betaState)}.`,
      );
    }
    console.log("Friend request, acceptance, and mutual state verified.");

    const alphaChannel = await alpha.socket.joinChat(
      beta.session.user_id,
      2,
      true,
      false,
    );
    const betaChannel = await beta.socket.joinChat(
      alpha.session.user_id,
      2,
      true,
      false,
    );
    if (alphaChannel.id !== betaChannel.id) {
      fail("Both players resolved different direct-chat channels.");
    }
    if (!alphaChannel.id.startsWith("4.")) {
      fail(`Unexpected direct-chat channel id: ${alphaChannel.id}`);
    }
    console.log(`Shared direct channel resolved: ${alphaChannel.id}`);

    const incoming = waitForMessage(beta.socket, betaChannel.id);
    const text = `Hello from the MoonGames social smoke test ${suffix}`;
    await alpha.socket.writeChatMessage(alphaChannel.id, { text });
    const delivered = await incoming;
    if (delivered.content?.text !== text) {
      fail("The delivered message text did not match.");
    }
    console.log("Live direct-message delivery verified.");

    const history = await client.listChannelMessages(
      beta.session,
      betaChannel.id,
      10,
      false,
    );
    const stored = history.messages?.find(
      (message) => message.message_id === delivered.message_id,
    );
    if (stored === undefined) {
      fail("The direct message was not found in persisted channel history.");
    }
    if (stored.content?.text !== text) {
      fail("The persisted message text did not match.");
    }
    console.log("Persisted Nakama channel history verified.");
    console.log("Social smoke test passed.");
  } finally {
    alpha.socket.disconnect(false);
    beta.socket.disconnect(false);
  }
}

main().catch((cause) => {
  console.error(
    `Social smoke test failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
  process.exitCode = 1;
});
