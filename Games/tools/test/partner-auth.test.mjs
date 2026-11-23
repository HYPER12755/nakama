import assert from "node:assert/strict";
import test from "node:test";
import {
  moonGamesCustomId,
  normalizeAuthEmail,
  parsePartnerSecrets,
  partnerCustomToken,
  partnerProof,
  verifyPartnerProof,
} from "../lib/partner-auth.mjs";

const SECRET = "partner-secret-with-at-least-16-characters";

test("normalizes partner auth email", () => {
  assert.equal(normalizeAuthEmail("  Player@Example.COM "), "player@example.com");
  assert.throws(() => normalizeAuthEmail("not-an-email"));
});

test("partner proof verifies valid requests and rejects tampering", () => {
  const request = {
    partnerId: "partner-a",
    email: "Player@Example.com",
    timestamp: 1_700_000_000_000,
    nonce: "nonce-1234567890",
  };
  const proof = partnerProof(request, SECRET);
  const verified = verifyPartnerProof({ ...request, proof }, SECRET, {
    now: request.timestamp,
  });
  assert.equal(verified.ok, true);
  assert.equal(verified.email, "player@example.com");

  assert.equal(
    verifyPartnerProof({ ...request, proof, email: "other@example.com" }, SECRET, {
      now: request.timestamp,
    }).ok,
    false,
  );
  assert.equal(
    verifyPartnerProof({ ...request, proof }, SECRET, {
      now: request.timestamp + 10 * 60 * 1000,
    }).ok,
    false,
  );
});

test("partner proof rejects replayed nonces", () => {
  const request = {
    partnerId: "partner-a",
    email: "player@example.com",
    timestamp: 1_700_000_000_000,
    nonce: "replay-nonce-123",
    proof: "",
  };
  request.proof = partnerProof(request, SECRET);
  const seenNonces = new Map();
  assert.equal(
    verifyPartnerProof(request, SECRET, { now: request.timestamp, seenNonces }).ok,
    true,
  );
  assert.match(
    verifyPartnerProof(request, SECRET, { now: request.timestamp, seenNonces }).error,
    /nonce/,
  );
});

test("custom id and token are stable per email", () => {
  const first = moonGamesCustomId("Player@Example.com");
  const second = moonGamesCustomId("player@example.com");
  assert.equal(first, second);
  assert.equal(partnerCustomToken(SECRET, "player@example.com").length, 64);
});

test("partner secrets parse from JSON", () => {
  const secrets = parsePartnerSecrets(
    JSON.stringify({ "partner-a": SECRET, "partner-b": "another-long-partner-secret" }),
  );
  assert.deepEqual([...secrets.keys()], ["partner-a", "partner-b"]);
  assert.throws(() => parsePartnerSecrets("[]"));
});
