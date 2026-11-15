import {
  parseServerAddress,
  sameOriginServerAddress,
} from "@moongames/game-sdk";

const EMAIL_SESSION_KEY = "moongames.launcher.email.v1";
const GUEST_LINKED_KEY = "moongames.launcher.guestLinked.v1";
const DEVICE_ID_KEY = "moongames.launcher.deviceId";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,20}$/;

export type LauncherAuthKind = "guest" | "email";

export interface LauncherAccount {
  kind: LauncherAuthKind;
  userId: string;
  username: string;
  email: string | null;
}

export interface StoredLauncherEmailSession {
  server: string;
  email: string;
  token: string;
  refreshToken: string;
}

export interface LauncherServerAddress {
  host: string;
  port: string;
  useSSL: boolean;
  label: string;
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
  const normalized = errorText(cause).toLowerCase();

  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("connection") ||
    normalized.includes("timeout")
  ) {
    return "Could not reach the MoonGames server. Check your connection and try again.";
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

export function emailAuthTransportSafe(
  host: string,
  useSSL: boolean,
): boolean {
  if (useSSL) {
    return true;
  }
  const normalized = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  if (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.endsWith(".local")
  ) {
    return true;
  }
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalized);
  if (match === null) {
    return false;
  }
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet < 0 || octet > 255)) {
    return false;
  }
  if (octets[0] === 10 || octets[0] === 127) {
    return true;
  }
  if (octets[0] === 192 && octets[1] === 168) {
    return true;
  }
  return octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31;
}

export function defaultLauncherServerAddress(): string {
  // The server is reached through the address the menu itself came from,
  // so the menu works behind a proxy, a tunnel or a CDN without anyone
  // having to know the port of the server.
  return sameOriginServerAddress().label;
}

export function parseLauncherServerAddress(
  input = defaultLauncherServerAddress(),
): LauncherServerAddress {
  const address = parseServerAddress(input, sameOriginServerAddress());
  return {
    host: address.host,
    port: address.port,
    useSSL: address.useSSL,
    label: address.label,
  };
}

export function launcherServerKey(): string {
  return (
    (import.meta.env.VITE_NAKAMA_SERVER_KEY as string | undefined) ??
    "defaultkey"
  );
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Persistence is best-effort in private browsing and embedded webviews.
  }
}

export function guestDeviceId(): string {
  const existing = readStorage(DEVICE_ID_KEY);
  if (existing !== null && existing.length > 0) {
    return existing;
  }
  const created =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `launcher-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeStorage(DEVICE_ID_KEY, created);
  return created;
}

export function rotateGuestDeviceId(): void {
  try {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    // Storage can be unavailable.
  }
}

export function readStoredLauncherEmailSession(
  server: string,
): StoredLauncherEmailSession | null {
  const raw = readStorage(EMAIL_SESSION_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const candidate = parsed as Partial<StoredLauncherEmailSession>;
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

export function storeLauncherEmailSession(
  session: StoredLauncherEmailSession,
): void {
  writeStorage(EMAIL_SESSION_KEY, JSON.stringify(session));
}

export function clearStoredLauncherEmailSession(): void {
  try {
    window.localStorage.removeItem(EMAIL_SESSION_KEY);
  } catch {
    // Storage can be unavailable.
  }
}

export function markLauncherGuestLinked(): void {
  writeStorage(GUEST_LINKED_KEY, "1");
}

export function consumeLauncherGuestLinked(): boolean {
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
