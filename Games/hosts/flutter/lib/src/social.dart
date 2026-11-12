import 'dart:async';
import 'dart:convert';

import 'package:nakama/nakama.dart' as nakama;

/// Raised when a MoonGames social RPC returns a structured error.
class MoonGamesSocialException implements Exception {
  const MoonGamesSocialException(this.code, this.message);

  final String code;
  final String message;

  @override
  String toString() => 'MoonGamesSocialException($code): $message';
}

/// Public player data carried by invites and recent-player lists.
class MoonGamesPlayer {
  const MoonGamesPlayer({
    required this.userId,
    required this.username,
    this.displayName,
    this.avatarUrl,
  });

  final String userId;
  final String username;
  final String? displayName;
  final String? avatarUrl;

  factory MoonGamesPlayer.fromJson(Map<String, dynamic> json) {
    return MoonGamesPlayer(
      userId: _string(json['userId']) ?? '',
      username: _string(json['username']) ?? 'Player',
      displayName: _string(json['displayName']),
      avatarUrl: _string(json['avatarUrl']),
    );
  }

  Map<String, dynamic> toJson() => {
    'userId': userId,
    'username': username,
    'displayName': displayName,
    'avatarUrl': avatarUrl,
  };
}

/// A platform invite. Invite rules stay on the authoritative game backend.
class MoonGamesInvite {
  const MoonGamesInvite({
    required this.inviteId,
    required this.gameId,
    required this.gameTitle,
    required this.mode,
    required this.sender,
    required this.recipient,
    required this.status,
    required this.createdAt,
    required this.expiresAt,
    required this.joinPath,
    required this.deepLink,
    this.token,
    this.matchId,
    this.previewUrl,
    this.message,
    this.metadata = const {},
  });

  final String inviteId;
  final String gameId;
  final String gameTitle;
  final String mode;
  final String? token;
  final String? matchId;
  final MoonGamesPlayer sender;
  final MoonGamesPlayer recipient;
  final String status;
  final int createdAt;
  final int expiresAt;
  final String joinPath;
  final String deepLink;
  final String? previewUrl;
  final String? message;
  final Map<String, dynamic> metadata;

  bool get isExpired =>
      status == 'pending' && DateTime.now().millisecondsSinceEpoch >= expiresAt;

  bool get isJoinable =>
      status == 'accepted' &&
      matchId != null &&
      DateTime.now().millisecondsSinceEpoch < expiresAt;

  String get effectiveStatus => isExpired ? 'expired' : status;

  factory MoonGamesInvite.fromJson(Map<String, dynamic> json) {
    return MoonGamesInvite(
      inviteId: _string(json['inviteId']) ?? '',
      gameId: _string(json['gameId']) ?? '',
      gameTitle: _string(json['gameTitle']) ?? 'MoonGames',
      mode: _string(json['mode']) ?? 'private',
      token: _string(json['token']),
      matchId: _string(json['matchId']),
      sender: MoonGamesPlayer.fromJson(_map(json['sender'])),
      recipient: MoonGamesPlayer.fromJson(_map(json['recipient'])),
      status: _string(json['status']) ?? 'pending',
      createdAt: _int(json['createdAt']) ?? 0,
      expiresAt: _int(json['expiresAt']) ?? 0,
      joinPath: _string(json['joinPath']) ?? '',
      deepLink: _string(json['deepLink']) ?? '',
      previewUrl: _string(json['previewUrl']),
      message: _string(json['message']),
      metadata: Map<String, dynamic>.from(_map(json['metadata'])),
    );
  }

  Map<String, dynamic> toJson() => {
    'inviteId': inviteId,
    'gameId': gameId,
    'gameTitle': gameTitle,
    'mode': mode,
    if (token != null) 'token': token,
    if (matchId != null) 'matchId': matchId,
    'sender': sender.toJson(),
    'recipient': recipient.toJson(),
    'status': status,
    'createdAt': createdAt,
    'expiresAt': expiresAt,
    'joinPath': joinPath,
    'deepLink': deepLink,
    if (previewUrl != null) 'previewUrl': previewUrl,
    if (message != null) 'message': message,
    'metadata': metadata,
  };
}

