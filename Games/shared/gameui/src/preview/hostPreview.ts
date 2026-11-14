import {
  GAME_PROTOCOL_VERSION,
  isHostToGameMessage,
  type GameSession,
  type GameTheme,
  type GameToHostMessage,
  type HostToGameMessage,
  type HostTransport,
} from "@moongames/game-sdk";

export type PreviewDirection = "game-to-host" | "host-to-game" | "system";

export interface PreviewLogEntry {
  id: number;
  at: number;
  direction: PreviewDirection;
  label: string;
  payload?: unknown;
}

/**
 * A browser implementation of the native host transport. It lets the exact
 * production bundle exercise host-only message paths without a native build.
 */
export class BrowserPreviewHost implements HostTransport {
  readonly isHosted = true;

  private readonly locale: string;
  private readonly handlers = new Set<(message: HostToGameMessage) => void>();
  private readonly logHandlers = new Set<(entry: PreviewLogEntry) => void>();
  private readonly logs: PreviewLogEntry[] = [];
  private nextLogId = 1;
  private ready = false;
  private gameId = "chess";
  private gameVersion = "unknown";
  private theme: GameTheme;
  private session: GameSession | undefined;

  constructor(options: {
    locale?: string;
    theme?: GameTheme;
    session?: GameSession;
  } = {}) {
    this.locale = options.locale ?? "en";
    this.theme = options.theme ?? { mode: "dark" };
    this.session = options.session;
  }

  get currentGameId(): string {
    return this.gameId;
  }

  get currentGameVersion(): string {
    return this.gameVersion;
  }

  get currentTheme(): GameTheme {
    return this.theme;
  }

  get hasSession(): boolean {
    return this.session !== undefined;
  }

  get logEntries(): readonly PreviewLogEntry[] {
    return this.logs;
  }

  subscribe(handler: (message: HostToGameMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  subscribeLog(handler: (entry: PreviewLogEntry) => void): () => void {
    this.logHandlers.add(handler);
    return () => {
      this.logHandlers.delete(handler);
    };
  }

  post(message: GameToHostMessage): void {
    this.log("game-to-host", message.type, message);

    if (message.type !== "ready") {
      return;
    }

    this.ready = true;
    this.gameId = message.gameId;
    this.gameVersion = message.version;
    this.log("system", "game ready; sending init", {
      gameId: this.gameId,
      version: this.gameVersion,
    });

    // The game subscribes to host messages in its first React effect, before
    // the ready effect runs. A microtask keeps this safe for other embedders.
    queueMicrotask(() => this.sendInit());
  }

  setTheme(theme: GameTheme): void {
    this.theme = theme;
    if (this.ready) {
      this.sendHost({ type: "theme", theme });
    } else {
      this.log("system", "theme stored until init", theme);
    }
  }

  setSession(session: GameSession | undefined): void {
    this.session = session;
    if (this.ready && session !== undefined) {
      this.sendHost({ type: "session", session });
    } else {
      this.log(
        "system",
        session === undefined ? "session cleared" : "session stored until init",
      );
    }
  }

  sendInit(): void {
    if (!this.ready) {
      return;
    }
    this.sendHost({
      type: "init",
      protocol: GAME_PROTOCOL_VERSION,
      config: {
        protocol: GAME_PROTOCOL_VERSION,
        gameId: this.gameId,
        locale: this.locale,
        theme: this.theme,
        ...(this.session === undefined ? {} : { session: this.session }),
      },
    });
  }

  pause(): void {
    if (this.ready) {
      this.sendHost({ type: "pause" });
    }
  }

  resume(): void {
    if (this.ready) {
      this.sendHost({ type: "resume" });
    }
  }

  clearLog(): void {
    this.logs.length = 0;
  }

  private sendHost(message: HostToGameMessage): void {
    if (!isHostToGameMessage(message)) {
      this.log("system", "ignored invalid host message", message);
      return;
    }
    this.log("host-to-game", message.type, message);
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  private log(
    direction: PreviewDirection,
    label: string,
    payload?: unknown,
  ): void {
    const entry: PreviewLogEntry = {
      id: this.nextLogId,
      at: Date.now(),
      direction,
      label,
      payload: redactForLog(payload),
    };
    this.nextLogId += 1;
    this.logs.push(entry);
    if (this.logs.length > 80) {
      this.logs.splice(0, this.logs.length - 80);
    }
    for (const handler of this.logHandlers) {
      handler(entry);
    }
  }
}

export function sessionFromToken(
  token: string,
  refreshToken = "",
): GameSession | null {
  const parts = token.split(".");
  if (parts.length < 2) {
    return null;
  }

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "=",
    );
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload !== "object" || payload === null) {
      return null;
    }
    const claims = payload as Record<string, unknown>;
    const userId =
      typeof claims.uid === "string"
        ? claims.uid
        : typeof claims.sub === "string"
          ? claims.sub
          : null;
    if (userId === null || typeof claims.usn !== "string") {
      return null;
    }
    return {
      token,
      refreshToken,
      userId,
      username: claims.usn,
      expiresAt: typeof claims.exp === "number" ? claims.exp : 0,
    };
  } catch {
    return null;
  }
}

function redactForLog(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(redactForLog);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    redacted[key] =
      key === "token" || key === "refreshToken" || key === "accessToken"
        ? "<redacted>"
        : redactForLog(item);
  }
  return redacted;
}

export function hostPreviewEnabled(
  search: string,
  hasNativeHost = detectNativeHost(),
): boolean {
  if (hasNativeHost) {
    return false;
  }
  return new URLSearchParams(search).get("hostPreview") === "1";
}

export function detectNativeHost(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  const candidate = window as Window & {
    ReactNativeWebView?: unknown;
    webkit?: { messageHandlers?: { moongames?: unknown } };
    flutter_inappwebview?: unknown;
  };
  return (
    candidate.ReactNativeWebView !== undefined ||
    candidate.webkit?.messageHandlers?.moongames !== undefined ||
    candidate.flutter_inappwebview !== undefined
  );
}
