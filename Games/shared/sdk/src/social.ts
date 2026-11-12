/**
 * Shared MoonGames social contracts.
 *
 * These shapes are intentionally transport-ready: the web launcher, native
 * host SDKs, and the Nakama Lua modules all exchange the same invite card and
 * notification payloads. Host apps own their own DM storage; MoonGames owns
 * the global identity, friend graph, launcher DMs, notifications, and invites.
 */

export const SOCIAL_INVITE_VERSION = 1 as const;
export const SOCIAL_INVITE_MESSAGE_TYPE = "moongames.invite" as const;
export const SOCIAL_INVITE_TTL_MS = 24 * 60 * 60 * 1000;
export const SOCIAL_NOTIFICATION_PAGE_SIZE = 50;

export const SOCIAL_NOTIFICATION_CODES = {
  friendAccepted: 1102,
  friendDeclined: 1103,
  friendRequestCancelled: 1104,
  friendRemoved: 1105,
  inviteReceived: 2101,
  inviteAccepted: 2102,
  inviteDeclined: 2103,
  inviteCancelled: 2104,
  inviteExpired: 2105,
} as const;

export type SocialNotificationCode =
  (typeof SOCIAL_NOTIFICATION_CODES)[keyof typeof SOCIAL_NOTIFICATION_CODES];

export type SocialNotificationKind =
  | "friend-request"
  | "friend-accepted"
  | "friend-declined"
  | "friend-cancelled"
  | "friend-removed"
  | "invite"
  | "invite-accepted"
  | "invite-declined"
  | "invite-cancelled"
  | "invite-expired"
  | "message"
  | "system";

export type InviteStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled"
  | "expired";

