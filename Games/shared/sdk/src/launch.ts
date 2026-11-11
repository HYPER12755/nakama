/**
 * Query parameters supplied by a native launch/deep link. Hosts send this in
 * the init config so game bundles loaded from file URLs still receive launch
 * parameters reliably.
 */
export interface GameLaunchContext {
  /** Normalized query string without a leading `?` or `#`. */
  query: string;
  /** Decoded query parameters. Repeated keys keep the last value. */
  params: Record<string, string>;
}

const MAX_QUERY_LENGTH = 4096;

/**
 * Parse a launch query such as `match=abc&spectate=1`. Returns undefined for
 * empty or unusable input. The original query is preserved for games that want
 * to do their own parsing.
 */
export function createGameLaunchContext(
  query: string | null | undefined,
): GameLaunchContext | undefined {
  if (typeof query !== "string") {
    return undefined;
  }
  const normalized = query.trim().replace(/^[?#]+/, "");
  if (normalized.length === 0 || normalized.length > MAX_QUERY_LENGTH) {
    return undefined;
  }
  try {
    const params: Record<string, string> = {};
    new URLSearchParams(normalized).forEach((value, key) => {
      params[key] = value;
    });
    if (Object.keys(params).length === 0) {
      return undefined;
    }
    return { query: normalized, params };
  } catch {
    return undefined;
  }
}
