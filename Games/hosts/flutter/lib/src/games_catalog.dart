import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

const int gamesCatalogFormat = 1;

final RegExp _gameId = RegExp(r'^[a-z0-9][a-z0-9-]*$');
final RegExp _semver = RegExp(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$');
final RegExp _hexSha256 = RegExp(r'^[a-f0-9]{64}$');
final RegExp _hexColor = RegExp(r'^#[0-9a-fA-F]{6}$');
const Set<String> _capabilities = {
  'local',
  'online',
  'private-match',
  'ai',
  'spectators',
  'invite-links',
  'replay',
};
const Set<String> _orientations = {'portrait', 'landscape', 'any'};

enum GameAvailability {
  available('available'),
  comingSoon('coming-soon'),
  hidden('hidden');

  const GameAvailability(this.wireName);

  final String wireName;

  static GameAvailability fromJson(Object? value) {
    for (final status in values) {
      if (status.wireName == value) {
        return status;
      }
    }
    throw const FormatException('status is invalid.');
  }
}

String _requireText(Object? value, String field) {
  if (value is! String || value.trim().isEmpty) {
    throw FormatException('$field must be a non-empty string.');
  }
  return value;
}

String _requireLine(Object? value, String field) {
  final text = _requireText(value, field);
  if (text.contains('\n') || text.contains('\r')) {
    throw FormatException('$field must be a single-line string.');
  }
  return text;
}

int _requireInt(Object? value, String field, {int minimum = 1}) {
  if (value is! int || value < minimum) {
    throw FormatException('$field must be an integer >= $minimum.');
  }
  return value;
}

String _requirePath(Object? value, String field) {
  final path = _requireLine(value, field);
  if (path.startsWith('http://') || path.startsWith('https://')) {
    final uri = Uri.tryParse(path);
    if (uri == null ||
        (uri.scheme != 'http' && uri.scheme != 'https') ||
        uri.host.isEmpty) {
      throw FormatException('$field must be a valid http(s) URL.');
    }
    return path;
  }
  if (path.startsWith('/') ||
      path.contains(r'\') ||
      path.contains(':') ||
      path.split('/').any((part) => part == '..')) {
    throw FormatException(
      '$field must be a safe relative path or http(s) URL.',
    );
  }
  return path;
}

class GameCatalogRelease {
  const GameCatalogRelease({
    required this.version,
    required this.minHostProtocol,
    required this.publishedAt,
    required this.sha256,
    required this.size,
    required this.keyId,
  });

  final String version;
  final int minHostProtocol;
  final String publishedAt;
  final String sha256;
  final int size;
  final String keyId;

  factory GameCatalogRelease.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('release must be an object.');
    }
    final version = _requireLine(value['version'], 'release.version');
    if (!_semver.hasMatch(version)) {
      throw const FormatException('release.version must be a semver string.');
    }
    final sha256 = _requireLine(value['sha256'], 'release.sha256');
    if (!_hexSha256.hasMatch(sha256)) {
      throw const FormatException(
        'release.sha256 must be 64 lowercase hexadecimal characters.',
      );
    }
    return GameCatalogRelease(
      version: version,
      minHostProtocol: _requireInt(
        value['minHostProtocol'],
        'release.minHostProtocol',
      ),
      publishedAt: _requireLine(value['publishedAt'], 'release.publishedAt'),
      sha256: sha256,
      size: _requireInt(value['size'], 'release.size', minimum: 0),
      keyId: _requireLine(value['keyId'], 'release.keyId'),
    );
  }
}

/// Display metadata for one game from the operator-hosted games catalog.
///
/// This data is advisory. Executable bundles must still be selected from the
/// signed release manifest and verified by the host.
class GameCatalogEntry {
  const GameCatalogEntry({
    required this.id,
    required this.name,
    required this.tagline,
    required this.description,
    required this.status,
    required this.minPlayers,
    required this.maxPlayers,
    required this.capabilities,
    required this.orientation,
    required this.tags,
    required this.accent,
    required this.icon,
    required this.featured,
    required this.sortOrder,
    this.version,
    this.webPath,
    this.cover,
    this.screenshots,
    this.release,
  });

  final String id;
  final String name;
  final String tagline;
  final String description;
  final GameAvailability status;
  final String? version;
  final int minPlayers;
  final int maxPlayers;
  final List<String> capabilities;
  final String orientation;
  final List<String> tags;
  final String accent;
  final String icon;
  final bool featured;
  final double sortOrder;

  /// Relative to the catalog URL, or an absolute http(s) URL.
  final String? webPath;
  final String? cover;
  final List<String>? screenshots;
  final GameCatalogRelease? release;

  bool get isAvailable => status == GameAvailability.available;

