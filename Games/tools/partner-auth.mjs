#!/usr/bin/env node
import { createServer } from "node:http";
import { parseArgs } from "node:util";
import {
  isEmailAllowed,
  moonGamesCustomId,
  parsePartnerAllowedDomains,
  parsePartnerSecrets,
  partnerCustomToken,
  verifyPartnerProof,
} from "./lib/partner-auth.mjs";

class ProviderConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ProviderConfigError";
  }
}

function usage() {
  console.log(`Usage: node tools/partner-auth.mjs [options]

Options:
  --port <n>   Port to listen on (default: MOONGAMES_PARTNER_AUTH_PORT or 4181)
  --host <a>   Bind address (default: MOONGAMES_PARTNER_AUTH_HOST or 0.0.0.0)
  --help       Show this help
`);
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function json(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > 16 * 1024) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function authenticateWithNakama({ email, partnerId }) {
  const url = process.env.MOONGAMES_NAKAMA_HTTP_URL;
  const serverKey = process.env.MOONGAMES_NAKAMA_SERVER_KEY;
  const providerSecret = process.env.MOONGAMES_PARTNER_AUTH_SECRET;
  if (url === undefined || serverKey === undefined || providerSecret === undefined) {
    throw new ProviderConfigError("Nakama partner auth is not configured.");
  }
  const customId = moonGamesCustomId(email);
  const endpoint = new URL("/v2/account/authenticate/custom", url);
  endpoint.searchParams.set("create", "true");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
    },
    body: JSON.stringify({
      token: partnerCustomToken(providerSecret, email),
      username: `${partnerId.slice(0, 16)}_${customId.slice(0, 12)}`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Nakama authentication failed: HTTP ${response.status}.`);
  }
  const value = await response.json();
  return {
    token: value.token,
    refreshToken: value.refresh_token ?? "",
    userId: value.user?.id ?? "",
    username: value.user?.username ?? "",
    expiresAt: value.expires_at ?? 0,
  };
}

function requireProviderConfig() {
  const required = [
    "MOONGAMES_PARTNER_AUTH_SECRET",
    "MOONGAMES_NAKAMA_HTTP_URL",
    "MOONGAMES_NAKAMA_SERVER_KEY",
  ];
  for (const name of required) {
    const value = process.env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new ProviderConfigError(`${name} is required.`);
    }
  }
}

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: "string" },
      host: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });
  if (values.help) {
    usage();
    return;
  }

  requireProviderConfig();
  const partnerSecrets = parsePartnerSecrets(
    process.env.MOONGAMES_PARTNER_SECRETS ?? "",
  );
  const allowedDomains = parsePartnerAllowedDomains(
    process.env.MOONGAMES_PARTNER_ALLOWED_DOMAINS ?? "",
  );
  for (const partnerId of partnerSecrets.keys()) {
    if ((allowedDomains.get(partnerId)?.length ?? 0) === 0) {
      console.warn(`warning: no email domain restriction is configured for ${partnerId}.`);
    }
  }
  const seenNonces = new Map();
  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [key, timestamp] of seenNonces) {
      if (timestamp < cutoff) {
        seenNonces.delete(key);
      }
    }
  }, 60_000).unref();

  const server = createServer(async (request, response) => {
    const pathname = (request.url ?? "/").split("?")[0];
    if (request.method === "GET" && pathname === "/healthcheck") {
      json(response, 200, { ok: true, partners: partnerSecrets.size });
      return;
    }
    if (request.method !== "POST" || pathname !== "/v1/auth/partner") {
      json(response, 404, { ok: false, error: "not found" });
      return;
    }
    try {
      const body = await readBody(request);
      const partnerId = typeof body.partnerId === "string" ? body.partnerId : "";
      const secret = partnerSecrets.get(partnerId);
      if (secret === undefined) {
        json(response, 401, { ok: false, error: "unknown partner" });
        return;
      }
      const proof = verifyPartnerProof(body, secret, { seenNonces });
      if (!proof.ok) {
        json(response, 401, { ok: false, error: proof.error });
        return;
      }
      if (!isEmailAllowed(proof.email, allowedDomains.get(partnerId))) {
        json(response, 403, { ok: false, error: "email domain is not allowed" });
        return;
      }
      const session = await authenticateWithNakama({
        email: proof.email,
        partnerId,
      });
      json(response, 200, { ok: true, session });
    } catch (cause) {
      const configError = cause instanceof ProviderConfigError;
      json(response, configError ? 500 : 400, {
        ok: false,
        error: configError
          ? "provider auth is not configured"
          : cause instanceof Error
            ? cause.message
            : "Invalid request.",
      });
    }
  });

  const port = Number(
    values.port ?? process.env.MOONGAMES_PARTNER_AUTH_PORT ?? "4181",
  );
  const host = values.host ?? process.env.MOONGAMES_PARTNER_AUTH_HOST ?? "0.0.0.0";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail("--port must be an integer between 1 and 65535.");
  }
  server.listen(port, host, () => {
    console.log(`MoonGames partner auth listening at http://${host}:${port}/`);
  });
}

main().catch((cause) => {
  fail(cause instanceof Error ? cause.message : String(cause));
});
