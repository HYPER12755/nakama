import type { MoonGamesInvite } from "@moongames/game-sdk";
import { parseInviteMessage } from "@moongames/game-sdk";

export const FRIEND_STATE = {
  mutual: 0,
  invited: 1,
  requested: 2,
  blocked: 3,
} as const;

export interface LauncherFriend {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  state: number;
  online: boolean;
}

export interface SocialMessage {
  id: string;
  senderId: string;
  username: string;
  text: string;
  createdAt: number;
  own: boolean;
  invite: MoonGamesInvite | null;
}

interface FriendLike {
  state?: number;
  user?: {
    id?: string;
    username?: string;
    display_name?: string;
    avatar_url?: string;
  };
}

interface MessageLike {
  channel_id?: string;
  content?: object;
  create_time?: string;
  message_id?: string;
  sender_id?: string;
  username?: string;
}

export function normalizeFriend(
  friend: FriendLike,
  onlineIds: ReadonlySet<string>,
): LauncherFriend | null {
  const id = friend.user?.id;
  if (typeof id !== "string" || id.length === 0) {
    return null;
  }
  const username = friend.user?.username?.trim() || "Player";
  return {
    userId: id,
    username,
    displayName: friend.user?.display_name?.trim() || null,
    avatarUrl: friend.user?.avatar_url?.trim() || null,
    state:
      typeof friend.state === "number"
        ? friend.state
        : FRIEND_STATE.mutual,
    online: onlineIds.has(id),
  };
}

export function mergeFriends(
  current: LauncherFriend[],
  incoming: LauncherFriend[],
): LauncherFriend[] {
  const next = new Map(current.map((friend) => [friend.userId, friend]));
  for (const friend of incoming) {
    next.set(friend.userId, friend);
  }
  return [...next.values()].sort((left, right) => {
    if (left.online !== right.online) {
      return left.online ? -1 : 1;
    }
    return left.username.localeCompare(right.username, undefined, {
      sensitivity: "base",
    });
  });
}

export function normalizeChatMessage(
  message: MessageLike,
  selfUserId: string,
): SocialMessage | null {
  const invite = parseInviteMessage(message.content);
  const text =
    typeof message.content === "object" &&
    message.content !== null &&
    typeof (message.content as { text?: unknown }).text === "string"
      ? (message.content as { text: string }).text.trim().slice(0, 1000)
      : "";
  if (text.length === 0 && invite === null) {
    return null;
  }
  const senderId = message.sender_id ?? "";
  const createdAt = Date.parse(message.create_time ?? "");
  return {
    id:
      message.message_id ??
      `${senderId}-${message.create_time ?? Date.now()}-${(text || invite?.inviteId || "invite").slice(0, 16)}`,
    senderId,
    username: message.username?.trim() || "Player",
    text,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    own: senderId.length > 0 && senderId === selfUserId,
    invite,
  };
}

export function mergeChatMessages(
  messages: SocialMessage[],
  incoming: SocialMessage[],
): SocialMessage[] {
  const byId = new Map(messages.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, message);
  }
  return [...byId.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }
    return left.id.localeCompare(right.id);
  });
}

export function chatPreview(messages: SocialMessage[]): string {
  const last = messages[messages.length - 1];
  if (last === undefined) {
    return "Start a conversation";
  }
  const prefix = last.own ? "You: " : "";
  if (last.invite !== null) {
    return `${prefix}${last.invite.gameTitle} invite`;
  }
  return `${prefix}${last.text}`;
}

export function friendDisplayName(friend: LauncherFriend): string {
  return friend.displayName ?? friend.username;
}

export function formatChatTime(timestamp: number): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function incomingFriendRequests(
  friends: LauncherFriend[],
): LauncherFriend[] {
  return friends.filter((friend) => friend.state === FRIEND_STATE.requested);
}

export function outgoingFriendRequests(
  friends: LauncherFriend[],
): LauncherFriend[] {
  return friends.filter((friend) => friend.state === FRIEND_STATE.invited);
}

export function acceptedFriends(
  friends: LauncherFriend[],
): LauncherFriend[] {
  return friends.filter((friend) => friend.state === FRIEND_STATE.mutual);
}
