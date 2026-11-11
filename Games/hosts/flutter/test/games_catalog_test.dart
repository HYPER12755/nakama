import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:moongames_host/moongames_host.dart';

Map<String, Object?> _catalog({List<Map<String, Object?>>? games}) {
  return {
    'format': 1,
    'generatedAt': '2026-11-11T00:00:00.000Z',
    'games':
        games ??
        [
          {
            'id': 'chess',
            'name': 'Chess',
            'tagline': 'Classic chess.',
            'description': 'Play chess locally, against the AI, or online.',
            'status': 'available',
            'version': '0.1.0',
            'minPlayers': 2,
            'maxPlayers': 2,
            'capabilities': ['local', 'ai', 'online'],
            'orientation': 'any',
            'tags': ['strategy', '1v1'],
            'accent': '#e5b85c',
            'icon': '♞',
            'featured': true,
            'sortOrder': 10,
            'webPath': 'chess/',
            'release': {
              'version': '0.1.0',
              'minHostProtocol': 1,
              'publishedAt': '2026-11-11T00:00:00.000Z',
              'sha256': 'a' * 64,
              'size': 1024,
              'keyId': 'dev-1',
            },
          },
        ],
  };
}

void main() {
  test('parses catalog data and resolves web links', () {
    final catalog = GamesCatalog.fromJson(_catalog());
    expect(catalog.games, hasLength(1));
    expect(catalog.availableGames().single.id, 'chess');
    expect(catalog.findGame('chess')?.status, GameAvailability.available);
    expect(catalog.findGame('cards'), isNull);
    expect(
      catalog.games.single
          .resolveWebUrl(Uri.parse('https://cdn.example.com/games.json'))
          .toString(),
      'https://cdn.example.com/chess/',
    );
  });

  test('rejects duplicate and unsafe catalog entries', () {
    final chess = (_catalog()['games']! as List).single;
    expect(
      () => GamesCatalog.fromJson(_catalog(games: [chess, chess])),
      throwsFormatException,
    );
    expect(
      () => GamesCatalog.fromJson(
        _catalog(
          games: [
            {
              ...chess as Map<String, Object?>,
              'webPath': 'javascript:alert(1)',
            },
          ],
        ),
      ),
      throwsFormatException,
    );
  });

  test('fetches a catalog with an injected HTTP client', () async {
    final client = MockClient((request) async {
      expect(request.headers['accept'], 'application/json');
      return http.Response.bytes(
        utf8.encode(jsonEncode(_catalog())),
        200,
        headers: const {'content-type': 'application/json; charset=utf-8'},
      );
    });
    final catalog = await fetchGamesCatalog(
      'https://cdn.example.com/games.json',
      client: client,
    );
    expect(catalog.games.single.name, 'Chess');
  });
}