/// Invite state resolved for the current viewer.
class MoonGamesInviteResolution {
  const MoonGamesInviteResolution({
    required this.invite,
    required this.direction,
    required this.canAccept,
    required this.canDecline,
    required this.canCancel,
    required this.canJoin,
  });

  final MoonGamesInvite invite;
  final String direction;
  final bool canAccept;
  final bool canDecline;
  final bool canCancel;
  final bool canJoin;

  factory MoonGamesInviteResolution.fromJson(Map<String, dynamic> json) {
    return MoonGamesInviteResolution(
      invite: MoonGamesInvite.fromJson(_map(json['invite'])),
      direction: _string(json['direction']) ?? 'incoming',
      canAccept: json['canAccept'] == true,
      canDecline: json['canDecline'] == true,
      canCancel: json['canCancel'] == true,
      canJoin: json['canJoin'] == true,
    );
  }
}

/// A persistent MoonGames notification. Read through [MoonGamesSocialClient].
class MoonGamesNotification {
  const MoonGamesNotification({
    required this.id,
    required this.code,
    required this.subject,
    required this.createdAt,
    required this.read,
    this.invite,
    this.content = const {},
  });

  final String id;
  final int code;
  final String subject;
  final int createdAt;
  final bool read;
  final MoonGamesInvite? invite;
  final Map<String, dynamic> content;

  String get kind {
    switch (code) {
      case -1:
        return 'message';
      case -2:
        return 'friend-request';
      case -3:
        return 'friend-accepted';
      case 1102:
        return 'friend-accepted';
      case 1103:
        return 'friend-declined';
      case 1104:
        return 'friend-cancelled';
      case 1105:
        return 'friend-removed';
      case 2101:
        return 'invite';
      case 2102:
        return 'invite-accepted';
      case 2103:
        return 'invite-declined';
      case 2104:
        return 'invite-cancelled';
      case 2105:
        return 'invite-expired';
      default:
        return 'system';
    }
  }

  String? get actionLabel {
    switch (kind) {
      case 'friend-request':
        return 'Respond';
      case 'invite':
        return 'View invite';
      case 'invite-accepted':
        return 'Open room';
      default:
        return null;
    }
  }

  /// Nakama emits -9 for declines, cancellations, and removals. MoonGames
  /// sends 1103-1105 instead, so clients suppress the generic duplicate.
  static bool isVisibleCode(int code) => code != -9;

  factory MoonGamesNotification.fromNakama(
    nakama.Notification notification, {
    required Set<String> readIds,
  }) {
    Map<String, dynamic> content = const {};
    final raw = notification.content;
    if (raw != null && raw.isNotEmpty) {
      try {
        final decoded = jsonDecode(raw);
        if (decoded is Map) {
          content = Map<String, dynamic>.from(decoded);
        }
      } catch (_) {
        // Notification content is optional; ignore malformed payloads.
      }
    }
    final inviteValue = content['invite'];
    MoonGamesInvite? invite;
    if (inviteValue is Map) {
      invite = MoonGamesInvite.fromJson(Map<String, dynamic>.from(inviteValue));
    }
    return MoonGamesNotification(
      id: notification.id,
      code: notification.code,
      subject: notification.subject ?? 'MoonGames update',
      createdAt: notification.createTime.millisecondsSinceEpoch,
      read: readIds.contains(notification.id),
      invite: invite,
      content: content,
    );
  }
}

/// A recent opponent returned by the platform recent-player list.
class MoonGamesRecentPlayer extends MoonGamesPlayer {
  const MoonGamesRecentPlayer({
    required super.userId,
    required super.username,
    super.displayName,
    super.avatarUrl,
    required this.gameId,
    required this.lastPlayedAt,
  });

