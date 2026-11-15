import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Client,
  Session,
  type ChannelMessage,
  type Friend,
  type Socket,
  type StatusPresenceEvent,
} from "@heroiclabs/nakama-js";
import {
  inviteIsExpired,
  isInviteJoinable,
  mergeNotifications,
  notificationActionLabel,
  resolveInviteView,
  unreadNotificationCount,
  type GameSession,
  type InviteCreateInput,
  type InviteResolveResult,
  type MoonGamesInvite,
  type NakamaConnection,
  type SocialNotification,
  type SocialPlayerSummary,
} from "@moongames/game-sdk";
import {
  MoonGamesSocialClient,
  type NotificationReadState,
} from "@moongames/social";
import {
  authErrorDetail,
  authErrorMessage,
  clearStoredLauncherEmailSession,
  consumeLauncherGuestLinked,
  defaultLauncherServerAddress,
  emailAuthTransportSafe,
  guestDeviceId,
  launcherServerKey,
  markLauncherGuestLinked,
  normalizeEmail,
  parseLauncherServerAddress,
  readStoredLauncherEmailSession,
  rotateGuestDeviceId,
  storeLauncherEmailSession,
  validateEmail,
  validatePassword,
  validateUsername,
  type LauncherAccount,
  type LauncherAuthKind,
} from "../lib/account";
import {
  FRIEND_STATE,
  acceptedFriends,
  incomingFriendRequests,
  mergeChatMessages,
  normalizeChatMessage,
  normalizeFriend,
  outgoingFriendRequests,
  type LauncherFriend,
  type SocialMessage,
} from "../lib/social";

const NOTIFICATION_CHANNEL = "moongames.launcher.notifications.v1";

export type LauncherConnection =
  | "offline"
  | "connecting"
  | "online"
  | "error";

export type LauncherPlayerSearchResult = Awaited<
  ReturnType<MoonGamesSocialClient["searchPlayers"]>
>[number];

export interface LauncherSocialController {
  connection: LauncherConnection;
  account: LauncherAccount | null;
  session: GameSession | null;
  nakama: NakamaConnection | null;
  serverLabel: string;
  error: string | null;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
  friendBusy: string | null;
  friendError: string | null;
  friendNotice: string | null;
  friends: LauncherFriend[];
  incoming: LauncherFriend[];
  outgoing: LauncherFriend[];
  unread: Record<string, number>;
  unreadTotal: number;
  notifications: SocialNotification[];
  notificationUnread: number;
  notificationBusy: boolean;
  notificationError: string | null;
  notificationNotice: string | null;
  recentPlayers: SocialPlayerSummary[];
  recentPlayersBusy: boolean;
  /** How many games the player has finished in each title. */
  playCounts: Record<string, number>;
  refreshPlayCounts: () => Promise<void>;
  inviteBusy: string | null;
  inviteError: string | null;
  inviteNotice: string | null;
  selectedInvite: InviteResolveResult | null;
  activeFriendId: string | null;
  activeFriend: LauncherFriend | null;
  messages: SocialMessage[];
  conversations: Record<string, SocialMessage[]>;
  chatBusy: boolean;
  chatError: string | null;
  connect: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  clearFeedback: () => void;
  addFriend: (username: string) => Promise<void>;
  searchPlayers: (query: string) => Promise<LauncherPlayerSearchResult[]>;
  acceptFriend: (friend: LauncherFriend) => Promise<void>;
  removeFriend: (friend: LauncherFriend) => Promise<void>;
  refreshFriends: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  markNotificationsRead: (ids?: string[], all?: boolean) => Promise<void>;
  handleNotification: (notification: SocialNotification) => Promise<void>;
  refreshRecentPlayers: () => Promise<void>;
  createInvite: (input: InviteCreateInput) => Promise<MoonGamesInvite | null>;
  selectInvite: (invite: MoonGamesInvite | null) => Promise<void>;
  resolveInviteLink: (token: string) => Promise<boolean>;
  acceptInvite: (invite: MoonGamesInvite) => Promise<void>;
  declineInvite: (invite: MoonGamesInvite) => Promise<void>;
  cancelInvite: (invite: MoonGamesInvite) => Promise<void>;
  clearInviteFeedback: () => void;
  openChat: (friend: LauncherFriend) => Promise<void>;
  closeChat: () => void;
  sendMessage: (text: string) => Promise<void>;
  prepareSession: () => Promise<GameSession>;
}

interface PendingSessionAuth {
  email: string;
  session: Session;
}

function unauthorized(cause: unknown): boolean {
  if (typeof Response === "undefined" || !(cause instanceof Response)) {
    return false;
  }
  return cause.status === 401 || cause.status === 403;
}

function sessionRejected(cause: unknown): boolean {
  if (unauthorized(cause)) {
    return true;
  }
  const text =
    cause instanceof Error
      ? cause.message
      : typeof cause === "string"
        ? cause
        : "";
  const normalized = text.toLowerCase();
  return (
    normalized.includes("http 401") ||
    normalized.includes("http 403") ||
    ((normalized.includes("refresh token") ||
      normalized.includes("session token")) &&
      (normalized.includes("expired") || normalized.includes("invalid")))
  );
}

async function readableError(
  cause: unknown,
  fallback: string,
): Promise<string> {
  const detail = await authErrorDetail(cause);
  if (detail instanceof Error && detail.message.length > 0) {
    return detail.message;
  }
  if (typeof detail === "string" && detail.trim().length > 0) {
    return detail.trim().slice(0, 240);
  }
  return fallback;
}

