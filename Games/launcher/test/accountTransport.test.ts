import { describe, expect, it } from "vitest";
import { accountTransportSafe } from "@moongames/game-sdk";
import { Client } from "@heroiclabs/nakama-js";

/**
 * The rule for accounts, checked against the real addresses: the local
 * stack, the player's own network, and a public plain tunnel.
 */
describe("making an account", () => {
  it("refuses a public plain connection", () => {
    expect(accountTransportSafe("bore.pub", false)).toBe(false);
  });

  it("allows a public secure connection", () => {
    expect(accountTransportSafe("bore.pub", true)).toBe(true);
  });

  it("allows the local stack", () => {
    expect(accountTransportSafe("127.0.0.1", false)).toBe(true);
    expect(accountTransportSafe("localhost", false)).toBe(true);
  });

  it("allows the player's own network", () => {
    expect(accountTransportSafe("192.168.0.100", false)).toBe(true);
    expect(accountTransportSafe("10.185.24.241", false)).toBe(true);
  });

  it("still makes an account on the local stack", async () => {
    const client = new Client("defaultkey", "127.0.0.1", "4174", false, 20000);
    const session = await client.authenticateDevice(
      `local-${Date.now()}`,
      true,
    );
    expect(typeof session.token).toBe("string");
  }, 30000);
});
