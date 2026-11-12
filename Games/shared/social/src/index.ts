import type {
  ChannelMessage,
  Client,
  Notification,
  Session,
  Socket,
} from "@heroiclabs/nakama-js";
import {
  inviteMessage,
  isDuplicateFriendRemovalNotification,
  mergeNotifications,
  normalizeInvite,
  normalizeNotification,
  SOCIAL_NOTIFICATION_PAGE_SIZE,
  type InviteCreateInput,
  type InviteResolveResult,
  type MoonGamesInvite,
  type SocialNotification,
  type SocialPlayerSummary,
} from "@moongames/game-sdk";

export { inviteShareUrl } from "@moongames/game-sdk";

export {
  MoonGamesAccountError,
  linkGuestEmail,
  linkHostAccount,
  normalizeAccountEmail,
  signInWithMoonGames,
  signUpWithMoonGames,
  syncMoonGamesUsername,
  validateMoonGamesPassword,
  validateMoonGamesUsername,
} from "./account";
export type {
  HostAccountLinkMode,
  LinkGuestEmailInput,
  LinkHostAccountInput,
  SignInInput,
  SignUpInput,
  UpdateUsernameInput,
} from "./account";

export interface SocialRpcResponse {
  ok?: boolean;
  error?: {
    code?: string;
    message?: string;
  };
}

export class MoonGamesSocialError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "MoonGamesSocialError";
    this.code = code;
  }
}

export interface NotificationReadState {
  readIds: string[];
  readAt: number;
}

export interface DirectChatMessage {
  id: string;
  channelId: string;
  senderId: string;
  username: string;
  content: Record<string, unknown>;
  text: string;
  invite: MoonGamesInvite | null;
  createdAt: number;
  own: boolean;
}

export interface MoonGamesSocialOptions {
  client: Client;
  session: Session;
  socket?: Socket | null;
  selfUserId?: string;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function notificationToLike(
  notification: Notification,
): Parameters<typeof normalizeNotification>[0] {
  return notification as Parameters<typeof normalizeNotification>[0];
}

export class MoonGamesSocialClient {
  private readonly client: Client;
  private session: Session;
  private socket: Socket | null;
  private readonly selfUserId: string | null;
  private readonly directChannels = new Map<string, string>();
  private readonly readIds = new Set<string>();
  private readonly notificationListeners = new Set<
    (notification: SocialNotification) => void
  >();
  private pendingNotifications: SocialNotification[] = [];

  constructor(options: MoonGamesSocialOptions) {
    this.client = options.client;
    this.session = options.session;
    this.socket = options.socket ?? null;
    this.selfUserId = options.selfUserId ?? null;
    if (this.socket !== null) {
      this.attachSocket(this.socket);
    }
  }

  setSession(session: Session): void {
    this.session = session;
  }

  /** Listens for live invite/friend notifications while the host is online. */
  onNotification(
    listener: (notification: SocialNotification) => void,
  ): () => void {
    this.notificationListeners.add(listener);
    return () => {
      this.notificationListeners.delete(listener);
    };
  }

  /** Returns and clears notifications received before the host attached UI. */
  drainPendingNotifications(): SocialNotification[] {
    const pending = this.pendingNotifications;
    this.pendingNotifications = [];
    return pending;
  }

  attachSocket(socket: Socket | null): void {
    this.socket = socket;
    this.directChannels.clear();
    if (socket === null) {
      return;
    }
    const previous = socket.onnotification;
    socket.onnotification = (notification: Notification) => {
      previous?.call(socket, notification);
      if (isDuplicateFriendRemovalNotification(notification.code)) {
        return;
      }
      const normalized = normalizeNotification(
        notificationToLike(notification),
        this.readIds,
      );
      if (normalized === null) {
        return;
      }
      if (this.notificationListeners.size === 0) {
        this.pendingNotifications.push(normalized);
      }
      for (const listener of this.notificationListeners) {
        listener(normalized);
      }
    };
  }

  private async rpc<T extends SocialRpcResponse>(
    id: string,
    input: object = {},
  ): Promise<T> {
    const response = await this.client.rpc(this.session, id, input);
    const payload = record(response.payload);
    if (payload.ok === false) {
      const error = record(payload.error);
      throw new MoonGamesSocialError(
        typeof error.code === "string" ? error.code : "social_error",
        typeof error.message === "string"
          ? error.message
          : "The MoonGames social request failed.",
      );
    }
    return payload as T;
  }

  async createInvite(input: InviteCreateInput): Promise<MoonGamesInvite> {
    const response = await this.rpc<SocialRpcResponse & { invite?: unknown }>(
      "moongames_invite_create",
      input,
    );
    const invite = normalizeInvite(response.invite);
    if (invite === null) {
      throw new MoonGamesSocialError(
        "invalid_invite",
        "The MoonGames server returned an invalid invite.",
      );
    }
    return invite;
  }