  final String gameId;
  final int lastPlayedAt;

  factory MoonGamesRecentPlayer.fromJson(Map<String, dynamic> json) {
    final player = MoonGamesPlayer.fromJson(json);
    return MoonGamesRecentPlayer(
      userId: player.userId,
      username: player.username,
      displayName: player.displayName,
      avatarUrl: player.avatarUrl,
      gameId: _string(json['gameId']) ?? 'chess',
      lastPlayedAt: _int(json['lastPlayedAt']) ?? 0,
    );
  }
}

/// Input for creating an invite through the authoritative game backend.
class MoonGamesInviteDraft {
  const MoonGamesInviteDraft({
    required this.gameId,
    this.recipientId,
    this.recipientUsername,
    this.message,
    this.timeControl,
  }) : assert(recipientId != null || recipientUsername != null);

  final String gameId;
  final String? recipientId;
  final String? recipientUsername;
  final String? message;
  final String? timeControl;

  Map<String, dynamic> toJson() => {
    'gameId': gameId,
    'mode': 'private',
    if (recipientId != null) 'recipientId': recipientId,
    if (recipientUsername != null) 'recipientUsername': recipientUsername,
    if (message != null) 'message': message,
    if (timeControl != null) 'timeControl': timeControl,
  };
}

/// Direct-chat history normalized for host-owned chat UIs.
class MoonGamesDirectMessage {
  const MoonGamesDirectMessage({
    required this.id,
    required this.channelId,
    required this.senderId,
    required this.username,
    required this.text,
    required this.createdAt,
    required this.own,
    this.invite,
  });

  final String id;
  final String channelId;
  final String senderId;
  final String username;
  final String text;
  final int createdAt;
  final bool own;
  final MoonGamesInvite? invite;
}

/// Shared client for invitations, notifications, friends, and direct chat.
///
/// The host keeps its own account/social UI. This class only calls MoonGames
/// Nakama RPCs and gives the host structured data to render.
class MoonGamesSocialClient {
  MoonGamesSocialClient({
    required nakama.NakamaBaseClient client,
    required nakama.Session session,
    nakama.NakamaWebsocketClient? socket,
    String? selfUserId,
  }) : _client = client,
       _session = session,
       _socket = socket,
       _selfUserId = selfUserId ?? session.userId {
    _attachSocket(socket);
  }

  final nakama.NakamaBaseClient _client;
  nakama.Session _session;
  nakama.NakamaWebsocketClient? _socket;
  final String _selfUserId;
  final Map<String, String> _directChannels = {};
  final Set<String> _readIds = {};
  final StreamController<MoonGamesNotification> _notifications =
      StreamController<MoonGamesNotification>.broadcast();
  final List<MoonGamesNotification> _pendingNotifications = [];
  StreamSubscription<nakama.Notification>? _notificationSubscription;

  /// Persistent notifications delivered while the host is connected.
  ///
  /// Events received before a listener attaches are queued. Call
  /// [drainPendingNotifications] when the host UI mounts.
  Stream<MoonGamesNotification> get notificationStream => _notifications.stream;

  /// Returns notifications received before the host attached a listener.
  List<MoonGamesNotification> drainPendingNotifications() {
    final pending = List<MoonGamesNotification>.of(_pendingNotifications);
    _pendingNotifications.clear();
    return pending;
  }

  String get selfUserId => _selfUserId;

  void updateSession(nakama.Session session) {
    _session = session;
  }

  void attachSocket(nakama.NakamaWebsocketClient? socket) {
    _attachSocket(socket);
  }

