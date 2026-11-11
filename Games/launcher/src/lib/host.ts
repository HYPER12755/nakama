export interface CatalogLaunchRequest {
  type: "moongames.launch-game";
  gameId: string;
  webUrl: string | null;
}

export interface MoonGamesLauncherHost {
  launchGame?: (request: CatalogLaunchRequest) => void;
}

export interface LauncherWindow {
  MoonGamesLauncher?: MoonGamesLauncherHost;
  ReactNativeWebView?: { postMessage: (message: string) => void };
  flutter_inappwebview?: {
    callHandler?: (name: string, ...args: unknown[]) => unknown;
  };
  webkit?: {
    messageHandlers?: {
      moongamesLauncher?: { postMessage: (message: unknown) => void };
    };
  };
  MoonGamesAndroid?: { launchGame?: (message: string) => void };
  location?: { assign: (url: string) => void };
}

export type LaunchResult = "bridge" | "navigate" | "unavailable";

export function hasLauncherBridge(windowLike: LauncherWindow): boolean {
  return (
    typeof windowLike.MoonGamesLauncher?.launchGame === "function" ||
    typeof windowLike.flutter_inappwebview?.callHandler === "function" ||
    typeof windowLike.ReactNativeWebView?.postMessage === "function" ||
    typeof windowLike.webkit?.messageHandlers?.moongamesLauncher?.postMessage ===
      "function" ||
    typeof windowLike.MoonGamesAndroid?.launchGame === "function"
  );
}

/**
 * Launch a catalog game through a native menu bridge when one exists. The bridge
 * only reports the selected game id; the native app must still resolve and verify
 * the bundle through the normal host.
 */
export function launchCatalogGame(
  gameId: string,
  webUrl: string | null,
  windowLike: LauncherWindow,
): LaunchResult {
  const request: CatalogLaunchRequest = {
    type: "moongames.launch-game",
    gameId,
    webUrl,
  };

  if (typeof windowLike.MoonGamesLauncher?.launchGame === "function") {
    windowLike.MoonGamesLauncher.launchGame(request);
    return "bridge";
  }

  if (typeof windowLike.flutter_inappwebview?.callHandler === "function") {
    try {
      const result = windowLike.flutter_inappwebview.callHandler(
        "moongamesLaunchGame",
        request,
      );
      if (
        typeof result === "object" &&
        result !== null &&
        "catch" in result &&
        typeof (result as Promise<unknown>).catch === "function"
      ) {
        void (result as Promise<unknown>).catch(() => undefined);
      }
      return "bridge";
    } catch {
      // Fall through to another bridge or normal navigation.
    }
  }

  if (typeof windowLike.ReactNativeWebView?.postMessage === "function") {
    windowLike.ReactNativeWebView.postMessage(JSON.stringify(request));
    return "bridge";
  }

  const iosHandler = windowLike.webkit?.messageHandlers?.moongamesLauncher;
  if (typeof iosHandler?.postMessage === "function") {
    iosHandler.postMessage(request);
    return "bridge";
  }

  if (typeof windowLike.MoonGamesAndroid?.launchGame === "function") {
    windowLike.MoonGamesAndroid.launchGame(JSON.stringify(request));
    return "bridge";
  }

  if (webUrl !== null) {
    windowLike.location?.assign(webUrl);
    return "navigate";
  }

  return "unavailable";
}

export function currentLauncherWindow(): LauncherWindow {
  return window as unknown as LauncherWindow;
}
