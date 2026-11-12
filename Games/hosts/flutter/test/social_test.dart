import 'package:flutter_test/flutter_test.dart';
import 'package:nakama/nakama.dart' as nakama;
import 'package:moongames_host/moongames_host.dart';

void main() {
  const inviteJson = <String, dynamic>{
    'inviteId': 'invite-1',
    'gameId': 'chess',
    'gameTitle': 'Chess',
    'mode': 'private',
    'token': 'a-token-that-is-long-enough',
    'matchId': 'match-1',
    'sender': {'userId': 'self', 'username': 'Nova'},
    'recipient': {'userId': 'friend', 'username': 'Kai'},
    'status': 'pending',
    'createdAt': 1700000000000,
    'expiresAt': 1900000000000,
    'joinPath': '/invite/invite-1',
    'deepLink': 'moongames://invite/invite-1',
    'metadata': {'timeControl': '5+0'},
  };

  test('normalizes an invite card and its join state', () {
    final invite = MoonGamesInvite.fromJson(inviteJson);
    expect(invite.inviteId, 'invite-1');
    expect(invite.sender.username, 'Nova');
    expect(invite.recipient.userId, 'friend');
    expect(invite.metadata['timeControl'], '5+0');
    expect(invite.effectiveStatus, 'pending');
    expect(invite.isExpired, isFalse);
    expect(invite.isJoinable, isFalse);
    final accepted = MoonGamesInvite.fromJson({
      ...inviteJson,
      'status': 'accepted',
      'expiresAt': DateTime.now().millisecondsSinceEpoch + 60000,
    });
    expect(accepted.isJoinable, isTrue);
    expect(
      inviteShareUrl('https://games.example/app/', invite),
      'https://games.example/app/invite/a-token-that-is-long-enough',
    );
    expect(
      inviteTokenFromLink(
        'https://games.example/app/invite/a-token-that-is-long-enough',
      ),
      'a-token-that-is-long-enough',
    );
    expect(
      inviteTokenFromLink('moongames://invite/a-token-that-is-long-enough'),
      'a-token-that-is-long-enough',
    );
    expect(
      inviteTokenFromLink(
        'https://games.example/app/?invite=a-token-that-is-long-enough',
      ),
      'a-token-that-is-long-enough',
    );
    expect(
      inviteTokenFromLink('?invite=a-token-that-is-long-enough'),
      'a-token-that-is-long-enough',
    );
    expect(inviteTokenFromLink('https://games.example/app/'), isNull);
  });

  test('maps invite notifications and applies read state', () {
    final notification = nakama.Notification(
      id: 'notice-1',
      code: 2101,
      subject: 'Nova invited you to Chess',
      content: '{"invite":{"inviteId":"invite-1","gameId":"chess","gameTitle":"Chess","sender":{"userId":"self","username":"Nova"},"recipient":{"userId":"friend","username":"Kai"},"status":"pending","createdAt":1700000000000,"expiresAt":1900000000000}}',
      senderId: 'self',
      createTime: DateTime.utc(2026, 11, 12, 10),
      persistent: true,
    );
    final unread = MoonGamesNotification.fromNakama(
      notification,
      readIds: const {},
    );
    expect(unread.kind, 'invite');
    expect(unread.actionLabel, 'View invite');
    expect(unread.invite?.inviteId, 'invite-1');
    expect(unread.read, isFalse);

    final read = MoonGamesNotification.fromNakama(
      notification,
      readIds: const {'notice-1'},
    );
    expect(read.read, isTrue);
  });

  test('maps friend and invite lifecycle notification kinds', () {
    MoonGamesNotification parse(int code) {
      return MoonGamesNotification.fromNakama(
        nakama.Notification(
          id: 'notice-$code',
          code: code,
          subject: 'Update',
          content: '{}',
          senderId: 'friend',
          createTime: DateTime.utc(2026, 11, 12),
          persistent: true,
        ),
        readIds: const {},
      );
    }

    expect(parse(-2).kind, 'friend-request');
    expect(parse(1102).kind, 'friend-accepted');
    expect(parse(2102).kind, 'invite-accepted');
    expect(parse(2105).kind, 'invite-expired');
    expect(MoonGamesNotification.isVisibleCode(-9), isFalse);
    expect(MoonGamesNotification.isVisibleCode(1105), isTrue);
  });

  test('parses recent players with game context', () {
    final player = MoonGamesRecentPlayer.fromJson(const {
      'userId': 'friend',
      'username': 'Kai',
      'gameId': 'chess',
      'lastPlayedAt': 1700000000000,
    });
    expect(player.username, 'Kai');
    expect(player.gameId, 'chess');
    expect(player.lastPlayedAt, 1700000000000);
  });
}