  factory GameCatalogEntry.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('Each catalog game must be an object.');
    }
    final id = _requireLine(value['id'], 'id');
    if (!_gameId.hasMatch(id)) {
      throw const FormatException(
        'id must use lowercase letters, digits, and dashes.',
      );
    }
    final versionValue = value['version'];
    final String? version;
    if (versionValue == null) {
      version = null;
    } else {
      version = _requireLine(versionValue, 'version');
      if (!_semver.hasMatch(version)) {
        throw const FormatException('version must be a semver string.');
      }
    }
    final capabilitiesValue = value['capabilities'];
    if (capabilitiesValue is! List) {
      throw const FormatException('capabilities must be an array.');
    }
    final capabilities = capabilitiesValue
        .map((capability) {
          final name = _requireLine(capability, 'capabilities[]');
          if (!_capabilities.contains(name)) {
            throw const FormatException(
              'capabilities contains an unknown value.',
            );
          }
          return name;
        })
        .toList(growable: false);
    final orientation = _requireLine(value['orientation'], 'orientation');
    if (!_orientations.contains(orientation)) {
      throw const FormatException('orientation is invalid.');
    }
    final tagsValue = value['tags'];
    if (tagsValue is! List) {
      throw const FormatException('tags must be an array.');
    }
    final tags = tagsValue
        .map((tag) => _requireLine(tag, 'tags[]'))
        .toList(growable: false);
    final accent = _requireLine(value['accent'], 'accent');
    if (!_hexColor.hasMatch(accent)) {
      throw const FormatException('accent must be a #rrggbb color.');
    }
    final sortOrderValue = value['sortOrder'];
    if (sortOrderValue is! num || !sortOrderValue.isFinite) {
      throw const FormatException('sortOrder must be a finite number.');
    }
    final screenshotsValue = value['screenshots'];
    List<String>? screenshots;
    if (screenshotsValue != null) {
      if (screenshotsValue is! List) {
        throw const FormatException('screenshots must be an array.');
      }
      screenshots = screenshotsValue
          .map((screenshot) => _requirePath(screenshot, 'screenshots[]'))
          .toList(growable: false);
    }
    final minPlayers = _requireInt(value['minPlayers'], 'minPlayers');
    final maxPlayers = _requireInt(value['maxPlayers'], 'maxPlayers');
    if (maxPlayers < minPlayers) {
      throw const FormatException('maxPlayers must be >= minPlayers.');
    }
    final featured = value['featured'];
    if (featured is! bool) {
      throw const FormatException('featured must be a boolean.');
    }
    final releaseValue = value['release'];
    return GameCatalogEntry(
      id: id,
      name: _requireLine(value['name'], 'name'),
      tagline: _requireLine(value['tagline'], 'tagline'),
      description: _requireText(value['description'], 'description'),
      status: GameAvailability.fromJson(value['status']),
      version: version,
      minPlayers: minPlayers,
      maxPlayers: maxPlayers,
      capabilities: capabilities,
      orientation: orientation,
      tags: tags,
      accent: accent,
      icon: _requireLine(value['icon'], 'icon'),
      featured: featured,
      sortOrder: sortOrderValue.toDouble(),
      webPath: value['webPath'] == null
          ? null
          : _requirePath(value['webPath'], 'webPath'),
      cover: value['cover'] == null
          ? null
          : _requirePath(value['cover'], 'cover'),
      screenshots: screenshots,
      release: releaseValue == null
          ? null
          : GameCatalogRelease.fromJson(releaseValue),
    );
  }

  /// Resolves [webPath] against the catalog URL, returning null if this game
  /// has no web entry point or the path is not http(s).
  Uri? resolveWebUrl(Uri catalogUrl) {
    final path = webPath;
    if (path == null) {
      return null;
    }
    final url = catalogUrl.resolve(path);
    return url.scheme == 'http' || url.scheme == 'https' ? url : null;
  }
}

class GamesCatalog {
  const GamesCatalog({
    required this.format,
    required this.generatedAt,
    required this.games,
  });

  final int format;
  final String generatedAt;
  final List<GameCatalogEntry> games;

  factory GamesCatalog.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('The games catalog must be an object.');
    }
    if (value['format'] != gamesCatalogFormat) {
      throw const FormatException('Unsupported games catalog format.');
    }
    final gamesValue = value['games'];
    if (gamesValue is! List) {
      throw const FormatException('games must be an array.');
    }
    final games = <GameCatalogEntry>[];
    final ids = <String>{};
    for (final item in gamesValue) {
      final game = GameCatalogEntry.fromJson(item);
      if (!ids.add(game.id)) {
        throw FormatException('Duplicate catalog game id: ${game.id}.');
      }
      games.add(game);
    }
    return GamesCatalog(
      format: gamesCatalogFormat,
      generatedAt: _requireLine(value['generatedAt'], 'generatedAt'),
      games: games,
    );
  }

  GameCatalogEntry? findGame(String gameId) {
    for (final game in games) {
      if (game.id == gameId) {
        return game;
      }
    }
    return null;
  }

  List<GameCatalogEntry> availableGames() {
    return games.where((game) => game.isAvailable).toList(growable: false);
  }
}

/// Fetches and validates the operator-hosted games catalog.
Future<GamesCatalog> fetchGamesCatalog(
  String url, {
  http.Client? client,
  Duration timeout = const Duration(seconds: 15),
}) async {
  final requestClient = client ?? http.Client();
  try {
    final response = await requestClient
        .get(Uri.parse(url), headers: const {'accept': 'application/json'})
        .timeout(timeout);
    if (response.statusCode != 200) {
      throw FormatException(
        'Games catalog request failed with HTTP ${response.statusCode}.',
      );
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    return GamesCatalog.fromJson(decoded);
  } finally {
    if (client == null) {
      requestClient.close();
    }
  }
}
