import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAuthEmail(value) {
  if (typeof value !== "string") {
    throw new Error("email must be a string.");
  }
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL.test(email)) {
    throw new Error("email must be a valid address.");
  }
  return email;
}

export function partnerProof(input, secret) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("A partner secret is required.");
  }
  const message = [
    input.partnerId,
    normalizeAuthEmail(input.email),
    String(input.timestamp),
    input.nonce,
  ].join("\n");
  return createHmac("sha256", secret).update(message).digest("hex");
}

export function verifyPartnerProof(request, secret, options = {}) {
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? 5 * 60 * 1000;
  if (
    typeof request?.partnerId !== "string" ||
    request.partnerId.length === 0 ||
    request.partnerId.length > 128
  ) {
    return { ok: false, error: "partnerId is invalid." };
  }
  if (
    typeof request.timestamp !== "number" ||
    !Number.isFinite(request.timestamp) ||
    Math.abs(now - request.timestamp) > maxAgeMs
  ) {
    return { ok: false, error: "timestamp is outside the allowed window." };
  }
  if (
    typeof request.nonce !== "string" ||
    request.nonce.length < 8 ||
    request.nonce.length > 128
  ) {
    return { ok: false, error: "nonce is invalid." };
  }
  if (typeof request.proof !== "string" || !/^[a-f0-9]{64}$/.test(request.proof)) {
    return { ok: false, error: "proof must be a 64-character lowercase hex string." };
  }
  let expected;
  try {
    expected = partnerProof(request, secret);
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Invalid request." };
  }
  const left = Buffer.from(expected, "hex");
  const right = Buffer.from(request.proof, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return { ok: false, error: "proof is invalid." };
  }
  const nonceKey = `${request.partnerId}:${request.nonce}`;
  const seen = options.seenNonces;
  if (seen !== undefined) {
    if (seen.has(nonceKey)) {
      return { ok: false, error: "nonce was already used." };
    }
    seen.set(nonceKey, now);
  }
  return { ok: true, email: normalizeAuthEmail(request.email) };
}

export function moonGamesCustomId(email) {
  return createHash("sha256")
    .update(`moongames-email:${normalizeAuthEmail(email)}`)
    .digest("hex");
}

export function partnerCustomToken(secret, email) {
  if (typeof secret !== "string" || secret.length === 0) {
    throw new Error("A provider auth secret is required.");
  }
  return createHmac("sha256", secret)
    .update(moonGamesCustomId(email))
    .digest("hex");
}

export function parsePartnerAllowedDomains(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return new Map();
  }
  const parsed = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MOONGAMES_PARTNER_ALLOWED_DOMAINS must be a JSON object.");
  }
  const domains = new Map();
  for (const [partnerId, values] of Object.entries(parsed)) {
    if (!Array.isArray(values) || values.some((item) => typeof item !== "string")) {
      throw new Error(`Invalid allowed domains for partner ${partnerId}.`);
    }
    const normalized = values
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);
    if (normalized.length === 0) {
      throw new Error(`At least one allowed domain is required for partner ${partnerId}.`);
    }
    domains.set(partnerId, normalized);
  }
  return domains;
}

export function isEmailAllowed(email, domains) {
  if (domains === undefined) {
    return true;
  }
  if (!Array.isArray(domains) || domains.length === 0) {
    return false;
  }
  const normalized = normalizeAuthEmail(email);
  return domains.some(
    (domain) => normalized.endsWith(`@${domain}`) || normalized === domain,
  );
}

export function parsePartnerSecrets(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("MOONGAMES_PARTNER_SECRETS must contain JSON.");
  }
  const parsed = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("MOONGAMES_PARTNER_SECRETS must be a JSON object.");
  }
  const secrets = new Map();
  for (const [partnerId, secret] of Object.entries(parsed)) {
    if (partnerId.length === 0 || typeof secret !== "string" || secret.length < 16) {
      throw new Error(`Invalid secret configured for partner ${partnerId}.`);
    }
    secrets.set(partnerId, secret);
  }
  return secrets;
}
