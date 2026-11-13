import { describe, expect, it, vi } from "vitest";
import type { Client, Session } from "@heroiclabs/nakama-js";
import {
  MoonGamesAccountError,
  MoonGamesSocialClient,
  inviteShareUrl,
  linkGuestEmail,
  linkHostAccount,
  normalizeAccountEmail,
  syncMoonGamesUsername,
  validateMoonGamesPassword,
  validateMoonGamesUsername,
} from "@moongames/social";
import type { MoonGamesInvite } from "@moongames/game-sdk";

const session = {
  user_id: "self",
  username: "Nova",
  token: "token",
  refresh_token: "refresh",
  created: true,
} as unknown as Session;

const invite: MoonGamesInvite = {
  inviteId: "invite-1",
  token: "a-token-that-is-long-enough",
  gameId: "chess",
  gameTitle: "Chess",
  mode: "private",
  matchId: "match-1",
  sender: {
    userId: "self",
    username: "Nova",
    displayName: null,
    avatarUrl: null,
  },
  recipient: {
    userId: "friend",
    username: "Kai",
    displayName: null,
    avatarUrl: null,
  },
  status: "pending",
  createdAt: 1_700_000_000_000,
  expiresAt: 1_700_086_400_000,
  joinPath: "/invite/invite-1",
  deepLink: "moongames://invite/invite-1",
  previewUrl: null,
  message: null,
};

function fakeClient(): Client {
  return {
    rpc: vi.fn(async (_session: Session, id: string) => {
      if (id === "moongames_notifications_state") {
        return { payload: { ok: true, readIds: ["read-1"] } };
      }
      if (id === "moongames_invite_create") {
        return { payload: { ok: true, invite } };
      }
      return { payload: { ok: true } };
    }),
    listNotifications: vi.fn(async () => ({
      notifications: [
        {
          id: "invite-notification",
          code: 2101,
          subject: "Nova invited you to Chess",
          content: { invite: { ...invite, token: undefined } },
          create_time: "2026-11-12T10:00:00.000Z",
          sender_id: "self",
        },
        {
          id: "read-1",
          code: -2,
          subject: "Friend request",
          content: {},
          create_time: "2026-11-12T09:00:00.000Z",
          sender_id: "friend",
        },
        {
          id: "duplicate-removal",
          code: -9,
          subject: "Friend removed",
          content: {},
          create_time: "2026-11-12T08:00:00.000Z",
          sender_id: "friend",
        },
      ],
    })),
  } as unknown as Client;
}

