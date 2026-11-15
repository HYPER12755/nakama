/**
 * Where the game server is.
 *
 * A title must reach the server wherever the title was opened from, so the
 * address is taken from the page itself: the host, the port and the scheme
 * of the page. A menu and its games can then be served from one address
 * behind one proxy, a tunnel or a CDN, and every player reaches the same
 * server without knowing its port.
 *
 * The server is reached through the same address the page came from:
 *
 *   https://games.example.com/v2/...   the calls
 *   wss://games.example.com/ws         the socket
 *
 * A host that serves the game somewhere else can still say where the
 * server is, with the VITE_NAKAMA_HOST, VITE_NAKAMA_PORT and
 * VITE_NAKAMA_SSL settings.
 */

/** The address of the server, split into the parts a client needs. */
export interface GameServerAddress {
  host: string;
  port: string;
  useSSL: boolean;
  serverKey: string;
  /** The address as a label, for showing and for the stored session. */
  label: string;
}

/** The port the local server listens on when nothing else is said. */
export const DEFAULT_SERVER_PORT = "7350";

/** The key the local server uses when nothing else is said. */
export const DEFAULT_SERVER_KEY = "defaultkey";

/**
 * An account must not cross a public plaintext connection. The session that
 * comes back is a secret, so the account is only made when the connection is
 * secure, or when the address is on the player's own network.
 *
 * Loopback and private-network addresses are allowed so local Nakama
 * development still works.
 */
export function accountTransportSafe(
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

/** The message shown when the account would cross a public plain connection. */
export const INSECURE_ACCOUNT_MESSAGE =
  "MoonGames needs a secure connection to make an account. Open the https address of the server.";

/**
 * True when an account may be made on this connection.
 *
 * A host that runs a test tunnel, where the whole point is that the
 * connection is plain, can say so with the allowInsecure flag. Nothing
 * else allows it.
 */
export function accountCreationAllowed(connection: {
  host: string;
  useSSL: boolean;
  allowInsecure?: boolean;
}): boolean {
  if (connection.allowInsecure === true) {
    return true;
  }
  return accountTransportSafe(connection.host, connection.useSSL);
}

/**
 * True when the address asks for a plain connection to be allowed. A host
 * that serves the menu on a test tunnel opens it with this in the address.
 */
export function insecureConnectionRequested(search: string): boolean {
  try {
    const params = new URLSearchParams(search);
    return (
      params.get("insecure") === "1" ||
      params.get("insecure") === "true" ||
      params.get("allowInsecure") === "1"
    );
  } catch {
    return false;
  }
}

function environment(name: string): string | undefined {
  // The settings are read from the environment of the build, and the shared
  // kit is also used outside a browser, so the environment is read in a way
  // that is safe everywhere.
  const env = (
    import.meta as unknown as {
      env?: Record<string, string | undefined>;
    }
  ).env;
  const value = env?.[name];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The address of the server for a page that was served from somewhere.
 *
 * The page's own host and scheme are used, so the server is reached through
 * the same door the player came through. The port of the page is used too,
 * because that is the port the proxy is listening on.
 */
export function sameOriginServerAddress(
  location: { hostname: string; port: string; protocol: string } | undefined =
    typeof window === "undefined" ? undefined : window.location,
): GameServerAddress {
  const configuredHost = environment("VITE_NAKAMA_HOST");
  const configuredPort = environment("VITE_NAKAMA_PORT");
  const configuredSSL = environment("VITE_NAKAMA_SSL");

  const useSSL =
    configuredSSL !== undefined
      ? configuredSSL === "true"
      : (location?.protocol ?? "http:") === "https:";
  const host = configuredHost ?? location?.hostname ?? "127.0.0.1";
  // The port of the page, or the port the scheme means when the page was
  // served from the default port.
  const pagePort = location?.port ?? "";
  const port =
    configuredPort ??
    (pagePort.length > 0
      ? pagePort
      : useSSL
        ? "443"
        : "80");
  return {
    host: host.length > 0 ? host : "127.0.0.1",
    port,
    useSSL,
    serverKey: environment("VITE_NAKAMA_SERVER_KEY") ?? DEFAULT_SERVER_KEY,
    label: `${useSSL ? "https" : "http"}://${host}:${port}`,
  };
}

/**
 * Read an address from a string, for a host that says where the server is.
 */
export function parseServerAddress(
  input: string,
  fallback: GameServerAddress,
): GameServerAddress {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return fallback;
  }
  const withProtocol = /^[a-z]+:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const useSSL = url.protocol === "https:";
    const host = url.hostname.length > 0 ? url.hostname : fallback.host;
    const port = url.port || (useSSL ? "443" : "80");
    return {
      host,
      port,
      useSSL,
      serverKey: fallback.serverKey,
      label: `${useSSL ? "https" : "http"}://${host}:${port}`,
    };
  } catch {
    return fallback;
  }
}
