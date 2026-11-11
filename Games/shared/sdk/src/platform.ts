import type {
  GameSharePayload,
  HapticPattern,
} from "./protocol";

/** Browser vibration patterns for the shared haptic contract. */
export const WEB_VIBRATION_PATTERNS: Record<
  HapticPattern,
  number | number[]
> = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [10, 40, 10],
  error: [20, 50, 20],
};

const EXTERNAL_URL_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
]);

/**
 * Accept only URLs that a game may safely hand to the host OS. Relative paths,
 * script URLs, and custom schemes are rejected so a game cannot turn a bridge
 * message into an arbitrary platform intent.
 */
export function normalizeExternalUrl(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return EXTERNAL_URL_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

/** Combine a share payload into the plain text used by clipboard fallbacks. */
export function sharePayloadText(payload: GameSharePayload): string {
  return [payload.title, payload.text, payload.url]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0)
    .join("\n");
}

export function compactSharePayload(
  payload: GameSharePayload,
): GameSharePayload {
  const compact: GameSharePayload = {};
  if (typeof payload.title === "string" && payload.title.trim().length > 0) {
    compact.title = payload.title.trim();
  }
  if (typeof payload.text === "string" && payload.text.trim().length > 0) {
    compact.text = payload.text.trim();
  }
  if (typeof payload.url === "string" && payload.url.trim().length > 0) {
    compact.url = payload.url.trim();
  }
  return compact;
}

export type GameShareOutcome =
  | "host"
  | "shared"
  | "copied"
  | "cancelled"
  | "unavailable";