export function useLauncherSocial(
  options: { onInviteAccepted?: (invite: MoonGamesInvite) => void } = {},
): LauncherSocialController {
  const [connection, setConnection] = useState<LauncherConnection>("offline");
  const [account, setAccount] = useState<LauncherAccount | null>(null);
  const [gameSession, setGameSession] = useState<GameSession | null>(null);
  const [nakama, setNakama] = useState<NakamaConnection | null>(null);
  const [serverLabel, setServerLabel] = useState(() =>
    parseLauncherServerAddress(defaultLauncherServerAddress()).label,
  );
  const [error, setError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [friends, setFriends] = useState<LauncherFriend[]>([]);
  const [friendBusy, setFriendBusy] = useState<string | null>(null);
  const [friendError, setFriendError] = useState<string | null>(null);
  const [friendNotice, setFriendNotice] = useState<string | null>(null);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [notifications, setNotifications] = useState<SocialNotification[]>([]);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [notificationError, setNotificationError] = useState<string | null>(null);
  const [notificationNotice, setNotificationNotice] = useState<string | null>(null);
  const [recentPlayers, setRecentPlayers] = useState<SocialPlayerSummary[]>([]);
  const [playCounts, setPlayCounts] = useState<Record<string, number>>({});
  const [recentPlayersBusy, setRecentPlayersBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [selectedInvite, setSelectedInvite] = useState<InviteResolveResult | null>(null);
  const [activeFriendId, setActiveFriendId] = useState<string | null>(null);
  const [messagesByFriend, setMessagesByFriend] = useState<
    Record<string, SocialMessage[]>
  >({});
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const socialRef = useRef<MoonGamesSocialClient | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const accountRef = useRef<LauncherAccount | null>(null);
  const friendsRef = useRef<LauncherFriend[]>([]);
  const notificationReadIdsRef = useRef<Set<string>>(new Set());
  const onlineIdsRef = useRef<Set<string>>(new Set());
  const channelsRef = useRef<Map<string, string>>(new Map());
  const channelFriendsRef = useRef<Map<string, string>>(new Map());
  const activeFriendRef = useRef<string | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const pendingSessionRef = useRef<PendingSessionAuth | null>(null);
  const manualDisconnectRef = useRef(false);
  const disposedRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const chatLoadRef = useRef(0);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const applyOnline = useCallback((ids: Iterable<string>, online: boolean) => {
    const next = new Set(onlineIdsRef.current);
    for (const id of ids) {
      if (online) {
        next.add(id);
      } else {
        next.delete(id);
      }
    }
    onlineIdsRef.current = next;
    setFriends((current) =>
      current.map((friend) => ({
        ...friend,
        online: next.has(friend.userId),
      })),
    );
  }, []);

  const handleStatusPresence = useCallback(
    (event: StatusPresenceEvent) => {
      applyOnline(
        event.joins.map((presence) => presence.user_id),
        true,
      );
      applyOnline(
        event.leaves.map((presence) => presence.user_id),
        false,
      );
    },
    [applyOnline],
  );

  const appendChatMessage = useCallback(
    (friendId: string, message: SocialMessage) => {
      setMessagesByFriend((current) => ({
        ...current,
        [friendId]: mergeChatMessages(current[friendId] ?? [], [message]),
      }));
      if (activeFriendRef.current !== friendId && !message.own) {
        setUnread((current) => ({
          ...current,
          [friendId]: (current[friendId] ?? 0) + 1,
        }));
      }
    },
    [],
  );

  /**
   * Put a changed invite back into the chat it was sent in.
   *
   * A chat card keeps the invite it was sent with. When the invite is
   * accepted, declined, or cancelled, the server answers with the new state
   * of the invite, and the card in the chat has to be given it, or the card
   * still offers the action that was just taken.
   */
  const updateChatInvite = useCallback((invite: MoonGamesInvite) => {
    setMessagesByFriend((current) => {
      const next: Record<string, SocialMessage[]> = {};
      let changed = false;
      for (const [friendId, messages] of Object.entries(current)) {
        let touched = false;
        const updated = messages.map((message) => {
          if (
            message.invite === null ||
            message.invite.inviteId !== invite.inviteId
          ) {
            return message;
          }
          touched = true;
          return { ...message, invite };
        });
        next[friendId] = touched ? updated : messages;
        changed = changed || touched;
      }
      return changed ? next : current;
    });
  }, []);

  const handleChannelMessage = useCallback(
    (message: ChannelMessage) => {
      const channelId = message.channel_id;
      if (typeof channelId !== "string") {
        return;
      }
      const friendId = channelFriendsRef.current.get(channelId);
      if (friendId === undefined) {
        return;
      }
      const self = accountRef.current;
      if (self === null) {
        return;
      }
      const normalized = normalizeChatMessage(message, self.userId);
      if (normalized !== null) {
        appendChatMessage(friendId, normalized);
      }
    },
    [appendChatMessage],
  );

  const joinDirectChat = useCallback(async (friendId: string) => {
    const existing = channelsRef.current.get(friendId);
    if (existing !== undefined) {
      return existing;
    }
    const socket = socketRef.current;
    if (socket === null) {
      throw new Error("Not connected to the MoonGames server.");
    }
    const channel = await socket.joinChat(friendId, 2, true, false);
    channelsRef.current.set(friendId, channel.id);
    channelFriendsRef.current.set(channel.id, friendId);
    return channel.id;
  }, []);

  const refreshFriends = useCallback(async () => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      return;
    }
    const result = await client.listFriends(session);
    if (clientRef.current !== client || sessionRef.current !== session) {
      return;
    }
    const normalized = (result.friends ?? [])
      .map((friend: Friend) => normalizeFriend(friend, onlineIdsRef.current))
      .filter((friend): friend is LauncherFriend => friend !== null);
    friendsRef.current = normalized;
    setFriends(normalized);

    const accepted = acceptedFriends(normalized);
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    await Promise.allSettled(
      accepted.map((friend) => joinDirectChat(friend.userId)),
    );

    const self = accountRef.current;
    const previews = await Promise.allSettled(
      accepted.map(async (friend) => {
        const channelId = channelsRef.current.get(friend.userId);
        if (channelId === undefined || self === null) {
          return null;
        }
        const history = await client.listChannelMessages(
          session,
          channelId,
          10,
          false,
        );
        const message = (history.messages ?? [])
          .map((item) => normalizeChatMessage(item, self.userId))
          .filter((item): item is SocialMessage => item !== null)
          .sort((left, right) => left.createdAt - right.createdAt)
          .at(-1);
        return message === undefined ? null : { friendId: friend.userId, message };
      }),
    );
    const latest: Record<string, SocialMessage> = {};
    for (const result of previews) {
      if (result.status === "fulfilled" && result.value !== null) {
        latest[result.value.friendId] = result.value.message;
      }
    }
    if (clientRef.current !== client || sessionRef.current !== session) {
      return;
    }
    if (Object.keys(latest).length > 0) {
      setMessagesByFriend((current) => {
        const next = { ...current };
        for (const [friendId, message] of Object.entries(latest)) {
          next[friendId] = mergeChatMessages(next[friendId] ?? [], [message]);
        }
        return next;
      });
    }

    if (accepted.length > 0) {
      try {
        const status = await socket.followUsers(
          accepted.map((friend) => friend.userId),
        );
        applyOnline(
          status.presences.map((presence) => presence.user_id),
          true,
        );
      } catch {
        // Presence is a progressive enhancement; friends still work offline.
      }
    }
  }, [applyOnline, joinDirectChat]);

  const handleSocialNotification = useCallback(
    (notification: SocialNotification) => {
      setNotifications((current) => {
        const merged = mergeNotifications(
          current,
          [notification],
          notificationReadIdsRef.current,
        );
        const invite = notification.invite;
        if (invite === null) {
          return merged;
        }
        // Lifecycle notifications carry the newest authoritative status. Apply
        // it to the older invite-received row too, so its actions cannot linger.
        return merged.map((entry) =>
          entry.invite?.inviteId === invite.inviteId
            ? { ...entry, invite }
            : entry,
        );
      });
      if (notification.invite !== null) {
        setInviteNotice(notification.subject);
      }
      if (notification.kind.startsWith("friend-")) {
        void refreshFriends();
      }
    },
    [refreshFriends],
  );

  const refreshPlayCounts = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      return;
    }
    try {
      const response = await client.rpc(session, "moongames_play_counts", {});
      const payload = response.payload as { counts?: Record<string, number> };
      setPlayCounts(payload.counts ?? {});
    } catch {
      // The play counts are a hint for the menu, not a requirement.
    }
  }, []);

  const refreshNotifications = useCallback(async (): Promise<void> => {
    const social = socialRef.current;
    if (social === null) {
      return;
    }
    setNotificationBusy(true);
    setNotificationError(null);
    try {
      const state = await social.notificationsState();
      if (socialRef.current !== social) {
        return;
      }
      notificationReadIdsRef.current = new Set(state.readIds);
      const next = await social.listNotifications();
      if (socialRef.current !== social) {
        return;
      }
      const inviteIds = [
        ...new Set(
          next
            .map((notification) => notification.invite?.inviteId)
            .filter((id): id is string => id !== undefined),
        ),
      ];
      const resolved = new Map<string, MoonGamesInvite>();
      await Promise.allSettled(
        inviteIds.map(async (inviteId) => {
          try {
            const result = await social.resolveInvite({ inviteId });
            resolved.set(inviteId, result.invite);
          } catch {
            // Keep the notification payload if the invite was already removed.
          }
        }),
      );
      if (socialRef.current !== social) {
        return;
      }
      setNotifications(
        next.map((notification) => {
          const invite = notification.invite;
          if (invite === null) {
            return notification;
          }
          const current = resolved.get(invite.inviteId);
          return current === undefined
            ? notification
            : { ...notification, invite: current };
        }),
      );
    } catch (cause) {
      if (socialRef.current !== social) {
        return;
      }
      setNotificationError(
        await readableError(cause, "Could not load your notifications."),
      );
    } finally {
      setNotificationBusy(false);
    }
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") {
      return undefined;
    }
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(NOTIFICATION_CHANNEL);
    } catch {
      return undefined;
    }
    channel.onmessage = (event: MessageEvent<unknown>) => {
      const payload = event.data;
      if (typeof payload !== "object" || payload === null) {
        return;
      }
      const source = payload as { userId?: unknown };
      if (source.userId !== accountRef.current?.userId) {
        return;
      }
      void refreshNotifications();
    };
    return () => {
      channel.close();
    };
  }, [refreshNotifications]);

  useEffect(() => {
    if (connection !== "online") {
      return undefined;
    }
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void Promise.allSettled([
          refreshFriends(),
          refreshNotifications(),
          refreshPlayCounts(),
        ]);
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [connection, refreshFriends, refreshNotifications]);

  const broadcastNotificationChange = useCallback((userId: string) => {
    if (typeof BroadcastChannel === "undefined") {
      return;
    }
    try {
      const channel = new BroadcastChannel(NOTIFICATION_CHANNEL);
      channel.postMessage({ userId });
      channel.close();
    } catch {
      // Cross-tab sync is an enhancement; server read state remains canonical.
    }
  }, []);

  const refreshRecentPlayers = useCallback(async (): Promise<void> => {
    const social = socialRef.current;
    if (social === null) {
      return;
    }
    setRecentPlayersBusy(true);
    try {
      setRecentPlayers(await social.listRecentPlayers());
    } catch {
      setRecentPlayers([]);
    } finally {
      setRecentPlayersBusy(false);
    }
  }, []);

  const markNotificationsRead = useCallback(
    async (ids: string[] = [], all = false): Promise<void> => {
      const social = socialRef.current;
      if (social === null) {
        return;
      }
      try {
        const state = await social.markNotificationsRead(ids, all);
        notificationReadIdsRef.current = new Set(state.readIds);
        setNotifications((current) =>
          current.map((notification) => ({
            ...notification,
            read:
              all ||
              notification.read ||
              ids.includes(notification.id) ||
              state.readIds.includes(notification.id),
          })),
        );
        const userId = accountRef.current?.userId;
        if (userId !== undefined) {
          broadcastNotificationChange(userId);
        }
      } catch (cause) {
        setNotificationError(
          await readableError(cause, "Could not update notification state."),
        );
      }
    },
    [broadcastNotificationChange],
  );

  const selectInvite = useCallback(
    async (invite: MoonGamesInvite | null): Promise<void> => {
      setInviteError(null);
      if (invite === null) {
        setSelectedInvite(null);
        return;
      }
      const self = accountRef.current;
      if (self === null) {
        setInviteError("Connect to MoonGames before opening an invite.");
        return;
      }
      const local = resolveInviteView(invite, self.userId);
      if (local !== null) {
        setSelectedInvite(local);
      }
      const social = socialRef.current;
      if (social === null) {
        return;
      }
      setInviteBusy(invite.inviteId);
      try {
        const resolved = await social.resolveInvite({
          inviteId: invite.inviteId,
        });
        setSelectedInvite(resolved);
      } catch (cause) {
        setInviteError(
          await readableError(cause, "Could not open that invite."),
        );
      } finally {
        setInviteBusy(null);
      }
    },
    [],
  );

  const handleNotification = useCallback(
    async (notification: SocialNotification): Promise<void> => {
      await markNotificationsRead([notification.id]);
      if (notification.invite !== null) {
        await selectInvite(notification.invite);
      }
    },
    [markNotificationsRead, selectInvite],
  );

  const markInviteNotificationRead = useCallback(
    async (inviteId: string): Promise<void> => {
      const ids = notifications
        .filter(
          (notification) =>
            !notification.read && notification.invite?.inviteId === inviteId,
        )
        .map((notification) => notification.id);
      if (ids.length > 0) {
        await markNotificationsRead(ids);
      }
    },
    [markNotificationsRead, notifications],
  );

  const resolveInviteLink = useCallback(async (token: string): Promise<boolean> => {
    setInviteError(null);
    setInviteNotice(null);
    const social = socialRef.current;
    if (social === null) {
      setInviteError("Connect to MoonGames before opening an invite.");
      return false;
    }
    setInviteBusy("link");
    try {
      const resolved = await social.resolveInvite({ token });
      setSelectedInvite(resolved);
      return true;
    } catch (cause) {
      setInviteError(
        await readableError(cause, "That invite link is invalid or expired."),
      );
      return false;
    } finally {
      setInviteBusy(null);
    }
  }, []);

  const createInvite = useCallback(
    async (input: InviteCreateInput): Promise<MoonGamesInvite | null> => {
      setInviteError(null);
      setInviteNotice(null);
      const social = socialRef.current;
      if (social === null) {
        setInviteError("Connect to MoonGames before sending an invite.");
        return null;
      }
      const self = accountRef.current;
      if (self === null) {
        setInviteError("Connect to MoonGames before sending an invite.");
        return null;
      }
      setInviteBusy(input.recipientId ?? input.recipientUsername ?? "new");
      try {
        const invite = await social.createInvite(input);
        const recipientId = invite.recipient.userId;
        try {
          const message = await social.sendInviteMessage(recipientId, invite);
          if (channelFriendsRef.current.has(message.channelId)) {
            appendChatMessage(recipientId, {
              id: message.id,
              senderId: self.userId,
              username: self.username,
              text: "",
              createdAt: message.createdAt,
              own: true,
              invite,
            });
          }
        } catch {
          // The persistent notification and share link still deliver the invite.
        }
        setInviteNotice(`Invite sent to ${invite.recipient.username}.`);
        setSelectedInvite(resolveInviteView(invite, self.userId));
        return invite;
      } catch (cause) {
        setInviteError(
          await readableError(cause, "Could not send that invite."),
        );
        return null;
      } finally {
        setInviteBusy(null);
      }
    },
    [appendChatMessage],
  );

  const acceptInvite = useCallback(
    async (invite: MoonGamesInvite): Promise<void> => {
      setInviteError(null);
      setInviteNotice(null);
      const social = socialRef.current;
      if (social === null) {
        setInviteError("Connect to MoonGames before accepting an invite.");
        return;
      }
      setInviteBusy(invite.inviteId);
      try {
        const next = await social.acceptInvite({ inviteId: invite.inviteId });
        setInviteNotice(`You accepted ${next.sender.username}'s invite.`);
        setSelectedInvite(resolveInviteView(next, next.recipient.userId));
        updateChatInvite(next);
        await markInviteNotificationRead(next.inviteId);
        await refreshNotifications();
        // Accepting an invite means the player wants to play, so the room is
        // opened for them.
        options.onInviteAccepted?.(next);
      } catch (cause) {
        setInviteError(
          await readableError(cause, "Could not accept that invite."),
        );
      } finally {
        setInviteBusy(null);
      }
    },
    [
      markInviteNotificationRead,
      options,
      refreshNotifications,
      updateChatInvite,
    ],
  );

  const declineInvite = useCallback(
    async (invite: MoonGamesInvite): Promise<void> => {
      setInviteError(null);
      setInviteNotice(null);
      const social = socialRef.current;
      if (social === null) {
        setInviteError("Connect to MoonGames before declining an invite.");
        return;
      }
      setInviteBusy(invite.inviteId);
      try {
        const next = await social.declineInvite({ inviteId: invite.inviteId });
        setInviteNotice("Invite declined.");
        setSelectedInvite(resolveInviteView(next, next.recipient.userId));
        updateChatInvite(next);
        await markInviteNotificationRead(next.inviteId);
        await refreshNotifications();
      } catch (cause) {
        setInviteError(
          await readableError(cause, "Could not decline that invite."),
        );
      } finally {
        setInviteBusy(null);
      }
    },
    [markInviteNotificationRead, refreshNotifications, updateChatInvite],
  );

  const cancelInvite = useCallback(
    async (invite: MoonGamesInvite): Promise<void> => {
      setInviteError(null);
      setInviteNotice(null);
      const social = socialRef.current;
      if (social === null) {
        setInviteError("Connect to MoonGames before cancelling an invite.");
        return;
      }
      setInviteBusy(invite.inviteId);
      try {
        const next = await social.cancelInvite({ inviteId: invite.inviteId });
        setInviteNotice("Invite cancelled.");
        setSelectedInvite(resolveInviteView(next, next.sender.userId));
        // The card in the chat has to show the cancelled invite, or it
        // still offers to cancel it.
        updateChatInvite(next);
        await markInviteNotificationRead(next.inviteId);
        await refreshNotifications();
      } catch (cause) {
        setInviteError(
          await readableError(cause, "Could not cancel that invite."),
        );
      } finally {
        setInviteBusy(null);
      }
    },
    [markInviteNotificationRead, refreshNotifications, updateChatInvite],
  );

  const clearInviteFeedback = useCallback(() => {
    setInviteError(null);
    setInviteNotice(null);
  }, []);

  const connect = useCallback((): Promise<void> => {
    if (socketRef.current !== null) {
      return Promise.resolve();
    }
    if (connectPromiseRef.current !== null) {
      return connectPromiseRef.current;
    }

    const promise = (async () => {
      setConnection("connecting");
      setError(null);
      manualDisconnectRef.current = false;
      let pendingSocket: Socket | null = null;
      // How many times the launcher has tried. A server that is starting up
      // is usually back after a second or two.
      let attempt = 0;

      try {
        const address = parseLauncherServerAddress(
          defaultLauncherServerAddress(),
        );
        const client = new Client(
          launcherServerKey(),
          address.host,
          address.port,
          address.useSSL,
        );
        const storedEmail = readStoredLauncherEmailSession(address.label);
        const pendingSession = pendingSessionRef.current;
        pendingSessionRef.current = null;

        let session: Session;
        let kind: LauncherAuthKind;
        let email: string | null = null;

        if (pendingSession !== null) {
          session = pendingSession.session;
          kind = "email";
          email = pendingSession.email;
        } else if (storedEmail !== null) {
          let candidate: Session | null = null;
          try {
            candidate = Session.restore(
              storedEmail.token,
              storedEmail.refreshToken,
            );
          } catch {
            candidate = null;
          }
          if (candidate !== null) {
            try {
              const now = Date.now() / 1000;
              if (candidate.isexpired(now)) {
                if (
                  !candidate.isrefreshexpired(now) &&
                  candidate.refresh_token.length > 0
                ) {
                  candidate = await client.sessionRefresh(candidate);
                } else {
                  candidate = null;
                }
              }
            } catch (cause) {
              if (sessionRejected(cause)) {
                candidate = null;
              } else {
                throw cause;
              }
            }
          }
          if (candidate !== null) {
            session = candidate;
            kind = "email";
            email = storedEmail.email;
          } else {
            clearStoredLauncherEmailSession();
            session = await client.authenticateDevice(guestDeviceId(), true);
            kind = "guest";
          }
        } else {
          session = await client.authenticateDevice(guestDeviceId(), true);
          kind = "guest";
        }

        let accountInfo;
        try {
          accountInfo = await client.getAccount(session);
        } catch (cause) {
          if (
            storedEmail !== null &&
            pendingSession === null &&
            sessionRejected(cause)
          ) {
            clearStoredLauncherEmailSession();
            session = await client.authenticateDevice(guestDeviceId(), true);
            kind = "guest";
            email = null;
            accountInfo = await client.getAccount(session);
          } else {
            throw cause;
          }
        }
        const resolvedEmail =
          typeof accountInfo.email === "string" &&
          accountInfo.email.length > 0
            ? accountInfo.email
            : email;
        const resolvedKind: LauncherAuthKind =
          resolvedEmail !== null ? "email" : kind;
        const resolvedAccount: LauncherAccount = {
          kind: resolvedKind,
          userId: accountInfo.user?.id ?? session.user_id ?? "",
          username:
            accountInfo.user?.username ??
            session.username ??
            resolvedEmail ??
            "MoonGames player",
          email: resolvedEmail,
        };

        const socket = client.createSocket(address.useSSL, false);
        pendingSocket = socket;
        socket.onchannelmessage = handleChannelMessage;
        socket.onstatuspresence = handleStatusPresence;
        socket.onerror = () => {
          setError("The realtime MoonGames connection reported an error.");
        };
        socket.ondisconnect = () => {
          if (manualDisconnectRef.current || disposedRef.current) {
            return;
          }
          socketRef.current = null;
          clientRef.current = null;
          socialRef.current = null;
          sessionRef.current = null;
          accountRef.current = null;
          setConnection("offline");
          setAccount(null);
          setGameSession(null);
          setFriends([]);
          friendsRef.current = [];
          notificationReadIdsRef.current = new Set();
          setNotifications([]);
          setRecentPlayers([]);
          setSelectedInvite(null);
          channelsRef.current.clear();
          channelFriendsRef.current.clear();
          clearReconnectTimer();
          reconnectTimerRef.current = window.setTimeout(() => {
            reconnectTimerRef.current = null;
            if (!disposedRef.current) {
              void connect().catch(() => undefined);
            }
          }, 2500);
        };

        await socket.connect(session, true);

        pendingSocket = null;
        clientRef.current = client;
        socketRef.current = socket;
        sessionRef.current = session;
        accountRef.current = resolvedAccount;
        socialRef.current = new MoonGamesSocialClient({
          client,
          session,
          socket,
          selfUserId: resolvedAccount.userId,
        });
        socialRef.current.onNotification(handleSocialNotification);
        for (const notification of socialRef.current.drainPendingNotifications()) {
          handleSocialNotification(notification);
        }
        setAccount(resolvedAccount);
        setServerLabel(address.label);
        setNakama({
          host: address.host,
          port: address.port,
          serverKey: launcherServerKey(),
          useSSL: address.useSSL,
        });
        const snapshot: GameSession = {
          token: session.token,
          refreshToken: session.refresh_token,
          userId: resolvedAccount.userId,
          username: resolvedAccount.username,
          expiresAt: session.expires_at ?? 0,
        };
        setGameSession(snapshot);

        if (resolvedKind === "email" && resolvedEmail !== null) {
          storeLauncherEmailSession({
            server: address.label,
            email: resolvedEmail,
            token: session.token,
            refreshToken: session.refresh_token,
          });
        }

        setConnection("online");
        setError(null);
        try {
          await refreshFriends();
        } catch {
          setError("Connected, but your friends list could not be loaded.");
        }
        await refreshPlayCounts();
        await Promise.allSettled([
          refreshNotifications(),
          refreshRecentPlayers(),
        ]);
      } catch (cause) {
        manualDisconnectRef.current = true;
        const activeSocket = socketRef.current ?? pendingSocket;
        if (activeSocket !== null) {
          try {
            activeSocket.disconnect(false);
          } catch {
            // Ignore cleanup errors.
          }
        }
        socketRef.current = null;
        clientRef.current = null;
        socialRef.current = null;
        sessionRef.current = null;
        accountRef.current = null;
        setConnection("error");
        setAccount(null);
        setGameSession(null);
        setFriends([]);
        friendsRef.current = [];
        notificationReadIdsRef.current = new Set();
        setNotifications([]);
        setRecentPlayers([]);
        setSelectedInvite(null);
        setError(
          await readableError(
            cause,
            "Could not connect to the MoonGames server.",
          ),
        );
        // The server may be starting, or it may have gone away for a
        // moment. The launcher keeps trying on its own, so it does not have
        // to be reloaded to come back.
        clearReconnectTimer();
        const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
        attempt += 1;
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null;
          if (!disposedRef.current) {
            void connect().catch(() => undefined);
          }
        }, delay);
        throw cause;
      }
    })();

    connectPromiseRef.current = promise.finally(() => {
      connectPromiseRef.current = null;
    });
    return connectPromiseRef.current;
  }, [
    clearReconnectTimer,
    handleChannelMessage,
    handleSocialNotification,
    handleStatusPresence,
    refreshFriends,
    refreshNotifications,
    refreshRecentPlayers,
  ]);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    clearReconnectTimer();
    const socket = socketRef.current;
    if (socket !== null) {
      socket.onchannelmessage = () => undefined;
      socket.onstatuspresence = () => undefined;
      socket.onerror = () => undefined;
      socket.ondisconnect = () => undefined;
      try {
        socket.disconnect(false);
      } catch {
        // The socket may already be closed.
      }
    }
    socketRef.current = null;
    clientRef.current = null;
    socialRef.current = null;
    sessionRef.current = null;
    accountRef.current = null;
    channelsRef.current.clear();
    channelFriendsRef.current.clear();
    setConnection("offline");
    setAccount(null);
    setGameSession(null);
    setFriends([]);
    friendsRef.current = [];
    notificationReadIdsRef.current = new Set();
    setNotifications([]);
    setRecentPlayers([]);
    setSelectedInvite(null);
    setNotificationError(null);
    setNotificationNotice(null);
    setInviteError(null);
    setInviteNotice(null);
    setUnread({});
    setActiveFriendId(null);
    activeFriendRef.current = null;
    setMessagesByFriend({});
    setChatError(null);
    setFriendError(null);
    setFriendNotice(null);
  }, [clearReconnectTimer]);

  useEffect(() => {
    disposedRef.current = false;
    void connect().catch(() => {
      // Connection failures are surfaced through `error`.
    });
    return () => {
      disposedRef.current = true;
      manualDisconnectRef.current = true;
      disconnect();
    };
  }, [connect, disconnect]);

  const clearFeedback = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
    setFriendError(null);
    setFriendNotice(null);
    setChatError(null);
    setNotificationError(null);
    setNotificationNotice(null);
    setInviteError(null);
    setInviteNotice(null);
    setError(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setAuthError(null);
      setAuthNotice(null);
      const emailError = validateEmail(email);
      if (emailError !== null) {
        setAuthError(emailError);
        return;
      }
      if (password.length === 0) {
        setAuthError("Enter your password.");
        return;
      }
      const address = parseLauncherServerAddress();
      if (!emailAuthTransportSafe(address.host, address.useSSL)) {
        setAuthError("Email sign-in requires HTTPS. Use a secure server address.");
        return;
      }

      setAuthBusy(true);
      try {
        const normalizedEmail = normalizeEmail(email);
        const probe =
          clientRef.current ??
          new Client(
            launcherServerKey(),
            address.host,
            address.port,
            address.useSSL,
          );
        const nextSession = await probe.authenticateEmail(
          normalizedEmail,
          password,
          false,
        );
        pendingSessionRef.current = {
          email: normalizedEmail,
          session: nextSession,
        };
        disconnect();
        await connect();
        setAuthNotice("Signed in. Every official game now uses this account.");
      } catch (cause) {
        pendingSessionRef.current = null;
        setAuthError(
          authErrorMessage(await authErrorDetail(cause), "sign-in"),
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [connect, disconnect],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      username = "",
    ): Promise<void> => {
      setAuthError(null);
      setAuthNotice(null);
      const emailError = validateEmail(email);
      if (emailError !== null) {
        setAuthError(emailError);
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError !== null) {
        setAuthError(passwordError);
        return;
      }
      const trimmedUsername = username.trim();
      const usernameError = validateUsername(trimmedUsername);
      if (usernameError !== null) {
        setAuthError(usernameError);
        return;
      }
      const address = parseLauncherServerAddress();
      if (!emailAuthTransportSafe(address.host, address.useSSL)) {
        setAuthError("Account creation requires HTTPS. Use a secure server address.");
        return;
      }

      setAuthBusy(true);
      let linked = false;
      let usernameWarning = false;
      const normalizedEmail = normalizeEmail(email);
      try {
        if (socketRef.current === null) {
          await connect();
        }
        const client = clientRef.current;
        const session = sessionRef.current;
        if (client === null || session === null) {
          throw new Error("Could not establish a MoonGames guest session.");
        }
        if (accountRef.current?.kind === "email") {
          setAuthError("You are already signed in with an email account.");
          return;
        }
        await client.linkEmail(session, {
          email: normalizedEmail,
          password,
        });
        linked = true;
        markLauncherGuestLinked();
        if (trimmedUsername.length > 0) {
          try {
            await client.updateAccount(session, {
              username: trimmedUsername,
            });
          } catch {
            usernameWarning = true;
          }
        }
        const nextSession = await client.authenticateEmail(
          normalizedEmail,
          password,
          false,
        );
        pendingSessionRef.current = {
          email: normalizedEmail,
          session: nextSession,
        };
        disconnect();
        await connect();
        if (consumeLauncherGuestLinked()) {
          rotateGuestDeviceId();
        }
        setAuthNotice(
          usernameWarning
            ? "Account created. That player name was taken, so your existing name was kept."
            : "Account created. Friends, games, and progress are now shared.",
        );
      } catch (cause) {
        pendingSessionRef.current = null;
        setAuthError(
          linked
            ? "Your account was created, but sign-in did not finish. Try signing in with your email."
            : authErrorMessage(await authErrorDetail(cause), "sign-up"),
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [connect, disconnect],
  );

  const signOut = useCallback(async (): Promise<void> => {
    setAuthError(null);
    setAuthNotice(null);
    if (accountRef.current?.kind !== "email") {
      setAuthError("You are already playing as a guest.");
      return;
    }
    setAuthBusy(true);
    try {
      clearStoredLauncherEmailSession();
      if (consumeLauncherGuestLinked()) {
        rotateGuestDeviceId();
      }
      disconnect();
      await connect();
      setAuthNotice("Signed out. You are playing as a guest.");
    } catch (cause) {
      setAuthError(
        authErrorMessage(await authErrorDetail(cause), "sign-in"),
      );
    } finally {
      setAuthBusy(false);
    }
  }, [connect, disconnect]);

  const addFriend = useCallback(
    async (username: string): Promise<void> => {
      setFriendError(null);
      setFriendNotice(null);
      const value = username.trim();
      if (value.length < 3 || !/^[A-Za-z0-9_]{3,20}$/.test(value)) {
        setFriendError("Enter a player name with 3–20 letters, numbers, or underscores.");
        return;
      }
      if (
        accountRef.current?.username.toLowerCase() === value.toLowerCase()
      ) {
        setFriendError("That is your own player name.");
        return;
      }
      const client = clientRef.current;
      const session = sessionRef.current;
      const social = socialRef.current;
      if (client === null || session === null || social === null) {
        setFriendError("Connect to MoonGames before adding friends.");
        return;
      }
      setFriendBusy("add");
      try {
        const status = await social.requestFriend({ username: value });
        await refreshFriends();
        await refreshNotifications();
        setFriendNotice(
          status === "friends"
            ? `${value} is now your friend.`
            : status === "already_requested"
              ? `You already sent a friend request to ${value}.`
              : `Friend request sent to ${value}. You will see it here when they accept.`,
        );
      } catch (cause) {
        setFriendError(
          await readableError(cause, "Could not send that friend request."),
        );
      } finally {
        setFriendBusy(null);
      }
    },
    [refreshFriends, refreshNotifications],
  );

  const acceptFriend = useCallback(
    async (friend: LauncherFriend): Promise<void> => {
      setFriendError(null);
      setFriendNotice(null);
      const client = clientRef.current;
      const session = sessionRef.current;
      const social = socialRef.current;
      if (client === null || session === null || social === null) {
        setFriendError("Connect to MoonGames before accepting friends.");
        return;
      }
      setFriendBusy(friend.userId);
      try {
        await social.acceptFriend({ userId: friend.userId });
        await refreshFriends();
        await refreshNotifications();
        setFriendNotice(`${friend.username} is now your friend.`);
      } catch (cause) {
        setFriendError(
          await readableError(cause, "Could not accept that friend request."),
        );
      } finally {
        setFriendBusy(null);
      }
    },
    [refreshFriends, refreshNotifications],
  );

  const removeFriend = useCallback(
    async (friend: LauncherFriend): Promise<void> => {
      setFriendError(null);
      setFriendNotice(null);
      const client = clientRef.current;
      const session = sessionRef.current;
      const social = socialRef.current;
      if (client === null || session === null || social === null) {
        setFriendError("Connect to MoonGames before changing friends.");
        return;
      }
      setFriendBusy(friend.userId);
      try {
        if (friend.state === FRIEND_STATE.requested) {
          await social.declineFriend({ userId: friend.userId });
        } else if (friend.state === FRIEND_STATE.invited) {
          await social.cancelFriend({ userId: friend.userId });
        } else {
          await social.removeFriend({ userId: friend.userId });
        }
        const channelId = channelsRef.current.get(friend.userId);
        if (channelId !== undefined) {
          try {
            await socketRef.current?.leaveChat(channelId);
          } catch {
            // The channel may already be closed.
          }
          channelsRef.current.delete(friend.userId);
          channelFriendsRef.current.delete(channelId);
        }
        friendsRef.current = friendsRef.current.filter(
          (item) => item.userId !== friend.userId,
        );
        setFriends(friendsRef.current);
        if (activeFriendRef.current === friend.userId) {
          activeFriendRef.current = null;
          setActiveFriendId(null);
        }
        setFriendNotice(
          friend.state === FRIEND_STATE.requested
            ? "Friend request declined."
            : friend.state === FRIEND_STATE.invited
              ? "Friend request cancelled."
              : `${friend.username} was removed from your friends.`,
        );
        await refreshFriends();
        await refreshNotifications();
      } catch (cause) {
        setFriendError(
          await readableError(cause, "Could not update that friendship."),
        );
      } finally {
        setFriendBusy(null);
      }
    },
    [refreshFriends, refreshNotifications],
  );

  const openChat = useCallback(
    async (friend: LauncherFriend): Promise<void> => {
      setChatError(null);
      setUnread((current) => ({ ...current, [friend.userId]: 0 }));
      activeFriendRef.current = friend.userId;
      setActiveFriendId(friend.userId);
      if (friend.state !== FRIEND_STATE.mutual) {
        setChatError("Become friends before starting a personal chat.");
        return;
      }
      setChatBusy(true);
      const loadId = chatLoadRef.current + 1;
      chatLoadRef.current = loadId;
      try {
        const channelId = await joinDirectChat(friend.userId);
        const client = clientRef.current;
        const session = sessionRef.current;
        if (client === null || session === null) {
          throw new Error("Not connected to the MoonGames server.");
        }
        const history = await client.listChannelMessages(
          session,
          channelId,
          60,
        );
        if (chatLoadRef.current !== loadId) {
          return;
        }
        const self = accountRef.current;
        const normalized = (history.messages ?? [])
          .map((message) =>
            normalizeChatMessage(message, self?.userId ?? ""),
          )
          .filter((message): message is SocialMessage => message !== null);
        setMessagesByFriend((current) => ({
          ...current,
          [friend.userId]: mergeChatMessages(
            current[friend.userId] ?? [],
            normalized,
          ),
        }));
      } catch (cause) {
        if (chatLoadRef.current === loadId) {
          setChatError(
            await readableError(cause, "Could not load this conversation."),
          );
        }
      } finally {
        if (chatLoadRef.current === loadId) {
          setChatBusy(false);
        }
      }
    },
    [joinDirectChat],
  );

  const closeChat = useCallback(() => {
    chatLoadRef.current += 1;
    activeFriendRef.current = null;
    setActiveFriendId(null);
    setChatBusy(false);
    setChatError(null);
  }, []);

  const sendMessage = useCallback(
    async (text: string): Promise<void> => {
      setChatError(null);
      const friendId = activeFriendRef.current;
      const self = accountRef.current;
      const socket = socketRef.current;
      const value = text.trim().slice(0, 1000);
      if (friendId === null || self === null || socket === null) {
        setChatError("Connect to MoonGames before sending a message.");
        return;
      }
      if (value.length === 0) {
        return;
      }
      try {
        const channelId = await joinDirectChat(friendId);
        const ack = await socket.writeChatMessage(channelId, { text: value });
        appendChatMessage(friendId, {
          id: ack.message_id,
          senderId: self.userId,
          username: self.username,
          text: value,
          createdAt: Date.parse(ack.create_time) || Date.now(),
          own: true,
          invite: null,
        });
      } catch (cause) {
        setChatError(
          await readableError(cause, "Could not send that message."),
        );
        throw cause;
      }
    },
    [appendChatMessage, joinDirectChat],
  );

  const prepareSession = useCallback(async (): Promise<GameSession> => {
    if (socketRef.current === null) {
      await connect();
    }
    const client = clientRef.current;
    let session = sessionRef.current;
    let currentAccount = accountRef.current;
    if (client === null || session === null || currentAccount === null) {
      throw new Error("Could not prepare the MoonGames account.");
    }

    const now = Date.now() / 1000;
    if (session.isexpired(now + 20)) {
      if (
        !session.isrefreshexpired(now) &&
        session.refresh_token.length > 0
      ) {
        session = await client.sessionRefresh(session);
        sessionRef.current = session;
        if (currentAccount.kind === "email" && currentAccount.email !== null) {
          storeLauncherEmailSession({
            server: serverLabel,
            email: currentAccount.email,
            token: session.token,
            refreshToken: session.refresh_token,
          });
        }
      } else {
        disconnect();
        await connect();
        session = sessionRef.current;
        currentAccount = accountRef.current;
        if (session === null || currentAccount === null) {
          throw new Error("Could not refresh the MoonGames session.");
        }
      }
    }

    const next: GameSession = {
      token: session.token,
      refreshToken: session.refresh_token,
      userId: currentAccount.userId,
      username: currentAccount.username,
      expiresAt: session.expires_at ?? 0,
    };
    setGameSession(next);
    return next;
  }, [connect, disconnect, serverLabel]);

  const activeFriend = useMemo(
    () => friends.find((friend) => friend.userId === activeFriendId) ?? null,
    [activeFriendId, friends],
  );
  const messages = useMemo(
    () =>
      activeFriendId === null
        ? []
        : (messagesByFriend[activeFriendId] ?? []),
    [activeFriendId, messagesByFriend],
  );
  const incoming = useMemo(() => incomingFriendRequests(friends), [friends]);
  const outgoing = useMemo(() => outgoingFriendRequests(friends), [friends]);
  const unreadTotal = useMemo(
    () => Object.values(unread).reduce((total, count) => total + count, 0),
    [unread],
  );
  const notificationUnread = useMemo(
    () => unreadNotificationCount(notifications),
    [notifications],
  );

  useEffect(() => {
    return () => {
      clearReconnectTimer();
    };
  }, [clearReconnectTimer]);

  return {
    connection,
    account,
    session: gameSession,
    nakama,
    serverLabel,
    error,
    authBusy,
    authError,
    authNotice,
    friendBusy,
    friendError,
    friendNotice,
    friends,
    incoming,
    outgoing,
    unread,
    unreadTotal,
    notifications,
    notificationUnread,
    notificationBusy,
    notificationError,
    notificationNotice,
    recentPlayers,
    recentPlayersBusy,
    playCounts,
    refreshPlayCounts,
    inviteBusy,
    inviteError,
    inviteNotice,
    selectedInvite,
    activeFriendId,
    activeFriend,
    messages,
    conversations: messagesByFriend,
    chatBusy,
    chatError,
    connect,
    signIn,
    signUp,
    signOut,
    clearFeedback,
    addFriend,
    searchPlayers: async (query: string) => {
      const value = query.trim().replace(/^@/, "");
      if (value.length < 2) {
        throw new Error("Enter at least 2 characters to search.");
      }
      const controller = socialRef.current;
      if (controller === null) {
        throw new Error("Connect to MoonGames before searching for players.");
      }
      return controller.searchPlayers(value);
    },
    acceptFriend,
    removeFriend,
    refreshFriends,
    refreshNotifications,
    markNotificationsRead,
    handleNotification,
    refreshRecentPlayers,
    createInvite,
    selectInvite,
    resolveInviteLink,
    acceptInvite,
    declineInvite,
    cancelInvite,
    clearInviteFeedback,
    openChat,
    closeChat,
    sendMessage,
    prepareSession,
  };
}
