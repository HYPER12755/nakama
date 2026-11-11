import type {
  GameSharePayload,
  GameToHostMessage,
  HapticPattern,
  HostToGameMessage,
} from "./protocol";
import { isHostToGameMessage } from "./protocol";
import {
  WEB_VIBRATION_PATTERNS,
  compactSharePayload,
  normalizeExternalUrl,
  sharePayloadText,
  type GameShareOutcome,
} from "./platform";

export interface HostTransport {
  post(message: GameToHostMessage): void;
  subscribe(handler: (message: HostToGameMessage) => void): () => void;
  readonly isHosted?: boolean;
}

type MoonGamesWindow = Window & {
  ReactNativeWebView?: { postMessage: (data: string) => void };
  webkit?: {
    messageHandlers?: {
      moongames?: { postMessage: (data: unknown) => void };
    };
  };
  flutter_inappwebview?: {
    callHandler: (handlerName: string, ...args: unknown[]) => Promise<unknown>;
  };
};

export class BrowserTransport implements HostTransport {
  readonly isHosted: boolean;
  private readonly handlers = new Set<(message: HostToGameMessage) => void>();

  private readonly emit = (message: HostToGameMessage) => {
    for (const handler of this.handlers) {
      handler(message);
    }
  };

  private readonly handleEvent = (event: Event) => {
    const data = (event as MessageEvent).data;
    let parsed: unknown = data;

    if (typeof data === "string") {
      try {
        parsed = JSON.parse(data);
      } catch {
        return;
      }
    }

    if (isHostToGameMessage(parsed)) {
      this.emit(parsed);
    }
  };

  private readonly handleVisibility = () => {
    if (typeof document === "undefined") {
      return;
    }
    this.emit({
      type: document.visibilityState === "hidden" ? "pause" : "resume",
    });
  };

  private readonly handlePageHide = () => {
    this.emit({ type: "pause" });
  };

  private readonly handlePageShow = () => {
    this.emit({ type: "resume" });
  };

  constructor() {
    if (typeof window === "undefined") {
      this.isHosted = false;
      return;
    }

    const hostWindow = window as MoonGamesWindow;
    this.isHosted =
      hostWindow.ReactNativeWebView !== undefined ||
      hostWindow.webkit?.messageHandlers?.moongames !== undefined ||
      hostWindow.flutter_inappwebview !== undefined;

    window.addEventListener("message", this.handleEvent);
    document.addEventListener("message", this.handleEvent);

    // Native hosts send their own lifecycle messages. A standalone browser
    // has no host, so emulate the same pause/resume contract from page
    // visibility and the back/forward cache.
    if (!this.isHosted) {
      document.addEventListener("visibilitychange", this.handleVisibility);
      window.addEventListener("pagehide", this.handlePageHide);
      window.addEventListener("pageshow", this.handlePageShow);
    }
  }

  post(message: GameToHostMessage): void {
    if (typeof window === "undefined") {
      return;
    }

    const hostWindow = window as MoonGamesWindow;
    const payload = JSON.stringify(message);

    if (hostWindow.ReactNativeWebView) {
      hostWindow.ReactNativeWebView.postMessage(payload);
      return;
    }

    if (hostWindow.webkit?.messageHandlers?.moongames) {
      hostWindow.webkit.messageHandlers.moongames.postMessage(message);
      return;
    }

    if (hostWindow.flutter_inappwebview) {
      void hostWindow.flutter_inappwebview.callHandler("moongames", message);
      return;
    }

    // Standalone browser mode: expose outgoing messages for local debugging.
    window.dispatchEvent(new CustomEvent("moongames:out", { detail: message }));
  }

  subscribe(handler: (message: HostToGameMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }
}

export class GameBridge {
  private readonly transport: HostTransport;
  private readonly handlers = new Set<(message: HostToGameMessage) => void>();

  constructor(transport: HostTransport = new BrowserTransport()) {
    this.transport = transport;
    this.transport.subscribe((message) => {
      for (const handler of this.handlers) {
        handler(message);
      }
    });
  }

  onMessage(handler: (message: HostToGameMessage) => void): () => void {
    this.handlers.add(handler);
    return () => {
      this.handlers.delete(handler);
    };
  }

  get isHosted(): boolean {
    return this.transport.isHosted === true;
  }

  send(message: GameToHostMessage): void {
    this.transport.post(message);
  }

  ready(gameId: string, version: string): void {
    this.send({ type: "ready", gameId, version });
  }

  toast(message: string, level: "info" | "success" | "error" = "info"): void {
    this.send({ type: "toast", message, level });
  }

  exit(reason?: string): void {
    this.send({ type: "exit", reason });
  }

  haptic(pattern: HapticPattern): void {
    if (this.isHosted) {
      this.send({ type: "haptic", pattern });
      return;
    }
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.vibrate === "function"
    ) {
      try {
        navigator.vibrate(WEB_VIBRATION_PATTERNS[pattern]);
      } catch {
        // Vibration is a progressive enhancement and may be blocked.
      }
    }
  }

  sound(name: string): void {
    if (this.isHosted) {
      this.send({ type: "sound", name });
      return;
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("moongames:sound", { detail: { name } }),
      );
    }
  }

  /** Open a safe external URL. Returns false for unsupported/malformed URLs. */
  openUrl(value: string): boolean {
    const url = normalizeExternalUrl(value);
    if (url === null) {
      return false;
    }
    if (this.isHosted) {
      this.send({ type: "openUrl", url });
      return true;
    }
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    }
    return false;
  }

  /**
   * Ask the host to open a native share sheet. In a standalone browser, use
   * Web Share and fall back to copying the share text when it is unavailable.
   */
  async share(payload: GameSharePayload): Promise<GameShareOutcome> {
    const compact = compactSharePayload(payload);
    const text = sharePayloadText(compact);
    if (text.length === 0) {
      return "unavailable";
    }
    if (this.isHosted) {
      this.send({ type: "share", ...compact });
      return "host";
    }

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share(compact);
        return "shared";
      } catch (cause) {
        if (isShareCancellation(cause)) {
          return "cancelled";
        }
      }
    }

    return (await copyTextToClipboard(text)) ? "copied" : "unavailable";
  }

  requestSessionRefresh(): void {
    this.send({ type: "requestSessionRefresh" });
  }
}

function isShareCancellation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { name?: unknown }).name === "AbortError"
  );
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the selection-based fallback.
    }
  }

  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  try {
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
