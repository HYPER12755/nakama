#!/usr/bin/env node
/**
 * Local Nakama smoke test for launcher email accounts.
 *
 * Verifies that an instant guest identity can be upgraded in place and then
 * restored through email/password without losing the user ID.
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
const username = `mgacct${suffix}`.slice(0, 20);
const email = `moongames.${suffix}@example.com`;
const password = "MoonGames1";

function fail(message) {
  throw new Error(message);
}

async function main() {
  console.log(`Nakama launcher account smoke test → ${serverUrl}`);
  const guest = await client.authenticateDevice(
    `launcher-account-smoke-${suffix}`,
    true,
  );
  if (!guest.user_id) {
    fail("The guest session did not include a user ID.");
  }
  await client.updateAccount(guest, { username });
  await client.linkEmail(guest, { email, password });
  console.log("Guest account upgraded with email credentials.");

  const linked = await client.getAccount(guest);
  if (linked.email !== email) {
    fail(`Expected linked email ${email}, received ${String(linked.email)}.`);
  }
  if (linked.user?.username !== username) {
    fail(`Expected player name ${username}, received ${String(linked.user?.username)}.`);
  }

  const restored = await client.authenticateEmail(email, password, false);
  if (restored.user_id !== guest.user_id) {
    fail("Email sign-in returned a different user ID than the upgraded guest.");
  }
  const restoredAccount = await client.getAccount(restored);
  if (restoredAccount.user?.username !== username) {
    fail("Email sign-in did not restore the upgraded player profile.");
  }
  console.log("Email sign-in restored the same account and player name.");
  console.log("Launcher account smoke test passed.");
}

main().catch((cause) => {
  console.error(
    `Launcher account smoke test failed: ${cause instanceof Error ? cause.message : String(cause)}`,
  );
  process.exitCode = 1;
});
