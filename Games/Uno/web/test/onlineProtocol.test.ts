import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UNO_OP } from "@moongames/uno-core";

const protocolPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "../../server/uno_protocol.lua",
);

describe("Uno online protocol", () => {
  it("keeps TypeScript opcodes identical to the Lua protocol", () => {
    const source = readFileSync(protocolPath, "utf8");
    for (const [name, value] of Object.entries(UNO_OP)) {
      const match = source.match(new RegExp(`${name}\\s*=\\s*(\\d+)`));
      expect(match, `${name} exists in Lua`).not.toBeNull();
      expect(Number(match?.[1])).toBe(value);
    }
  });

  it("keeps client opcodes separate from server opcodes", () => {
    for (const [name, value] of Object.entries(UNO_OP)) {
      if (name.startsWith("PLAY_") || name.startsWith("DRAW_") || name.startsWith("CHALLENGE_")
        || name === "CHAT_SEND" || name === "REQUEST_STATE" || name === "RESIGN" || name === "PING") {
        expect(value).toBeGreaterThanOrEqual(100);
      } else {
        expect(value).toBeLessThan(100);
      }
    }
  });
});
