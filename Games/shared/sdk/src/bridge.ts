import type {
  GameToHostMessage,
  HostToGameMessage,
} from "./protocol";
import { isHostToGameMessage } from "./protocol";

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
      for (const handler of this.handlers) {
        handler(parsed);
      }
    }
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

  requestSessionRefresh(): void {
    this.send({ type: "requestSessionRefresh" });
  }
}