  void _attachSocket(nakama.NakamaWebsocketClient? socket) {
    _notificationSubscription?.cancel();
    _notificationSubscription = null;
    _socket = socket;
    _directChannels.clear();
    if (socket == null) {
      return;
    }
    _notificationSubscription = socket.onNotifications.listen((notification) {
      if (_notifications.isClosed ||
          !MoonGamesNotification.isVisibleCode(notification.code)) {
        return;
      }
      final normalized = MoonGamesNotification.fromNakama(
        notification,
        readIds: _readIds,
      );
      if (!_notifications.hasListener) {
        if (_pendingNotifications.length >= 100) {
          _pendingNotifications.removeAt(0);
        }
        _pendingNotifications.add(normalized);
        return;
      }
      _notifications.add(normalized);
    });
  }

  Future<void> dispose() async {
    await _notificationSubscription?.cancel();
    _pendingNotifications.clear();
    await _notifications.close();
  }

  Future<Map<String, dynamic>> _rpc(
    String id, [
    Map<String, dynamic>? input,
  ]) async {
    final raw = await _client.rpc(
      session: _session,
      id: id,
      payload: input == null ? null : jsonEncode(input),
    );
    if (raw == null || raw.isEmpty) {
      return <String, dynamic>{};
    }
    final decoded = jsonDecode(raw);
    if (decoded is! Map) {
      throw const MoonGamesSocialException(
        'invalid_response',
        'MoonGames returned an invalid social response.',
      );
    }
    final response = Map<String, dynamic>.from(decoded);
    if (response['ok'] == false) {
      final error = _map(response['error']);
      throw MoonGamesSocialException(
        _string(error['code']) ?? 'social_error',
        _string(error['message']) ?? 'The MoonGames social request failed.',
      );
    }
    return response;
  }

  Future<MoonGamesInvite> createInvite(MoonGamesInviteDraft draft) async {
    final response = await _rpc('moongames_invite_create', draft.toJson());
    return MoonGamesInvite.fromJson(_map(response['invite']));
  }

  Future<MoonGamesInviteResolution> resolveInvite({
    String? inviteId,
    String? token,
  }) async {
    final response = await _rpc('moongames_invite_resolve', {
      if (inviteId != null) 'inviteId': inviteId,
      if (token != null) 'token': token,
    });
    return MoonGamesInviteResolution.fromJson(response);
  }

  Future<MoonGamesInvite> acceptInvite({String? inviteId, String? token}) =>
      _inviteAction(
        'moongames_invite_accept',
        inviteId: inviteId,
        token: token,
      );

  Future<MoonGamesInvite> declineInvite({String? inviteId, String? token}) =>
      _inviteAction(
        'moongames_invite_decline',
        inviteId: inviteId,
        token: token,
      );

  Future<MoonGamesInvite> cancelInvite({String? inviteId, String? token}) =>
      _inviteAction(
        'moongames_invite_cancel',
        inviteId: inviteId,
        token: token,
      );

  Future<MoonGamesInvite> _inviteAction(
    String rpcId, {
    String? inviteId,
    String? token,
  }) async {
    final response = await _rpc(rpcId, {
      if (inviteId != null) 'inviteId': inviteId,
      if (token != null) 'token': token,
    });
    return MoonGamesInvite.fromJson(_map(response['invite']));
  }

  Future<Set<String>> readNotificationIds() async {
    final response = await _rpc('moongames_notifications_state');
    final values = response['readIds'];
    final ids = <String>{};
    if (values is List) {
      for (final value in values) {
        if (value is String) {
          ids.add(value);
        }
      }
    }
    _readIds
      ..clear()
      ..addAll(ids);
    return ids;
  }

  /// Lists persistent notifications with their read state applied.
  ///
  /// Calling this after reconnecting replays all queued invites and friend
  /// events, so hosts can rebuild their own notification UI safely.
  Future<List<MoonGamesNotification>> listNotifications({
    int limit = 100,
  }) async {
    await readNotificationIds();
    final list = await _client.listNotifications(
      session: _session,
      limit: limit,
    );
    return list.notifications
        .where(
          (notification) =>
              MoonGamesNotification.isVisibleCode(notification.code),
        )
        .map(
          (notification) =>
              MoonGamesNotification.fromNakama(notification, readIds: _readIds),
        )
        .toList(growable: false);
  }

