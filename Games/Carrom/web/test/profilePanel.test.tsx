import { describe, expect, it } from "vitest";
import { ProfilePanel } from "@moongames/game-ui";
import type {
  GameHistoryEntry,
  GameLeaderboardEntry,
} from "@moongames/game-ui";

/**
 * Nakama encodes an empty Lua table as an empty object, so a player with no
 * finished games is sent `history: {}` and `entries: {}` instead of lists.
 *
 * The panel has to survive that. A crash while rendering takes the whole
 * page down, and the player is left looking at a blank screen the moment
 * they open the online table.
 *
 * The panel is called directly rather than mounted, so the test needs no
 * browser: the call itself is where the crash happened.
 */
describe("the profile panel", () => {
  it("survives the lists the server sends as objects", () => {
    const render = () =>
      ProfilePanel({
        connected: true,
        userId: "user-1",
        profile: null,
        // What the server really sends when the lists are empty.
        history: {} as unknown as GameHistoryEntry[],
        leaderboard: {} as unknown as GameLeaderboardEntry[],
        myLeaderboard: null,
        loading: false,
        error: null,
        onRefresh: () => undefined,
      });

    // The crash was `history.slice is not a function`.
    expect(() => render()).not.toThrow();
  });

  it("still shows the panel with real lists", () => {
    const element = ProfilePanel({
      connected: true,
      userId: "user-1",
      profile: null,
      history: [],
      leaderboard: [],
      myLeaderboard: null,
      loading: false,
      error: null,
      onRefresh: () => undefined,
    });
    expect(element).not.toBeNull();
  });
});
