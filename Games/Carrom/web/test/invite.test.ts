import { describe, expect, it } from "vitest";
import { parseMatchInvite } from "@moongames/game-ui";

/**
 * A game opened with a room in its address must open that room. The menu
 * adds the room to the address when an invite is accepted, so a game that
 * ignores it would sit at a local board while the other player waits at
 * the table.
 */
describe("a room in the address", () => {
  it("is found when the menu opens a room", () => {
    const invite = parseMatchInvite("?match=abc-123");
    expect(invite?.matchId).toBe("abc-123");
    expect(invite?.spectate).toBe(false);
  });

  it("knows when the room is only to be watched", () => {
    expect(parseMatchInvite("?match=abc-123&spectate=1")?.spectate).toBe(true);
  });

  it("is not found when there is no room", () => {
    expect(parseMatchInvite("")).toBeNull();
    expect(parseMatchInvite("?other=1")).toBeNull();
  });
});