  /// Replays persistent invite notifications after a host reconnect.
  Future<List<MoonGamesNotification>> replayInvites({int limit = 100}) async {
    final notifications = await listNotifications(limit: limit);
    return notifications
        .where((notification) {
          return notification.invite != null ||
              notification.kind == 'invite' ||
              notification.kind == 'invite-accepted' ||
              notification.kind == 'invite-declined' ||
              notification.kind == 'invite-cancelled' ||
              notification.kind == 'invite-expired';
        })
        .toList(growable: false);
  }

  Future<Set<String>> markNotificationsRead({
    List<String> ids = const [],
    bool all = false,
  }) async {
    final response = await _rpc('moongames_notifications_mark_read', {
      'ids': ids,
      'all': all,
    });
    final values = response['readIds'];
    final next = <String>{};
    if (values is List) {
      for (final value in values) {
        if (value is String) {
          next.add(value);
        }
      }
    }
    _readIds
      ..clear()
      ..addAll(next);
    return next;
  }

  Future<String> requestFriend({String? userId, String? username}) =>
      _friendAction('moongames_friend_request', userId, username);

  Future<String> acceptFriend({String? userId, String? username}) =>
      _friendAction('moongames_friend_accept', userId, username);

  Future<String> declineFriend({String? userId, String? username}) =>
      _friendAction('moongames_friend_decline', userId, username);

  Future<String> cancelFriend({String? userId, String? username}) =>
      _friendAction('moongames_friend_cancel', userId, username);

  Future<String> removeFriend({String? userId, String? username}) =>
      _friendAction('moongames_friend_remove', userId, username);

  Future<String> _friendAction(
    String rpcId,
    String? userId,
    String? username,
  ) async {
    final response = await _rpc(rpcId, {
      if (userId != null) 'userId': userId,
      if (username != null) 'username': username,
    });
    return _string(response['status']) ?? 'updated';
  }

  Future<List<MoonGamesRecentPlayer>> listRecentPlayers() async {
    final response = await _rpc('moongames_recent_players_list');
    final values = response['players'];
    if (values is! List) {
      return const [];
    }
    return values
        .whereType<Map>()
        .map(
          (value) =>
              MoonGamesRecentPlayer.fromJson(Map<String, dynamic>.from(value)),
        )
        .toList(growable: false);
  }

  nakama.NakamaWebsocketClient _requireSocket() {
    final socket = _socket;
    if (socket == null) {
      throw const MoonGamesSocialException(
        'not_connected',
        'Connect to the MoonGames realtime socket first.',
      );
    }
    return socket;
  }

  Future<String> joinDirectChat(String otherUserId) async {
    final existing = _directChannels[otherUserId];
    if (existing != null) {
      return existing;
    }
    final channel = await _requireSocket().joinChannel(
      target: otherUserId,
      type: nakama.ChannelType.directMessage,
      persistence: true,
      hidden: false,
    );
    _directChannels[otherUserId] = channel.id;
    return channel.id;
  }

  Future<List<MoonGamesDirectMessage>> listDirectMessages(
    String otherUserId, {
    int limit = 60,
  }) async {
    final channelId = await joinDirectChat(otherUserId);
    final list = await _client.listChannelMessages(
      session: _session,
      channelId: channelId,
      limit: limit,
      forward: false,
    );
    final messages = <MoonGamesDirectMessage>[];
    for (final message in list.messages) {
      Map<String, dynamic> content = const {};
      try {
        final decoded = jsonDecode(message.content);
        if (decoded is Map) {
          content = Map<String, dynamic>.from(decoded);
        }
      } catch (_) {
        // Ignore malformed chat content.
      }
      final inviteValue = content['invite'];
      MoonGamesInvite? invite;
      if (inviteValue is Map) {
        invite = MoonGamesInvite.fromJson(
          Map<String, dynamic>.from(inviteValue),
        );
      } else if (inviteValue is String) {
        try {
          final decoded = jsonDecode(inviteValue);
          if (decoded is Map) {
            invite = MoonGamesInvite.fromJson(
              Map<String, dynamic>.from(decoded),
            );
          }
        } catch (_) {
          // Ignore malformed invite content.
        }
      }
      messages.add(
        MoonGamesDirectMessage(
          id: message.messageId,
          channelId: message.channelId,
          senderId: message.senderId,
          username: message.username,
          text: _string(content['text']) ?? '',
          createdAt: message.createTime.millisecondsSinceEpoch,
          own: message.senderId == _selfUserId,
          invite: invite,
        ),
      );
    }
    messages.sort((left, right) => left.createdAt.compareTo(right.createdAt));
    return messages;
  }

