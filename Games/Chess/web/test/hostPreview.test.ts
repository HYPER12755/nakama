import { describe, expect, it } from "vitest";
import type { HostToGameMessage } from "@moongames/game-sdk";
import {
  BrowserPreviewHost,
  hostPreviewEnabled,
  sessionFromToken,
  type PreviewLogEntry,
} from "../src/preview/hostPreview";

describe("browser host preview", () => {
  it("sends init after ready and records both directions", async () => {
    const host = new BrowserPreviewHost({ locale: "en-GB" });
    const messages: HostToGameMessage[] = [];
    const entries: PreviewLogEntry[] = [];
    host.subscribe((message) => messages.push(message));
    host.subscribeLog((entry) => entries.push(entry));

    host.post({ type: "ready", gameId: "chess", version: "0.1.0" });
    await Promise.resolve();

    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "init",
      protocol: 1,
      config: {
        protocol: 1,
        gameId: "chess",
        locale: "en-GB",
        theme: { mode: "dark" },
      },
    });
    expect(host.currentGameId).toBe("chess");
    expect(host.currentGameVersion).toBe("0.1.0");
    expect(entries.map((entry) => entry.direction)).toEqual([
      "game-to-host",
      "system",
      "host-to-game",
    ]);
  });

  it("sends theme and lifecycle messages only after ready", async () => {
    const host = new BrowserPreviewHost();
    const messages: HostToGameMessage[] = [];
    host.subscribe((message) => messages.push(message));

    host.setTheme({ mode: "light" });
    host.pause();
    expect(messages).toHaveLength(0);

    host.post({ type: "ready", gameId: "chess", version: "0.1.0" });
    await Promise.resolve();
    host.setTheme({ mode: "light" });
    host.pause();
    host.resume();

    expect(messages.map((message) => message.type)).toEqual([
      "init",
      "theme",
      "pause",
      "resume",
    ]);
  });

  it("enables preview only in a non-native browser", () => {
    expect(hostPreviewEnabled("?hostPreview=1", false)).toBe(true);
    expect(hostPreviewEnabled("?hostPreview=1", true)).toBe(false);
    expect(hostPreviewEnabled("?hostPreview=0", false)).toBe(false);
    expect(hostPreviewEnabled("", false)).toBe(false);
  });

  it("decodes a Nakama session JWT without trusting the header", () => {
    const payload = "eyJ1aWQiOiJ1MSIsInVzbiI6ImFsaWNlIiwiZXhwIjoxODkzNDU2MDAwfQ";
    const token = `e30.${payload}.signature`;

    expect(sessionFromToken(token, "refresh-1")).toEqual({
      token,
      refreshToken: "refresh-1",
      userId: "u1",
      username: "alice",
      expiresAt: 1_893_456_000,
    });
    expect(sessionFromToken("not-a-jwt")).toBeNull();
    expect(sessionFromToken("e30.bm90LWpzb24.signature")).toBeNull();
    expect(
      sessionFromToken(
        "e30.eyJ1aWQiOiJ1MSIsInVzbiI6IsOFbGljZSIsImV4cCI6MTg5MzQ1NjAwMH0.signature",
      )?.username,
    ).toBe("Ålice");
  });

  it("sends a session message and redacts tokens from the log", async () => {
    const host = new BrowserPreviewHost();
    host.subscribe(() => undefined);
    host.post({ type: "ready", gameId: "chess", version: "0.1.0" });
    await Promise.resolve();
    host.setSession({
      token: "secret-token",
      refreshToken: "secret-refresh",
      userId: "u1",
      username: "alice",
      expiresAt: 1_893_456_000,
    });

    const serialized = JSON.stringify(host.logEntries);
    expect(serialized).toContain("<redacted>");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("secret-refresh");
    expect(host.hasSession).toBe(true);
  });
});
