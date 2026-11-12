#!/usr/bin/env node
/**
 * Local Nakama smoke test for MoonGames invites and notification state.
 *
 * It creates two disposable accounts, makes them friends, creates a real Chess
 * invite room, and exercises accept, decline, cancel, token resolution, read
 * state, and persisted direct-chat invite cards.
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
  alpha: `mgi${suffix}`.slice(0, 20),
  beta: `mgj${suffix}`.slice(0, 20),
};

function fail(message) {
  throw new Error(message);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const decoder = new TextDecoder();

function decodeMatchData(data) {
  return typeof data === "string"
    ? JSON.parse(data)
    : JSON.parse(decoder.decode(data));
}

function waitForMatchOp(socket, op, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const previous = socket.onmatchdata;
    const timer = setTimeout(() => {
      socket.onmatchdata = previous;
      reject(new Error(`Timed out waiting for match opcode ${op}.`));
    }, timeoutMs);
    socket.onmatchdata = (matchData) => {
      previous?.call(socket, matchData);
      if (matchData.op_code !== op) {
        return;
      }
      clearTimeout(timer);
      socket.onmatchdata = previous;
      resolve(decodeMatchData(matchData.data));
    };
  });
}

async function connect(name, deviceId) {
  const session = await client.authenticateDevice(deviceId, true);
  await client.updateAccount(session, { username: name });
  const socket = client.createSocket(useSSL, false);
  await socket.connect(session, true);
  return { name, session, socket };
}

async function rpc(session, id, input = {}) {
  const response = await client.rpc(session, id, input);
  const payload = response.payload;
  if (payload?.ok === false) {
    fail(`${id} failed: ${payload.error?.code ?? "unknown"} — ${payload.error?.message ?? "no message"}`);
  }
  return payload;
}

async function notifications(session) {
  const response = await client.listNotifications(session, 100);
  return response.notifications ?? [];
}

async function waitForNotification(session, predicate, timeoutMs = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const found = (await notifications(session)).find(predicate);
    if (found !== undefined) {
      return found;
    }
    await delay(150);
  }
  fail("Timed out waiting for a MoonGames notification.");
}

function notificationInvite(notification) {
  return notification.content?.invite ?? null;
}

async function createInvite(session, recipientId, timeControl = "5+0") {
  const payload = await rpc(session, "moongames_invite_create", {
    gameId: "chess",
    mode: "private",
    recipientId,
    timeControl,
    message: `Smoke invite ${suffix}`,
  });
  if (payload.invite === undefined) {
    fail("Invite creation did not return a public invite.");
  }
  return payload.invite;
}

async function main() {
  console.log(`Nakama invite smoke test → ${serverUrl}`);
  const alpha = await connect(names.alpha, `invite-smoke-a-${suffix}`);
  const beta = await connect(names.beta, `invite-smoke-b-${suffix}`);

  try {
    await client.addFriends(alpha.session, undefined, [beta.name]);
    await client.addFriends(beta.session, [alpha.session.user_id]);
    await delay(250);

    const acceptedInvite = await createInvite(alpha.session, beta.session.user_id);
    if (!acceptedInvite.token || !acceptedInvite.matchId) {
      fail("The invite did not include a creator token and match room.");
    }
    const received = await waitForNotification(
      beta.session,
      (notification) => notification.code === 2101 && notificationInvite(notification)?.inviteId === acceptedInvite.inviteId,
    );
    const receivedInvite = notificationInvite(received);
    if (receivedInvite?.gameId !== "chess" || receivedInvite.matchId !== acceptedInvite.matchId) {
      fail("The recipient notification did not carry the Chess invite card.");
    }
    console.log(`Invite notification and Chess room verified: ${acceptedInvite.matchId}`);

    const resolved = await rpc(beta.session, "moongames_invite_resolve", {
      inviteId: acceptedInvite.inviteId,
    });
    if (resolved.direction !== "incoming" || resolved.canAccept !== true) {
      fail("The recipient could not resolve the incoming invite.");
    }
    const tokenResolved = await rpc(beta.session, "moongames_invite_resolve", {
      token: acceptedInvite.token,
    });
    if (tokenResolved.invite?.inviteId !== acceptedInvite.inviteId) {
      fail("The invite token did not resolve to the same invite.");
    }
    const deepLinkToken = String(acceptedInvite.deepLink ?? "").split("/").pop();
    if (
      deepLinkToken !== acceptedInvite.inviteId ||
      acceptedInvite.joinPath !== `/invite/${acceptedInvite.inviteId}`
    ) {
      fail("The invite deep link did not use the stable invite id.");
    }
    const deepLinkResolved = await rpc(beta.session, "moongames_invite_resolve", {
      token: deepLinkToken,
    });
    if (deepLinkResolved.invite?.inviteId !== acceptedInvite.inviteId) {
      fail("The invite deep link did not resolve to the same invite.");
    }
    console.log("Invite id, hashed-token, and deep-link resolution verified.");

    await rpc(beta.session, "moongames_invite_accept", {
      inviteId: acceptedInvite.inviteId,
    });
    await waitForNotification(
      alpha.session,
      (notification) => notification.code === 2102,
    );
    const afterAccept = await rpc(beta.session, "moongames_invite_resolve", {
      inviteId: acceptedInvite.inviteId,
    });
    if (afterAccept.invite?.status !== "accepted" || afterAccept.canJoin !== true) {
      fail("The accepted invite was not joinable.");
    }
    const alphaStart = waitForMatchOp(alpha.socket, 10);
    const betaStart = waitForMatchOp(beta.socket, 10);
    await alpha.socket.joinMatch(acceptedInvite.matchId);
    await beta.socket.joinMatch(acceptedInvite.matchId);
    const [alphaState, betaState] = await Promise.all([alphaStart, betaStart]);
    if (alphaState.players?.length !== 2 || betaState.players?.length !== 2) {
      fail("Both invited players did not join the authoritative Chess room.");
    }
    console.log("Invite acceptance, room join, and sender notification verified.");

    const declinedInvite = await createInvite(alpha.session, beta.session.user_id);
    await rpc(beta.session, "moongames_invite_decline", {
      inviteId: declinedInvite.inviteId,
    });
    await waitForNotification(
      alpha.session,
      (notification) => notification.code === 2103,
    );
    const declinedState = await rpc(alpha.session, "moongames_invite_resolve", {
      inviteId: declinedInvite.inviteId,
    });
    if (declinedState.invite?.status !== "declined") {
      fail("The declined invite did not persist its state.");
    }
    console.log("Invite decline and sender notification verified.");

    const cancelledInvite = await createInvite(alpha.session, beta.session.user_id);
    await rpc(alpha.session, "moongames_invite_cancel", {
      inviteId: cancelledInvite.inviteId,
    });
    await waitForNotification(
      beta.session,
      (notification) => notification.code === 2104,
    );
    const cancelledState = await rpc(beta.session, "moongames_invite_resolve", {
      inviteId: cancelledInvite.inviteId,
    });
    if (cancelledState.invite?.status !== "cancelled") {
      fail("The cancelled invite did not persist its state.");
    }
    console.log("Invite cancel and recipient notification verified.");

    beta.socket.disconnect(false);
    const queuedInvite = await createInvite(alpha.session, beta.session.user_id);
    const reconnectedSocket = client.createSocket(useSSL, false);
    await reconnectedSocket.connect(beta.session, true);
    beta.socket = reconnectedSocket;
    const queuedNotice = await waitForNotification(
      beta.session,
      (notification) =>
        notification.code === 2101 &&
        notificationInvite(notification)?.inviteId === queuedInvite.inviteId,
    );
    if (queuedNotice === undefined) {
      fail("The invite created while the recipient was offline was not replayed.");
    }
    console.log("Offline invite replay after reconnect verified.");
    await rpc(alpha.session, "moongames_invite_cancel", {
      inviteId: queuedInvite.inviteId,
    });

    const unread = (await notifications(beta.session)).filter(
      (notification) => notification.code === 2104,
    );
    const unreadId = unread[0]?.id;
    if (unreadId === undefined) {
      fail("Could not find the invite notification to mark read.");
    }
    await rpc(beta.session, "moongames_notifications_mark_read", {
      ids: [unreadId],
    });
    const state = await rpc(beta.session, "moongames_notifications_state");
    if (!state.readIds?.includes(unreadId)) {
      fail("Notification read state did not persist.");
    }
    console.log("Notification read state verified.");

    const alphaChannel = await alpha.socket.joinChat(beta.session.user_id, 2, true, false);
    const betaChannel = await beta.socket.joinChat(alpha.session.user_id, 2, true, false);
    if (alphaChannel.id !== betaChannel.id) {
      fail("Both players resolved different direct-chat channels.");
    }
    const storedInvite = { ...acceptedInvite };
    delete storedInvite.token;
    await alpha.socket.writeChatMessage(alphaChannel.id, {
      type: "moongames.invite",
      version: 1,
      invite: storedInvite,
    });
    const history = await client.listChannelMessages(beta.session, betaChannel.id, 10, false);
    const stored = history.messages?.find((message) => message.content?.invite?.inviteId === acceptedInvite.inviteId);
    if (stored === undefined) {
      fail("The invite card was not persisted in the direct chat.");
    }
    if (stored.content?.invite?.token !== undefined) {
      fail("The persisted invite card leaked the creator token.");
    }
    console.log("Persisted direct-chat invite card verified.");
    console.log("Invite smoke test passed.");
  } finally {
    alpha.socket.disconnect(false);
    beta.socket.disconnect(false);
  }
}

main().catch((cause) => {
  console.error(
    `Invite smoke test failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
  process.exitCode = 1;
});