  Future<nakama.ChannelMessageAck> sendDirectMessage(
    String otherUserId,
    String text,
  ) async {
    final value = text.trim();
    if (value.isEmpty) {
      throw const MoonGamesSocialException(
        'empty_message',
        'Write a message first.',
      );
    }
    final channelId = await joinDirectChat(otherUserId);
    return _requireSocket().sendMessage(
      channelId: channelId,
      content: {
        'text': value.substring(0, value.length > 1000 ? 1000 : value.length),
      },
    );
  }

  /// Sends an invite card into the persisted direct chat.
  ///
  /// The invite JSON is stored as a string because the Dart SDK accepts string
  /// values only; the web client also accepts this representation.
  Future<nakama.ChannelMessageAck> sendInviteMessage(
    String otherUserId,
    MoonGamesInvite invite,
  ) async {
    final channelId = await joinDirectChat(otherUserId);
    final card = invite.toJson()..remove('token');
    return _requireSocket().sendMessage(
      channelId: channelId,
      content: {
        'type': 'moongames.invite',
        'version': '1',
        'invite': jsonEncode(card),
      },
    );
  }
}

/// Account operations that keep guest progress while requiring explicit
/// password consent before an email identity can access the account.
class MoonGamesAccountClient {
  const MoonGamesAccountClient(this.client);

  final nakama.NakamaBaseClient client;

  /// Links an email/password to the current guest session and returns the new
  /// email session. The caller must have already received user consent and a
  /// MoonGames password.
  Future<nakama.Session> linkGuestEmail({
    required nakama.Session guestSession,
    required String email,
    required String password,
    String? username,
  }) async {
    final normalizedEmail = email.trim().toLowerCase();
    if (!_looksLikeEmail(normalizedEmail)) {
      throw const MoonGamesSocialException(
        'invalid_email',
        'Enter a valid email address.',
      );
    }
    if (password.length < 8) {
      throw const MoonGamesSocialException(
        'weak_password',
        'Use at least 8 characters for your MoonGames password.',
      );
    }
    if (password.length > 128) {
      throw const MoonGamesSocialException(
        'password_too_long',
        'MoonGames passwords must be 128 characters or fewer.',
      );
    }
    await client.linkEmail(
      session: guestSession,
      email: normalizedEmail,
      password: password,
    );
    final trimmedUsername = username?.trim() ?? '';
    if (trimmedUsername.isNotEmpty) {
      try {
        await client.updateAccount(
          session: guestSession,
          username: trimmedUsername,
        );
      } catch (_) {
        // The email link is already authoritative. A host-provided name can be
        // unavailable, and that must not strand the user in a half-linked state.
      }
    }
    return client.authenticateEmail(
      email: normalizedEmail,
      password: password,
      create: false,
    );
  }

  /// Signs in to an existing MoonGames email account. The password is always
  /// required, so a host-supplied email alone can never take over an account.
  Future<nakama.Session> signIn({
    required String email,
    required String password,
  }) {
    return client.authenticateEmail(
      email: email.trim().toLowerCase(),
      password: password,
      create: false,
    );
  }

