import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LUDO_OP } from "../src/hooks/useOnlineLudo";

describe("the Ludo online protocol", () => {
  it("uses the same opcodes as the authoritative Lua server", () => {
    const source = readFileSync(new URL("../../server/ludo_protocol.lua", import.meta.url), "utf8");
    const block = source.slice(source.indexOf("protocol.OP = {"), source.indexOf("protocol.ERROR"));
    for (const [name, value] of Object.entries(LUDO_OP)) {
      const match = block.match(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`));
      expect(match, `${name} is in the Lua protocol`).not.toBeNull();
      expect(Number(match![1])).toBe(value);
    }
  });

  it("keeps server opcodes below 100 and client opcodes above", () => {
    for (const [name, value] of Object.entries(LUDO_OP)) {
      if (name === "PING" || value >= 101) expect(value).toBeGreaterThanOrEqual(101);
      else expect(value).toBeLessThan(100);
    }
  });
});
