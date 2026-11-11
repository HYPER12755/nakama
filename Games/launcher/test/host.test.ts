import { describe, expect, it, vi } from "vitest";
import {
  hasLauncherBridge,
  launchCatalogGame,
  type CatalogLaunchRequest,
  type LauncherWindow,
} from "../src/lib/host";

describe("launcher host bridge", () => {
  it("uses a custom MoonGamesLauncher bridge first", () => {
    const launchGame = vi.fn<(request: CatalogLaunchRequest) => void>();
    const windowLike: LauncherWindow = {
      MoonGamesLauncher: { launchGame },
    };
    expect(hasLauncherBridge(windowLike)).toBe(true);
    expect(launchCatalogGame("chess", "https://example.com/chess/", windowLike)).toBe(
      "bridge",
    );
    expect(launchGame).toHaveBeenCalledWith({
      type: "moongames.launch-game",
      gameId: "chess",
      webUrl: "https://example.com/chess/",
    });
  });

  it("posts a launch request to React Native WebView", () => {
    const postMessage = vi.fn<(message: string) => void>();
    const windowLike: LauncherWindow = {
      ReactNativeWebView: { postMessage },
    };
    expect(launchCatalogGame("chess", null, windowLike)).toBe("bridge");
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      type: "moongames.launch-game",
      gameId: "chess",
      webUrl: null,
    });
  });

  it("uses the Flutter InAppWebView handler and ignores async failures", () => {
    const callHandler = vi.fn(
      async (_name: string, ..._args: unknown[]) => undefined,
    );
    const windowLike: LauncherWindow = {
      flutter_inappwebview: { callHandler },
    };
    expect(launchCatalogGame("chess", null, windowLike)).toBe("bridge");
    expect(callHandler).toHaveBeenCalledWith("moongamesLaunchGame", {
      type: "moongames.launch-game",
      gameId: "chess",
      webUrl: null,
    });
  });

  it("navigates normally when no bridge is present", () => {
    const assign = vi.fn<(url: string) => void>();
    expect(
      launchCatalogGame("chess", "https://example.com/chess/", { location: { assign } }),
    ).toBe("navigate");
    expect(assign).toHaveBeenCalledWith("https://example.com/chess/");
    expect(hasLauncherBridge({})).toBe(false);
    expect(launchCatalogGame("cards", null, {})).toBe("unavailable");
  });
});
