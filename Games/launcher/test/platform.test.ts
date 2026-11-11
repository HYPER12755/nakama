import { describe, expect, it } from "vitest";
import {
  compactSharePayload,
  normalizeExternalUrl,
  sharePayloadText,
} from "@moongames/game-sdk";

describe("shared browser platform fallbacks", () => {
  it("allows safe external URL schemes only", () => {
    expect(normalizeExternalUrl(" https://games.example.com/chess ")).toBe(
      "https://games.example.com/chess",
    );
    expect(normalizeExternalUrl("mailto:hello@example.com")).toMatch(
      /^mailto:hello@example\.com$/,
    );
    expect(normalizeExternalUrl("tel:+15551234567")).toMatch(/^tel:/);
    expect(normalizeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeExternalUrl("data:text/html,hello")).toBeNull();
    expect(normalizeExternalUrl("/relative/path")).toBeNull();
  });

  it("normalizes and joins share text", () => {
    const payload = compactSharePayload({
      title: "  Chess  ",
      text: "  Join my table  ",
      url: " https://games.example.com/chess/?match=abc ",
    });
    expect(payload).toEqual({
      title: "Chess",
      text: "Join my table",
      url: "https://games.example.com/chess/?match=abc",
    });
    expect(sharePayloadText(payload)).toBe(
      "Chess\nJoin my table\nhttps://games.example.com/chess/?match=abc",
    );
  });

  it("drops blank share fields", () => {
    expect(compactSharePayload({ title: " ", text: "" })).toEqual({});
    expect(sharePayloadText({})).toBe("");
  });
});