  async resolveInvite(input: {
    inviteId?: string;
    token?: string;
  }): Promise<InviteResolveResult> {
    const response = await this.rpc<
      SocialRpcResponse & {
        invite?: unknown;
        direction?: unknown;
        canAccept?: unknown;
        canDecline?: unknown;
        canCancel?: unknown;
        canJoin?: unknown;
      }
    >("moongames_invite_resolve", input);
    const invite = normalizeInvite(response.invite);
    if (invite === null) {
      throw new MoonGamesSocialError(
        "invalid_invite",
        "The MoonGames server returned an invalid invite.",
      );
    }
    return {
      invite,
      direction: response.direction === "outgoing" ? "outgoing" : "incoming",
      canAccept: response.canAccept === true,
      canDecline: response.canDecline === true,
      canCancel: response.canCancel === true,
      canJoin: response.canJoin === true,
    };
  }

  async acceptInvite(input: {
    inviteId?: string;
    token?: string;
  }): Promise<MoonGamesInvite> {
    return this.inviteAction("moongames_invite_accept", input);
  }

  async declineInvite(input: {
    inviteId?: string;
    token?: string;
  }): Promise<MoonGamesInvite> {
    return this.inviteAction("moongames_invite_decline", input);
  }

  async cancelInvite(input: {
    inviteId?: string;
    token?: string;
  }): Promise<MoonGamesInvite> {
    return this.inviteAction("moongames_invite_cancel", input);
  }

  private async inviteAction(
    rpcId: string,
    input: { inviteId?: string; token?: string },
  ): Promise<MoonGamesInvite> {
    const response = await this.rpc<SocialRpcResponse & { invite?: unknown }>(
      rpcId,
      input,
    );
    const invite = normalizeInvite(response.invite);
    if (invite === null) {
      throw new MoonGamesSocialError(
        "invalid_invite",
        "The MoonGames server returned an invalid invite.",
      );
    }
    return invite;
  }

  async notificationsState(): Promise<NotificationReadState> {
    const response = await this.rpc<
      SocialRpcResponse & { readIds?: unknown; readAt?: unknown }
    >("moongames_notifications_state");
    const readIds = Array.isArray(response.readIds)
      ? response.readIds.filter((item): item is string => typeof item === "string")
      : [];
    this.readIds.clear();
    for (const id of readIds) {
      this.readIds.add(id);
    }
    return {
      readIds,
      readAt: typeof response.readAt === "number" ? response.readAt : 0,
    };
  }

  async listNotifications(
    limit = SOCIAL_NOTIFICATION_PAGE_SIZE,
  ): Promise<SocialNotification[]> {
    const state = await this.notificationsState();
    const readIds = new Set(state.readIds);
    const response = await this.client.listNotifications(this.session, limit);
    return mergeNotifications(
      [],
      (response.notifications ?? [])
        .filter(
          (notification) =>
            !isDuplicateFriendRemovalNotification(notification.code),
        )
        .map((notification) =>
          normalizeNotification(notificationToLike(notification), readIds),
        )
        .filter(
          (notification): notification is SocialNotification =>
            notification !== null,
        ),
      readIds,
    );
  }

  /** Replays persistent invite notifications after a host reconnect. */
  async replayInvites(limit = SOCIAL_NOTIFICATION_PAGE_SIZE): Promise<SocialNotification[]> {
    return (await this.listNotifications(limit)).filter(
      (notification) =>
        notification.invite !== null ||
        notification.kind === "invite" ||
        notification.kind === "invite-accepted" ||
        notification.kind === "invite-declined" ||
        notification.kind === "invite-cancelled" ||
        notification.kind === "invite-expired",
    );
  }

  async markNotificationsRead(
    ids: string[] = [],
    all = false,
  ): Promise<NotificationReadState> {
    const response = await this.rpc<
      SocialRpcResponse & { readIds?: unknown; readAt?: unknown }
    >("moongames_notifications_mark_read", { ids, all });
    const nextReadIds = Array.isArray(response.readIds)
      ? response.readIds.filter(
          (item): item is string => typeof item === "string",
        )
      : [...this.readIds, ...ids];
    this.readIds.clear();
    for (const id of nextReadIds) {
      this.readIds.add(id);
    }
    return {
      readIds: nextReadIds,
      readAt: typeof response.readAt === "number" ? response.readAt : Date.now(),
    };
  }

  async requestFriend(input: {
    userId?: string;
    username?: string;
  }): Promise<string> {
    return this.friendAction("moongames_friend_request", input, "requested");
  }

  async acceptFriend(input: {
    userId?: string;
    username?: string;
  }): Promise<string> {
    return this.friendAction("moongames_friend_accept", input, "friends");
  }

  async declineFriend(input: {
    userId?: string;
    username?: string;
  }): Promise<string> {
    return this.friendAction("moongames_friend_decline", input, "declined");
  }

