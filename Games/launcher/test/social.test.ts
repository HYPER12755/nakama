import { describe, expect, it } from "vitest";
import {
  FRIEND_STATE,
  acceptedFriends,
  chatPreview,
  mergeChatMessages,
  mergeFriends,
  normalizeChatMessage,
  normalizeFriend,
  outgoingFriendRequests,
  type LauncherFriend,
  type SocialMessage,
} from "../src/lib/social";

function friend(
  id: string,
  state: number,
  online = false,
): LauncherFriend {
  return {
    userId: id,
    username: id,
    displayName: null,
    avatarUrl: null,
    state,
    online,
  };
}

function message(id: string, text: string, createdAt: number): SocialMessage {
  return {
    id,
    senderId: "friend",
    username: "friend",
    text,
    createdAt,
    own: false,
  };
}

describe("launcher social helpers", () => {
  it("normalizes friends and filters by relationship state", () => {
    expect(
      normalizeFriend(
        {
          state: 0,
          user: { id: "friend-1", username: "Nova", display_name: "Nova Sky" },
        },
        new Set(["friend-1"]),
      ),
    ).toEqual({
      userId: "friend-1",
      username: "Nova",
      displayName: "Nova Sky",
      avatarUrl: null,
      state: 0,
      online: true,
    });
    expect(normalizeFriend({ state: 0 }, new Set())).toBeNull();

    const list = [
      friend("mutual", FRIEND_STATE.mutual),
      friend("incoming", FRIEND_STATE.requested),
      friend("outgoing", FRIEND_STATE.invited),
    ];
    expect(acceptedFriends(list).map((item) => item.userId)).toEqual(["mutual"]);
    expect(outgoingFriendRequests(list).map((item) => item.userId)).toEqual([
      "outgoing",
    ]);
  });

  it("merges friends, prefers online players, and sorts names", () => {
    const merged = mergeFriends(
      [friend("zulu", 0, false), friend("alpha", 0, false)],
      [friend("zulu", 0, true), friend("bravo", 0, false)],
    );
    expect(merged.map((item) => item.userId)).toEqual([
      "zulu",
      "alpha",
      "bravo",
    ]);
  });

  it("normalizes chat text, deduplicates updates, and previews messages", () => {
    const normalized = normalizeChatMessage(
      {
        message_id: "m-1",
        sender_id: "friend",
        username: "Nova",
        create_time: "2026-11-12T10:00:00.000Z",
        content: { text: "  Hello there  " },
      },
      "self",
    );
    expect(normalized).toEqual({
      id: "m-1",
      senderId: "friend",
      username: "Nova",
      text: "Hello there",
      createdAt: Date.parse("2026-11-12T10:00:00.000Z"),
      own: false,
    });
    expect(
      normalizeChatMessage({ content: { text: "   " } }, "self"),
    ).toBeNull();

    const merged = mergeChatMessages(
      [message("a", "First", 1)],
      [message("a", "Updated", 1), message("b", "Second", 2)],
    );
    expect(merged.map((item) => item.id)).toEqual(["a", "b"]);
    expect(chatPreview(merged)).toBe("Second");

    const own = { ...message("c", "Mine", 3), own: true };
    expect(chatPreview([own])).toBe("You: Mine");
    expect(chatPreview([])).toBe("Start a conversation");
  });
});
