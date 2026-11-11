// Focused live check for the email/password account flow.
import { Client } from "@heroiclabs/nakama-js";

const HOST = process.env.NAKAMA_HOST ?? "127.0.0.1";
const PORT = process.env.NAKAMA_PORT ?? "7350";
const SSL = process.env.NAKAMA_SSL === "true";
const SERVER_KEY = process.env.NAKAMA_SERVER_KEY ?? "defaultkey";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectFailure(action, message) {
  try {
    await action();
  } catch {
    return;
  }
  throw new Error(message);
}

async function main() {
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const email = `moongames-auth-${runId}@example.test`;
  const password = "MoonGames123!";
  const username = `sm${runId.replace(/[^a-z0-9]/gi, "").slice(-14)}`;
  const client = new Client(SERVER_KEY, HOST, PORT, SSL);

  const guest = await client.authenticateDevice(
    `moongames-auth-smoke-${runId}`,
    true,
  );
  assert(guest.user_id, "guest session has no user id");
  console.log("[ok] guest session created");

  await client.linkEmail(guest, { email, password });
  console.log("[ok] email linked to the guest account");

  const emailSession = await client.authenticateEmail(email, password, false);
  assert(
    emailSession.user_id === guest.user_id,
    "email sign-in returned a different user",
  );
  console.log("[ok] email sign-in restores the same account");

  await client.updateAccount(emailSession, { username });
  const updated = await client.authenticateEmail(email, password, false);
  assert(updated.username === username, "username update did not reach the token");
  console.log("[ok] player name updates on the account");

  await expectFailure(
    async () => {
      const other = await client.authenticateDevice(
        `moongames-auth-smoke-other-${runId}`,
        true,
      );
      await client.linkEmail(other, { email, password });
    },
    "the same email was linked to a second account",
  );
  console.log("[ok] duplicate email linking is rejected");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