  async cancelFriend(input: {
    userId?: string;
    username?: string;
  }): Promise<string> {
    return this.friendAction("moongames_friend_cancel", input, "cancelled");
  }

  async removeFriend(input: {
    userId?: string;
    username?: string;
  }): Promise<string> {
    return this.friendAction("moongames_friend_remove", input, "removed");
  }

  private async friendAction(
    rpcId: string,
    input: { userId?: string; username?: string },
    fallback: string,
  ): Promise<string> {
    const response = await this.rpc<SocialRpcResponse & { status?: unknown }>(
      rpcId,
      input,
    );
    return typeof response.status === "string" ? response.status : fallback;
  }

  async listRecentPlayers(): Promise<SocialPlayerSummary[]> {
    const response = await this.rpc<
      SocialRpcResponse & { players?: unknown }
    >("moongames_recent_players_list");
    if (!Array.isArray(response.players)) {
      return [];
    }
    const players: SocialPlayerSummary[] = [];
    for (const value of response.players) {
      const source = record(value);
      if (
        typeof source.userId === "string" &&
        typeof source.username === "string"
      ) {
        players.push({
          userId: source.userId,
          username: source.username,
          displayName:
            typeof source.displayName === "string" ? source.displayName : null,
          avatarUrl:
            typeof source.avatarUrl === "string" ? source.avatarUrl : null,
        });
      }
    }
    return players;
  }

  private requireSocket(): Socket {
    if (this.socket === null) {
      throw new MoonGamesSocialError(
        "not_connected",
        "Connect to the MoonGames realtime socket first.",
      );
    }
    return this.socket;
  }

  async joinDirectChat(otherUserId: string): Promise<string> {
    const existing = this.directChannels.get(otherUserId);
    if (existing !== undefined) {
      return existing;
    }
    const channel = await this.requireSocket().joinChat(
      otherUserId,
      2,
      true,
      false,
    );
    this.directChannels.set(otherUserId, channel.id);
    return channel.id;
  }

  async listDirectMessages(
    otherUserId: string,
    limit = 60,
  ): Promise<DirectChatMessage[]> {
    const channelId = await this.joinDirectChat(otherUserId);
    const response = await this.client.listChannelMessages(
      this.session,
      channelId,
      limit,
      false,
    );
    return (response.messages ?? [])
      .map((message) => this.normalizeDirectMessage(message))
      .filter((message): message is DirectChatMessage => message !== null)
      .sort((left, right) => left.createdAt - right.createdAt);
  }

  async sendDirectMessage(
    otherUserId: string,
    text: string,
  ): Promise<DirectChatMessage> {
    const value = text.trim().slice(0, 1000);
    if (value.length === 0) {
      throw new MoonGamesSocialError("empty_message", "Write a message first.");
    }
    const channelId = await this.joinDirectChat(otherUserId);
    const ack = await this.requireSocket().writeChatMessage(channelId, {
      text: value,
    });
    return {
      id: ack.message_id,
      channelId,
      senderId: this.selfUserId ?? "",
      username: "",
      content: { text: value },
      text: value,
      invite: null,
      createdAt: Date.parse(ack.create_time) || Date.now(),
      own: true,
    };
  }

  async sendInviteMessage(
    otherUserId: string,
    invite: MoonGamesInvite,
  ): Promise<DirectChatMessage> {
    // The shareable token belongs to the creator. The persisted card resolves
    // by invite id, and the server still enforces recipient authorization.
    const card: MoonGamesInvite = { ...invite };
    delete card.token;
    const content = inviteMessage(card);
    const channelId = await this.joinDirectChat(otherUserId);
    const ack = await this.requireSocket().writeChatMessage(channelId, content);
    return {
      id: ack.message_id,
      channelId,
      senderId: this.selfUserId ?? "",
      username: "",
      content: content as unknown as Record<string, unknown>,
      text: "",
      invite,
      createdAt: Date.parse(ack.create_time) || Date.now(),
      own: true,
    };
  }

  private normalizeDirectMessage(
    message: ChannelMessage,
  ): DirectChatMessage | null {
    if (typeof message.channel_id !== "string") {
      return null;
    }
    const content = record(message.content);
    let rawInvite = content.invite;
    if (typeof rawInvite === "string") {
      try {
        rawInvite = JSON.parse(rawInvite) as unknown;
      } catch {
        rawInvite = null;
      }
    }
    const invite = normalizeInvite(rawInvite);
    const text = typeof content.text === "string" ? content.text.trim() : "";
    if (text.length === 0 && invite === null) {
      return null;
    }
    const createdAt = Date.parse(message.create_time ?? "");
    const senderId = message.sender_id ?? "";
    return {
      id: message.message_id ?? "",
      channelId: message.channel_id,
      senderId,
      username: message.username ?? "Player",
      content,
      text,
      invite,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      own: this.selfUserId !== null && senderId === this.selfUserId,
    };
  }
}