  /// Host-owned linking decision point. Existing emails always require the
  /// MoonGames password; new accounts link the current guest after consent.
  Future<nakama.Session> linkHostAccount({
    required nakama.Session guestSession,
    required String email,
    required String password,
    required String mode,
    String? username,
  }) async {
    if (mode == 'existing') {
      return signIn(email: email, password: password);
    }
    if (mode != 'create') {
      throw ArgumentError.value(mode, 'mode', "Use 'existing' or 'create'.");
    }
    return linkGuestEmail(
      guestSession: guestSession,
      email: email,
      password: password,
      username: username,
    );
  }

  /// Syncs the host's current account name into the shared MoonGames identity.
  /// Email remains the stable key.
  Future<void> syncUsername({
    required nakama.Session session,
    required String username,
  }) async {
    final value = username.trim();
    if (!RegExp(r'^[A-Za-z0-9_]{3,20}$').hasMatch(value)) {
      throw const MoonGamesSocialException(
        'invalid_username',
        'Use 3–20 letters, numbers, or underscores for your player name.',
      );
    }
    await client.updateAccount(session: session, username: value);
  }

  /// Creates a fresh email identity for hosts that are not linking a guest.
  Future<nakama.Session> signUp({
    required String email,
    required String password,
    String? username,
  }) {
    final normalizedEmail = email.trim().toLowerCase();
    if (!_looksLikeEmail(normalizedEmail)) {
      throw const MoonGamesSocialException(
        'invalid_email',
        'Enter a valid email address.',
      );
    }
    if (password.length < 8) {
      throw const MoonGamesSocialException(
        'weak_password',
        'Use at least 8 characters for your MoonGames password.',
      );
    }
    if (password.length > 128) {
      throw const MoonGamesSocialException(
        'password_too_long',
        'MoonGames passwords must be 128 characters or fewer.',
      );
    }
    return client.authenticateEmail(
      email: normalizedEmail,
      username: username?.trim(),
      password: password,
      create: true,
    );
  }
}

bool _looksLikeEmail(String value) {
  final at = value.indexOf('@');
  final dot = value.lastIndexOf('.');
  return at > 0 && dot > at + 1 && dot < value.length - 1;
}

String? _string(Object? value) {
  if (value is String && value.isNotEmpty) {
    return value;
  }
  return null;
}

int? _int(Object? value) {
  if (value is int) {
    return value;
  }
  if (value is num) {
    return value.round();
  }
  if (value is String) {
    return int.tryParse(value);
  }
  return null;
}

Map<String, dynamic> _map(Object? value) {
  if (value is Map) {
    return Map<String, dynamic>.from(value);
  }
  return <String, dynamic>{};
}

/// Builds a shareable MoonGames invite URL from a launcher base URL.
String? inviteShareUrl(String baseUrl, MoonGamesInvite invite) {
  final token = invite.token;
  if (token == null || token.isEmpty) {
    return null;
  }
  final base = baseUrl.endsWith('/') ? baseUrl : '$baseUrl/';
  return Uri.parse(base)
      .resolve('invite/${Uri.encodeComponent(token)}')
      .toString();
}

/// Extracts an invite token from a web path, query string, or native deep link.
String? inviteTokenFromLink(String value) {
  final trimmed = value.trim();
  if (trimmed.isEmpty) {
    return null;
  }
  final pathMatch = RegExp(
    r'(?:^|[:/])invite/([^/?#]+)',
    caseSensitive: false,
  ).firstMatch(trimmed);
  if (pathMatch != null) {
    try {
      final token = Uri.decodeComponent(pathMatch.group(1)!);
      if (token.isNotEmpty) {
        return token;
      }
    } on FormatException {
      // Fall through to query parsing.
    }
  }
  final uri = Uri.tryParse(trimmed);
  final query = uri?.queryParameters['invite']?.trim();
  if (query != null && query.isNotEmpty) {
    return query;
  }
  return null;
}
