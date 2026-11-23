# Partner authentication

Partner apps can sign a user in to their shared MoonGames Nakama account without exposing a password to the app.

## Endpoint

```text
POST https://<provider>/v1/auth/partner
Content-Type: application/json
```

Body:

```json
{
  "partnerId": "partner-a",
  "email": "player@example.com",
  "timestamp": 1700000000000,
  "nonce": "random-nonce-at-least-8-chars",
  "proof": "<64-character lowercase hex HMAC>"
}
```

`timestamp` is milliseconds and must be within five minutes of server time. `nonce` must be unique per partner. Reused nonces are rejected.

## Proof

The partner backend computes:

```text
proof = HMAC_SHA256(
  partnerSecret,
  partnerId + "\n" + lowercase(trim(email)) + "\n" + timestamp + "\n" + nonce
)
```

Example with Node:

```js
import { createHmac } from "node:crypto";

const proof = createHmac("sha256", partnerSecret)
  .update(
    [
      partnerId,
      email.trim().toLowerCase(),
      String(timestamp),
      nonce,
    ].join("\n"),
  )
  .digest("hex");
```

Never put the partner secret in a mobile app. The mobile app asks its own backend for a short-lived proof payload.

## Response

```json
{
  "ok": true,
  "session": {
    "token": "...",
    "refreshToken": "...",
    "userId": "...",
    "username": "...",
    "expiresAt": 0
  }
}
```

The app passes `session` into the MoonGames SDK or host. The game then uses the same Nakama account as every other partner app.

## Provider configuration

```bash
export MOONGAMES_PARTNER_SECRETS='{"partner-a":"at-least-16-character-secret"}'
export MOONGAMES_PARTNER_ALLOWED_DOMAINS='{"partner-a":["example.com"]}'
export MOONGAMES_PARTNER_AUTH_SECRET='provider-long-lived-custom-auth-secret'
export MOONGAMES_NAKAMA_HTTP_URL='http://127.0.0.1:7350'
export MOONGAMES_NAKAMA_SERVER_KEY='defaultkey'
export MOONGAMES_PARTNER_AUTH_PORT=4181
pnpm serve:partner-auth
```

`MOONGAMES_PARTNER_SECRETS` maps partner ids to their HMAC secrets. `MOONGAMES_PARTNER_AUTH_SECRET` is the server-side secret used to mint Nakama custom-auth tokens. Neither belongs in a repository or mobile app.

`MOONGAMES_PARTNER_ALLOWED_DOMAINS` optionally restricts which email domains each partner may attest. A partner without an entry can attest any email, so configure this before going live. Empty domain lists are rejected at startup.

## Identity rule

The MoonGames custom id is `sha256("moongames-email:" + normalizedEmail)`. A normalized email always maps to the same shared account across partners.

This is a trust-by-attestation model: any partner that can produce a valid HMAC and is allowed to attest the email domain controls that MoonGames account. Only onboard partners you trust, and configure `MOONGAMES_PARTNER_ALLOWED_DOMAINS` so a partner cannot attest another partner's users.

Plain email strings from a partner app are not accepted. Only a valid HMAC over the email, partner id, timestamp, and nonce is trusted.

## Health check

```text
GET /healthcheck
```
