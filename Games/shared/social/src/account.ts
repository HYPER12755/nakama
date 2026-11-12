import type { Client, Session } from "@heroiclabs/nakama-js";

export class MoonGamesAccountError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MoonGamesAccountError";
    this.code = code;
  }
}

export interface LinkGuestEmailInput {
  client: Client;
  session: Session;
  email: string;
  password: string;
  username?: string;
}

export interface SignInInput {
  client: Client;
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  username?: string;
}

export interface UpdateUsernameInput {
  client: Client;
  session: Session;
  username: string;
}

export type HostAccountLinkMode = "existing" | "create";

export interface LinkHostAccountInput {
  client: Client;
  guestSession: Session;
  email: string;
  password: string;
  username?: string;
  mode: HostAccountLinkMode;
}

export function normalizeAccountEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new MoonGamesAccountError(
      "invalid_email",
      "Enter a valid email address.",
    );
  }
  return value;
}

export function validateMoonGamesPassword(password: string): string {
  if (password.length < 8) {
    throw new MoonGamesAccountError(
      "weak_password",
      "Use at least 8 characters for your MoonGames password.",
    );
  }
  if (password.length > 128) {
    throw new MoonGamesAccountError(
      "password_too_long",
      "MoonGames passwords must be 128 characters or fewer.",
    );
  }
  return password;
}

export function validateMoonGamesUsername(username: string): string {
  const value = username.trim();
  if (!/^[A-Za-z0-9_]{3,20}$/.test(value)) {
    throw new MoonGamesAccountError(
      "invalid_username",
      "Use 3–20 letters, numbers, or underscores for your player name.",
    );
  }
  return value;
}

/**
 * Syncs a host-owned display name into the shared MoonGames identity. Email
 * remains the stable key; hosts call this whenever their account name changes.
 */
export async function syncMoonGamesUsername({
  client,
  session,
  username,
}: UpdateUsernameInput): Promise<void> {
  await client.updateAccount(session, {
    username: validateMoonGamesUsername(username),
  });
}

/**
 * Links a host-supplied email to the current guest account. The host must show
 * the two account options and collect a MoonGames password before calling this.
 */
export async function linkGuestEmail({
  client,
  session,
  email,
  password,
  username,
}: LinkGuestEmailInput): Promise<Session> {
  const normalizedEmail = normalizeAccountEmail(email);
  validateMoonGamesPassword(password);
  await client.linkEmail(session, {
    email: normalizedEmail,
    password,
  });
  const trimmedUsername = username?.trim() ?? "";
  if (trimmedUsername.length > 0) {
    try {
      await client.updateAccount(session, { username: trimmedUsername });
    } catch {
      // The email link is already authoritative. A host-provided name can be
      // unavailable, and that must not strand the user in a half-linked state.
    }
  }
  return client.authenticateEmail(normalizedEmail, password, false);
}

/**
 * The host-owned linking decision point. An existing email always requires the
 * MoonGames password. A new account links the current guest after consent and
 * password selection, preserving rating and history.
 */
export async function linkHostAccount({
  client,
  guestSession,
  email,
  password,
  username,
  mode,
}: LinkHostAccountInput): Promise<Session> {
  if (mode !== "existing" && mode !== "create") {
    throw new MoonGamesAccountError(
      "invalid_mode",
      "Choose whether to link a new account or sign in to an existing one.",
    );
  }
  if (mode === "existing") {
    return signInWithMoonGames({ client, email, password });
  }
  return linkGuestEmail({
    client,
    session: guestSession,
    email,
    password,
    username,
  });
}

/** Signs in to an existing MoonGames email account with password gating. */
export async function signInWithMoonGames({
  client,
  email,
  password,
}: SignInInput): Promise<Session> {
  return client.authenticateEmail(normalizeAccountEmail(email), password, false);
}

/** Creates a fresh MoonGames email account when there is no guest to link. */
export async function signUpWithMoonGames({
  client,
  email,
  password,
  username,
}: SignUpInput): Promise<Session> {
  const normalizedEmail = normalizeAccountEmail(email);
  validateMoonGamesPassword(password);
  return client.authenticateEmail(
    normalizedEmail,
    password,
    true,
    username?.trim(),
  );
}
