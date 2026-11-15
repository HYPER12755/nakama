import { describe, expect, it } from "vitest";
import {
  parseServerAddress,
  sameOriginServerAddress,
} from "@moongames/game-sdk";

/**
 * A title reaches the server through the address the page was served from.
 * That is what lets a tunnel, a proxy or a CDN serve the whole platform from
 * one name, and it is why the client never carries a port of its own.
 */
describe("the address of the server", () => {
  it("takes the host and the port of the page", () => {
    const address = sameOriginServerAddress({
      hostname: "games.example.com",
      port: "21900",
      protocol: "http:",
    });
    expect(address.host).toBe("games.example.com");
    expect(address.port).toBe("21900");
    expect(address.useSSL).toBe(false);
    expect(address.label).toBe("http://games.example.com:21900");
  });

  it("uses the port the scheme means when the page had none", () => {
    const secure = sameOriginServerAddress({
      hostname: "games.example.com",
      port: "",
      protocol: "https:",
    });
    expect(secure.port).toBe("443");
    expect(secure.useSSL).toBe(true);

    const plain = sameOriginServerAddress({
      hostname: "games.example.com",
      port: "",
      protocol: "http:",
    });
    expect(plain.port).toBe("80");
  });

  it("reads a server that is somewhere else from the address", () => {
    const fallback = sameOriginServerAddress({
      hostname: "games.example.com",
      port: "21900",
      protocol: "http:",
    });
    const address = parseServerAddress("https://api.example.com:7443", fallback);
    expect(address.host).toBe("api.example.com");
    expect(address.port).toBe("7443");
    expect(address.useSSL).toBe(true);
  });

  it("falls back to the page when the address is empty or broken", () => {
    const fallback = sameOriginServerAddress({
      hostname: "games.example.com",
      port: "21900",
      protocol: "http:",
    });
    expect(parseServerAddress("", fallback)).toEqual(fallback);
    expect(parseServerAddress("not a url", fallback).host).toBe(
      fallback.host,
    );
  });
});