describe("shared social client", () => {
  it("creates invites, replays persistent invite events, and preserves read state", async () => {
    const client = new MoonGamesSocialClient({
      client: fakeClient(),
      session,
      selfUserId: "self",
    });
    await expect(
      client.createInvite({ gameId: "chess", recipientId: "friend" }),
    ).resolves.toEqual(invite);

    const listed = await client.listNotifications();
    expect(listed.some((notification) => notification.code === -9)).toBe(false);

    const replayed = await client.replayInvites();
    expect(replayed).toHaveLength(1);
    expect(replayed[0].id).toBe("invite-notification");
    expect(replayed[0].kind).toBe("invite");
    expect(inviteShareUrl("https://games.example/app/", invite)).toBe(
      "https://games.example/app/invite/a-token-that-is-long-enough",
    );
  });

  it("paginates old notifications so a recent invite is never hidden", async () => {
    const oldNotifications = Array.from({ length: 50 }, (_, index) => ({
      id: `old-${index}`,
      code: -1,
      subject: `Old chat ${index}`,
      content: {},
      create_time: `2026-11-12T09:${String(index).padStart(2, "0")}:00Z`,
      sender_id: "friend",
    }));
    const inviteNotification = {
      id: "new-invite",
      code: 2101,
      subject: "Nova invited you to Chess",
      content: { invite: { ...invite, token: undefined } },
      create_time: "2026-11-13T10:00:00Z",
      sender_id: "self",
    };
    const listNotifications = vi
      .fn()
      .mockResolvedValueOnce({
        notifications: oldNotifications,
        cacheable_cursor: "page-2",
      })
      .mockResolvedValueOnce({
        notifications: [inviteNotification],
        cacheable_cursor: "page-3",
      })
      .mockResolvedValueOnce({
        notifications: [],
        cacheable_cursor: "page-3",
      });
    const client = {
      rpc: vi.fn(async () => ({ payload: { ok: true, readIds: [] } })),
      listNotifications,
    } as unknown as Client;
    const social = new MoonGamesSocialClient({
      client,
      session,
      selfUserId: "self",
    });

    const listed = await social.listNotifications(50);

    expect(listed).toHaveLength(51);
    expect(listed[0].id).toBe("new-invite");
    expect(listed[0].kind).toBe("invite");
    expect(listNotifications).toHaveBeenNthCalledWith(1, session, 50, undefined);
    expect(listNotifications).toHaveBeenNthCalledWith(2, session, 50, "page-2");
    expect(listNotifications).toHaveBeenNthCalledWith(3, session, 50, "page-3");
  });

  it("sends the invite card through the direct chat channel", async () => {
    const writeChatMessage = vi.fn(
      async (_channelId: string, _content: Record<string, unknown>) => ({
        message_id: "message-1",
        create_time: "2026-11-13T10:00:00Z",
      }),
    );
    const socket = {
      joinChat: vi.fn(async () => ({ id: "4.self.friend." })),
      writeChatMessage,
    };
    const social = new MoonGamesSocialClient({
      client: fakeClient(),
      session,
      socket: socket as never,
      selfUserId: "self",
    });

    const message = await social.sendInviteMessage("friend", invite);

    expect(socket.joinChat).toHaveBeenCalledWith("friend", 2, true, false);
    expect(writeChatMessage).toHaveBeenCalledTimes(1);
    const content = writeChatMessage.mock.calls[0]?.[1] as {
      type?: string;
      invite?: { token?: string };
    };
    expect(content.type).toBe("moongames.invite");
    expect(content.invite?.token).toBeUndefined();
    expect(message.invite?.token).toBe(invite.token);
  });

  it("queues live notifications until the host attaches its own UI", async () => {
    const socket = {
      received: [] as unknown[],
      onnotification(this: { received: unknown[] }, notification: unknown) {
        this.received.push(notification);
      },
      joinChat: vi.fn(),
      writeChatMessage: vi.fn(),
    };
    const client = new MoonGamesSocialClient({
      client: fakeClient(),
      session,
      socket: socket as never,
      selfUserId: "self",
    });
    expect(client.drainPendingNotifications()).toEqual([]);
    socket.onnotification?.({
      id: "live-invite",
      code: 2101,
      subject: "Live invite",
      content: { invite: { ...invite, token: undefined } },
      create_time: "2026-11-12T11:00:00.000Z",
      sender_id: "friend",
    });
    const pending = client.drainPendingNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe("live-invite");
    expect(pending[0].invite?.inviteId).toBe("invite-1");
    expect(client.drainPendingNotifications()).toEqual([]);

    socket.onnotification?.({
      id: "duplicate-removal",
      code: -9,
      subject: "Friend removed",
      content: {},
      create_time: "2026-11-12T11:05:00.000Z",
      sender_id: "friend",
    });
    expect(client.drainPendingNotifications()).toEqual([]);
    expect(socket.received).toHaveLength(2);
  });

  it("validates host account inputs and links with an explicit password", async () => {
    expect(normalizeAccountEmail("  Nova@Example.COM ")).toBe(
      "nova@example.com",
    );
    expect(() => normalizeAccountEmail("not-an-email")).toThrow(
      MoonGamesAccountError,
    );
    expect(() => validateMoonGamesPassword("short")).toThrow(
      MoonGamesAccountError,
    );
    expect(validateMoonGamesUsername("  Nova_1 ")).toBe("Nova_1");
    expect(() => validateMoonGamesUsername("no spaces")).toThrow(
      MoonGamesAccountError,
    );

    const client = {
      linkEmail: vi.fn(async () => undefined),
      updateAccount: vi.fn(async () => undefined),
      authenticateEmail: vi.fn(async () => session),
    } as unknown as Client;
    await syncMoonGamesUsername({
      client,
      session,
      username: " Nova_2 ",
    });
    expect(client.updateAccount).toHaveBeenLastCalledWith(session, {
      username: "Nova_2",
    });
    await expect(
      linkGuestEmail({
        client,
        session,
        email: "Nova@Example.com",
        password: "long-enough-password",
        username: "Nova",
      }),
    ).resolves.toBe(session);
    expect(client.linkEmail).toHaveBeenCalledWith(session, {
      email: "nova@example.com",
      password: "long-enough-password",
    });
    expect(client.updateAccount).toHaveBeenCalledWith(session, {
      username: "Nova",
    });
    expect(client.authenticateEmail).toHaveBeenCalledWith(
      "nova@example.com",
      "long-enough-password",
      false,
    );

    const usernameConflictClient = {
      linkEmail: vi.fn(async () => undefined),
      updateAccount: vi.fn(async () => {
        throw new Error("username in use");
      }),
      authenticateEmail: vi.fn(async () => session),
    } as unknown as Client;
    await expect(
      linkGuestEmail({
        client: usernameConflictClient,
        session,
        email: "nova@example.com",
        password: "long-enough-password",
        username: "Taken",
      }),
    ).resolves.toBe(session);
    expect(usernameConflictClient.authenticateEmail).toHaveBeenCalled();

    const existingClient = {
      authenticateEmail: vi.fn(async () => session),
    } as unknown as Client;
    await expect(
      linkHostAccount({
        client: existingClient,
        guestSession: session,
        email: "nova@example.com",
        password: "host-account-password",
        mode: "existing",
      }),
    ).resolves.toBe(session);
    expect(existingClient.authenticateEmail).toHaveBeenCalledWith(
      "nova@example.com",
      "host-account-password",
      false,
    );
    await expect(
      linkHostAccount({
        client: existingClient,
        guestSession: session,
        email: "nova@example.com",
        password: "host-account-password",
        mode: "not-a-mode" as never,
      }),
    ).rejects.toMatchObject({ code: "invalid_mode" });
  });
});
