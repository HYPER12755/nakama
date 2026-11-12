import { describe, expect, it } from "vitest";
import {
  inviteMessage,
  inviteTokenFromLink,
  insertEmojiAtSelection,
  normalizeInvite,
  parseInviteMessage,
  rememberRecentEmoji,
  resolveInviteView,
  type MoonGamesInvite,
} from "@moongames/game-sdk";
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
    invite: null,
  };
}

const sampleInvite: MoonGamesInvite = {
  inviteId: "invite-1",
  token: "token-1",
  gameId: "chess",
  gameTitle: "Chess",
  mode: "private",
  matchId: "match-1",
  sender: { userId: "self", username: "Nova", displayName: null, avatarUrl: null },
  recipient: { userId: "friend", username: "friend", displayName: null, avatarUrl: null },
  status: "pending",
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_086_400_000,
  joinPath: "/invite/invite-1",
  deepLink: "moongames://invite/invite-1",
  previewUrl: null,
  message: null,
};

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
      invite: null,
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

  it("parses invite chat messages and previews them without dropping text messages", () => {
    const payload = inviteMessage(sampleInvite);
    expect(normalizeInvite(payload.invite)).toEqual(sampleInvite);
    expect(
      normalizeChatMessage(
        {
          message_id: "invite-message",
          sender_id: "self",
          username: "Nova",
          create_time: "2026-11-12T10:00:00.000Z",
          content: payload,
        },
        "self",
      ),
    ).toMatchObject({
      id: "invite-message",
      own: true,
      invite: sampleInvite,
      text: "",
    });
    expect(chatPreview([{ ...message("invite", "", 4), invite: sampleInvite }])).toBe(
      "Chess invite",
    );

    const flutterPayload = {
      type: "moongames.invite",
      version: "1",
      invite: JSON.stringify(sampleInvite),
    };
    expect(parseInviteMessage(flutterPayload)).toEqual(sampleInvite);
    const accepted = {
      ...sampleInvite,
      status: "accepted" as const,
      expiresAt: Date.now() + 60_000,
    };
    expect(resolveInviteView(accepted, "self")?.canJoin).toBe(true);
    expect(resolveInviteView(accepted, "friend")?.canJoin).toBe(true);
    expect(
      normalizeChatMessage(
        {
          message_id: "flutter-invite",
          sender_id: "friend",
          username: "Kai",
          create_time: "2026-11-12T10:01:00.000Z",
          content: flutterPayload,
        },
        "self",
      )?.invite,
    ).toEqual(sampleInvite);

    expect(inviteTokenFromLink("https://games.example/app/invite/token-1")).toBe(
      "token-1",
    );
    expect(inviteTokenFromLink("moongames://invite/token-1")).toBe("token-1");
    expect(inviteTokenFromLink(sampleInvite.deepLink)).toBe("invite-1");
    expect(inviteTokenFromLink("https://games.example/app/?invite=token-1")).toBe(
      "token-1",
    );
    expect(inviteTokenFromLink("/app/?invite=token-1")).toBe("token-1");
    expect(inviteTokenFromLink("?invite=token-1")).toBe("token-1");
    expect(inviteTokenFromLink("https://games.example/app/")).toBeNull();
  });

  it("inserts emoji at the selection and keeps recent emoji unique", () => {
    expect(insertEmojiAtSelection("Hello world", "🌙", 6, 11)).toEqual({
      value: "Hello 🌙",
      caret: 8,
    });
    expect(insertEmojiAtSelection("ab", "🎉", 1, 1)).toEqual({
      value: "a🎉b",
      caret: 3,
    });
    expect(rememberRecentEmoji(["🌙", "🎉"], "🌙")).toEqual(["🌙", "🎉"]);
    expect(rememberRecentEmoji(["🌙"], "🎉")).toEqual(["🎉", "🌙"]);
  });
});