export interface SocialPlayerSummary {
  userId: string;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface MoonGamesInvite {
  inviteId: string;
  /** Only present in the creator's response and shareable link. */
  token?: string;
  gameId: string;
  gameTitle: string;
  mode: string;
  matchId: string | null;
  sender: SocialPlayerSummary;
  recipient: SocialPlayerSummary;
  status: InviteStatus;
  createdAt: number;
  expiresAt: number;
  joinPath: string;
  deepLink: string;
  previewUrl: string | null;
  message: string | null;
  metadata?: Record<string, unknown>;
}

export interface InviteMessageContent {
  type: typeof SOCIAL_INVITE_MESSAGE_TYPE;
  version: typeof SOCIAL_INVITE_VERSION;
  invite: MoonGamesInvite;
}

export interface SocialNotification {
  id: string;
  code: number;
  subject: string;
  content: Record<string, unknown>;
  createdAt: number;
  read: boolean;
  kind: SocialNotificationKind;
  invite: MoonGamesInvite | null;
  senderId: string | null;
}

export interface InviteCreateInput {
  gameId: string;
  mode?: string;
  recipientId?: string;
  recipientUsername?: string;
  message?: string;
  timeControl?: string;
  metadata?: Record<string, unknown>;
}

export interface InviteResolveResult {
  invite: MoonGamesInvite;
  direction: "incoming" | "outgoing";
  canAccept: boolean;
  canDecline: boolean;
  canCancel: boolean;
  canJoin: boolean;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function number(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function player(value: unknown): SocialPlayerSummary | null {
  const source = record(value);
  if (source === null) {
    return null;
  }
  const userId = text(source.userId ?? source.user_id);
  const username = text(source.username);
  if (userId.length === 0 || username.length === 0) {
    return null;
  }
  return {
    userId,
    username,
    displayName: text(source.displayName ?? source.display_name) || null,
    avatarUrl: text(source.avatarUrl ?? source.avatar_url) || null,
  };
}

export function isInviteStatus(value: unknown): value is InviteStatus {
  return (
    value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "cancelled" ||
    value === "expired"
  );
}

export function normalizeInvite(value: unknown): MoonGamesInvite | null {
  const source = record(value);
  if (source === null) {
    return null;
  }
  const inviteId = text(source.inviteId ?? source.invite_id ?? source.id);
  const gameId = text(source.gameId ?? source.game_id);
  const sender = player(source.sender ?? source.senderPlayer);
  const recipient = player(source.recipient ?? source.recipientPlayer);
  if (
    inviteId.length === 0 ||
    gameId.length === 0 ||
    sender === null ||
    recipient === null
  ) {
    return null;
  }
  const createdAt = number(source.createdAt ?? source.created_at);
  const expiresAt = number(source.expiresAt ?? source.expires_at);
  const status = isInviteStatus(source.status) ? source.status : "pending";
  const metadata = record(source.metadata);
  return {
    inviteId,
    ...(text(source.token).length > 0 ? { token: text(source.token) } : {}),
    gameId,
    gameTitle: text(source.gameTitle ?? source.game_title, "MoonGames"),
    mode: text(source.mode, "private"),
    matchId: text(source.matchId ?? source.match_id) || null,
    sender,
    recipient,
    status,
    createdAt,
    expiresAt,
    joinPath: text(source.joinPath ?? source.join_path, `/invite/${inviteId}`),
    deepLink: text(
      source.deepLink ?? source.deep_link,
      `moongames://invite/${inviteId}`,
    ),
    previewUrl: text(source.previewUrl ?? source.preview_url) || null,
    message: text(source.message) || null,
    ...(metadata === null ? {} : { metadata }),
  };
}

export function inviteMessage(invite: MoonGamesInvite): InviteMessageContent {
  return {
    type: SOCIAL_INVITE_MESSAGE_TYPE,
    version: SOCIAL_INVITE_VERSION,
    invite,
  };
}

export function parseInviteMessage(value: unknown): MoonGamesInvite | null {
  const source = record(value);
  if (
    source === null ||
    source.type !== SOCIAL_INVITE_MESSAGE_TYPE ||
    (source.version !== SOCIAL_INVITE_VERSION && source.version !== "1")
  ) {
    return null;
  }
  let rawInvite = source.invite;
  if (typeof rawInvite === "string") {
    try {
      rawInvite = JSON.parse(rawInvite) as unknown;
    } catch {
      return null;
    }
  }
  return normalizeInvite(rawInvite);
}

function safeDecode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Extracts an invite token from a web path, query string, or native deep link.
 * Supports `/invite/<token>`, `?invite=<token>`, and
 * `moongames://invite/<token>`.
 */
export function inviteTokenFromLink(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const pathMatch = trimmed.match(/(?:^|[:/])invite\/([^/?#]+)/i);
  if (pathMatch?.[1] !== undefined) {
    const token = safeDecode(pathMatch[1]);
    if (token !== null && token.length > 0) {
      return token;
    }
  }
  try {
    const url = new URL(trimmed);
    const query = url.searchParams.get("invite");
    if (query !== null && query.trim().length > 0) {
      return query.trim();
    }
  } catch {
    // Relative paths are handled by the path and query matches below.
  }
  const queryMatch = trimmed.match(/[?&]invite=([^&#]*)/i);
  if (queryMatch?.[1] !== undefined) {
    const decoded = safeDecode(queryMatch[1]);
    const token = decoded?.trim() ?? "";
    if (token.length > 0) {
      return token;
    }
  }
  return null;
}

export function isInviteJoinable(
  invite: MoonGamesInvite,
  now = Date.now(),
): boolean {
  return (
    invite.status === "accepted" &&
    invite.expiresAt > now &&
    invite.matchId !== null &&
    invite.matchId.length > 0
  );
}

export function inviteIsExpired(
  invite: MoonGamesInvite,
  now = Date.now(),
): boolean {
  return invite.status === "pending" && invite.expiresAt <= now;
}

/** Builds the token-based share link for a created invite. */
export function inviteShareUrl(
  baseUrl: string,
  invite: MoonGamesInvite,
): string | null {
  if (invite.token === undefined || invite.token.length === 0) {
    return null;
  }
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(`invite/${encodeURIComponent(invite.token)}`, base).toString();
}

export function effectiveInviteStatus(
  invite: MoonGamesInvite,
  now = Date.now(),
): InviteStatus {
  return inviteIsExpired(invite, now) ? "expired" : invite.status;
}

export function inviteStatusLabel(
  invite: MoonGamesInvite,
  now = Date.now(),
): string {
  switch (effectiveInviteStatus(invite, now)) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired";
    default:
      return "Waiting";
  }
}

/**
 * Nakama emits the generic code -9 for declines, cancellations, and removals.
 * MoonGames sends 1103-1105 instead so the notification keeps the real reason.
 * Clients suppress -9 to avoid duplicate or misleading friend alerts.
 */
export function isDuplicateFriendRemovalNotification(
  code: number | undefined,
): boolean {
  return code === -9;
}

export function notificationKind(code: number): SocialNotificationKind {
  switch (code) {
    case SOCIAL_NOTIFICATION_CODES.friendAccepted:
      return "friend-accepted";
    case SOCIAL_NOTIFICATION_CODES.friendDeclined:
      return "friend-declined";
    case SOCIAL_NOTIFICATION_CODES.friendRequestCancelled:
      return "friend-cancelled";
    case SOCIAL_NOTIFICATION_CODES.friendRemoved:
      return "friend-removed";
    case SOCIAL_NOTIFICATION_CODES.inviteReceived:
      return "invite";
    case SOCIAL_NOTIFICATION_CODES.inviteAccepted:
      return "invite-accepted";
    case SOCIAL_NOTIFICATION_CODES.inviteDeclined:
      return "invite-declined";
    case SOCIAL_NOTIFICATION_CODES.inviteCancelled:
      return "invite-cancelled";
    case SOCIAL_NOTIFICATION_CODES.inviteExpired:
      return "invite-expired";
    case -1:
      return "message";
    case -2:
      return "friend-request";
    case -3:
      return "friend-accepted";
    default:
      return "system";
  }
}

export interface NotificationLike {
  id?: string;
  code?: number;
  subject?: string;
  content?: unknown;
  create_time?: string;
  createTime?: string;
  sender_id?: string;
  senderId?: string;
  read?: boolean;
}

export function normalizeNotification(
  value: NotificationLike,
  readIds: ReadonlySet<string> = new Set(),
): SocialNotification | null {
  const id = text(value.id);
  if (id.length === 0) {
    return null;
  }
  const code = number(value.code);
  const content = record(value.content) ?? {};
  const createdAt = Date.parse(value.create_time ?? value.createTime ?? "");
  const invite =
    normalizeInvite(content.invite) ??
    normalizeInvite(content) ??
    null;
  return {
    id,
    code,
    subject: text(value.subject, "MoonGames"),
    content,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    read: readIds.has(id) || value.read === true,
    kind: notificationKind(code),
    invite,
    senderId: text(value.sender_id ?? value.senderId) || null,
  };
}

export function mergeNotifications(
  current: SocialNotification[],
  incoming: SocialNotification[],
  readIds: ReadonlySet<string> = new Set(),
): SocialNotification[] {
  const byId = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) {
    const previous = byId.get(item.id);
    byId.set(item.id, {
      ...item,
      read: item.read || previous?.read === true || readIds.has(item.id),
    });
  }
  return [...byId.values()].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return right.createdAt - left.createdAt;
    }
    return right.id.localeCompare(left.id);
  });
}

export function unreadNotificationCount(
  notifications: SocialNotification[],
): number {
  return notifications.reduce(
    (total, notification) => total + (notification.read ? 0 : 1),
    0,
  );
}

export function notificationActionLabel(
  notification: SocialNotification,
): string | null {
  switch (notification.kind) {
    case "invite":
      return "Review invite";
    case "invite-accepted":
    case "invite-declined":
    case "invite-cancelled":
    case "invite-expired":
      return "View invite";
    case "friend-request":
    case "friend-accepted":
    case "friend-declined":
    case "friend-cancelled":
    case "friend-removed":
      return "View friends";
    case "message":
      return "Open message";
    default:
      return null;
  }
}

export function inviteDirection(
  invite: MoonGamesInvite,
  selfUserId: string,
): "incoming" | "outgoing" | null {
  if (invite.sender.userId === selfUserId) {
    return "outgoing";
  }
  if (invite.recipient.userId === selfUserId) {
    return "incoming";
  }
  return null;
}

export function resolveInviteView(
  invite: MoonGamesInvite,
  selfUserId: string,
  now = Date.now(),
): InviteResolveResult | null {
  const direction = inviteDirection(invite, selfUserId);
  if (direction === null) {
    return null;
  }
  const pending = effectiveInviteStatus(invite, now) === "pending";
  return {
    invite,
    direction,
    canAccept: pending && direction === "incoming",
    canDecline: pending && direction === "incoming",
    canCancel: pending && direction === "outgoing",
    canJoin:
      effectiveInviteStatus(invite, now) === "accepted" &&
      isInviteJoinable(invite, now),
  };
}
