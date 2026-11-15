import {
  accountTransportSafe as accountTransportSafeShared,
} from "@moongames/game-sdk";

const EMAIL_SESSION_KEY = "moongames.auth.email.v1";
const GUEST_LINKED_KEY = "moongames.auth.guestLinked.v1";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export type OnlineAuthKind = "guest" | "email" | "host";

export interface OnlineAuthAccount {
  kind: OnlineAuthKind;
  userId: string;
  username: string;
  email: string | null;
}

export interface StoredEmailSession {
  server: string;
  email: string;
  token: string;
  refreshToken: string;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validateEmail(value: string): string | null {
  const email = normalizeEmail(value);
  if (email.length === 0) {
    return "Enter your email address.";
  }
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address.";
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 8) {
    return "Use at least 8 characters.";
  }
  if (value.length > 128) {
    return "Use 128 characters or fewer.";
  }
  if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return "Include at least one letter and one number.";
  }
  return null;
}

export function validateUsername(value: string): string | null {
  if (value.trim().length === 0) {
    return null;
  }
  if (!USERNAME_PATTERN.test(value.trim())) {
    return "Use 3–20 letters, numbers, or underscores.";
  }
  return null;
}

function errorText(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }
  return typeof cause === "string" ? cause : "";
}

function responsePayloadMessage(value: unknown): string | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  for (const key of ["message", "error"]) {
    const message = record[key];
    if (typeof message === "string" && message.trim().length > 0) {
      return message.trim();
    }
  }
  return null;
}

/**
 * Nakama rejects HTTP requests with a Response object rather than an Error.
 * Read a safe, short copy of its payload so auth failures keep their server
 * message after the response body is consumed.
 */
export async function authErrorDetail(cause: unknown): Promise<unknown> {
  if (typeof Response === "undefined" || !(cause instanceof Response)) {
    return cause;
  }

  try {
    const message = responsePayloadMessage(await cause.clone().json());
    if (message !== null) {
      return message;
    }
  } catch {
    // Some gateway errors return plain text or an empty body.
  }

  try {
    const text = (await cause.clone().text()).trim();
    if (text.length > 0) {
      return text.slice(0, 300);
    }
  } catch {
    // Keep the status fallback below.
  }

  return cause.statusText.length > 0
    ? cause.statusText
    : `HTTP ${cause.status}`;
}

export function authErrorMessage(
  cause: unknown,
  mode: "sign-in" | "sign-up",
): string {
  const message = errorText(cause);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("connection") ||
    normalized.includes("timeout")
  ) {
    return "Could not reach the game server. Check your connection and try again.";
  }

  if (
    normalized.includes("user account not found") ||
    normalized.includes("invalid credentials") ||
    normalized.includes("incorrect password") ||
    normalized.includes("http 401")
  ) {
    return "Email or password is incorrect.";
  }

  if (
    normalized.includes("email") &&
    (normalized.includes("already") ||
      normalized.includes("exists") ||
      normalized.includes("in use") ||
      normalized.includes("taken"))
  ) {
    return "That email is already registered. Sign in instead.";
  }

  if (
    normalized.includes("username") &&
    (normalized.includes("already") ||
      normalized.includes("exists") ||
      normalized.includes("in use") ||
      normalized.includes("taken"))
  ) {
    return "That player name is already taken.";
  }

  if (normalized.includes("password") && normalized.includes("least")) {
    return "Use a password with at least 8 characters.";
  }

  if (normalized.includes("invalid email")) {
    return "Enter a valid email address.";
  }

  return mode === "sign-in"
    ? "Could not sign in. Check your details and try again."
    : "Could not create the account. Check your details and try again.";
}

/**
 * Credentials must not cross a public plaintext connection. Loopback and
 * private-network addresses are allowed so local Nakama development still
 * works with email/password accounts.
 *
 * This covers every account, not only the ones with a password: a guest
 * account is an account too, and its session is a secret that must not cross
 * a public network in the clear.
 */
export const accountTransportSafe = accountTransportSafeShared;

/** The name of the rule for the accounts that use a password. It is the same
 * rule as for every other account. */
export const emailAuthTransportSafe = accountTransportSafe;

/** The message shown when the account would cross a public plain connection. */
export const INSECURE_ACCOUNT_MESSAGE =
  "MoonGames needs a secure connection to make an account. Open the https address of the server.";

export function readStoredEmailSession(
  server: string,
): StoredEmailSession | null {
  try {
    const raw = window.localStorage.getItem(EMAIL_SESSION_KEY);
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const candidate = parsed as Partial<StoredEmailSession>;
    if (
      candidate.server !== server ||
      typeof candidate.email !== "string" ||
      typeof candidate.token !== "string" ||
      typeof candidate.refreshToken !== "string" ||
      candidate.token.length === 0
    ) {
      return null;
    }
    return {
      server,
      email: candidate.email,
      token: candidate.token,
      refreshToken: candidate.refreshToken,
    };
  } catch {
    return null;
  }
}

export function storeEmailSession(session: StoredEmailSession): void {
  try {
    window.localStorage.setItem(EMAIL_SESSION_KEY, JSON.stringify(session));
  } catch {
    // Persistence is best-effort in private browsing and embedded webviews.
  }
}

export function clearStoredEmailSession(): void {
  try {
    window.localStorage.removeItem(EMAIL_SESSION_KEY);
  } catch {
    // Storage can be unavailable.
  }
}

export function markGuestIdentityLinked(): void {
  try {
    window.localStorage.setItem(GUEST_LINKED_KEY, "1");
  } catch {
    // Storage can be unavailable.
  }
}

/** Returns true once and clears the marker. */
export function consumeGuestIdentityLinked(): boolean {
  try {
    const linked = window.localStorage.getItem(GUEST_LINKED_KEY) === "1";
    if (linked) {
      window.localStorage.removeItem(GUEST_LINKED_KEY);
    }
    return linked;
  } catch {
    return false;
  }
}
