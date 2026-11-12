import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:moongames_host/moongames_host.dart';

const _publicKey = 'yBxRYs6iBo79VGJX3V2lcyShDL9GuhEG/m3V72RaHIs=';
const _signature =
    '2NP18KpZl+b4i5VmKxj134Gn59/XUREsPjx1b6lY6bVy5uuQ0ySPc05K3UrrC++DULg4U1i0oxYFGkwc0ZHwCg==';
const _sha256 =
    '281b794297e43c10f1d45658f1eb776f8e34801a7e7f714d3a31aea8f6da4724';
const _trustedKeys = {'dev-1': _publicKey};

Map<String, dynamic> _descriptorJson({
  String gameId = 'chess',
  String version = '0.6.0',
  String sha256 = _sha256,
  String signature = _signature,
}) {
  return {
    'format': 1,
    'gameId': gameId,
    'gameName': gameId,
    'version': version,
    'sdkVersion': '0.1.0',
    'minHostProtocol': 1,
    'entry': 'index.html',
    'capabilities': ['local'],
    'publishedAt': '2026-11-11T19:02:17.293Z',
    'sha256': sha256,
    'size': 134254,
    'url': '$gameId/$version/$gameId-$version.zip',
    'keyId': 'dev-1',
    'publicKey': _publicKey,
    'signature': signature,
  };
}

Map<String, dynamic> _manifestJson({String signature = _signature}) {
  return {
    'format': 1,
    'generatedAt': '2026-11-11T19:02:17.293Z',
    'signers': {
      'dev-1': {'algorithm': 'ed25519', 'publicKey': _publicKey},
    },
    'bundles': [_descriptorJson(signature: signature)],
  };
}

Map<String, dynamic> _catalogEntryJson({
  String id = 'chess',
  String? catalogVersion = '0.6.0',
  String releaseSha = _sha256,
  String? releaseVersion = '0.6.0',
}) {
  return {
    'id': id,
    'name': id,
    'tagline': 'Signed game.',
    'description': 'A signed MoonGames release.',
    'status': 'available',
    if (catalogVersion != null) 'version': catalogVersion,
    'minPlayers': 1,
    'maxPlayers': 2,
    'capabilities': ['local'],
    'orientation': 'any',
    'tags': ['test'],
    'accent': '#e5b85c',
    'icon': 'chess',
    'featured': false,
    'sortOrder': 10,
    'release': {
      'version': releaseVersion,
      'minHostProtocol': 1,
      'publishedAt': '2026-11-11T19:02:17.293Z',
      'sha256': releaseSha,
      'size': 134254,
      'keyId': 'dev-1',
    },
  };
}

Map<String, dynamic> _catalogJson(List<Map<String, dynamic>> games) {
  return {
    'format': 1,
    'generatedAt': '2026-11-11T19:02:17.293Z',
    'games': games,
  };
}

void main() {
  test('verifies a signed catalog release and returns its identity', () async {
    final catalog = GamesCatalog.fromJson(
      _catalogJson([_catalogEntryJson()]),
    );
    final manifest = ReleaseManifest.fromJson(_manifestJson());

    final record = await verifyCatalogRelease(
      catalog.findGame('chess')!,
      manifest,
      _trustedKeys,
    );

    expect(record.version, '0.6.0');
    expect(record.descriptor.sha256, _sha256);
    expect(record.toIdentity().keyId, 'dev-1');
    expect(record.toIdentity().sha256, _sha256);
  });

  test('rejects mismatched catalog versions and descriptor fields', () async {
    final manifest = ReleaseManifest.fromJson(_manifestJson());
    final versionMismatch = GamesCatalog.fromJson(
      _catalogJson([
        _catalogEntryJson(catalogVersion: '0.5.0'),
      ]),
    );
    final digestMismatch = GamesCatalog.fromJson(
      _catalogJson([
        _catalogEntryJson(releaseSha: 'b' * 64),
      ]),
    );

    await expectLater(
      verifyCatalogRelease(
        versionMismatch.findGame('chess')!,
        manifest,
        _trustedKeys,
      ),
      throwsStateError,
    );
    await expectLater(
      verifyCatalogRelease(
        digestMismatch.findGame('chess')!,
        manifest,
        _trustedKeys,
      ),
      throwsStateError,
    );
  });

  test('rejects untrusted keys and invalid signatures', () async {
    final catalog = GamesCatalog.fromJson(_catalogJson([_catalogEntryJson()]));
    final manifest = ReleaseManifest.fromJson(_manifestJson());

    await expectLater(
      verifyCatalogRelease(catalog.findGame('chess')!, manifest, const {}),
      throwsStateError,
    );

    final badSignature = ReleaseManifest.fromJson(
      _manifestJson(signature: base64.encode(List.filled(64, 0))),
    );
    await expectLater(
      verifyCatalogRelease(
        catalog.findGame('chess')!,
        badSignature,
        _trustedKeys,
      ),
      throwsStateError,
    );
  });

  test('verifies the catalog and isolates per-game failures', () async {
    final catalog = GamesCatalog.fromJson(
      _catalogJson([
        _catalogEntryJson(),
        _catalogEntryJson(id: 'cards', releaseSha: 'b' * 64),
      ]),
    );
    final client = MockClient((request) async {
      expect(request.headers['accept'], 'application/json');
      return http.Response.bytes(
        utf8.encode(jsonEncode(_manifestJson())),
        200,
        headers: const {'content-type': 'application/json; charset=utf-8'},
      );
    });

    final registry = await fetchVerifiedCatalog(
      catalog,
      'https://cdn.example.com/release-manifest.json',
      trustedKeys: _trustedKeys,
      client: client,
    );

    expect(registry.error, isNull);
    expect(registry.games.keys, ['chess']);
    expect(registry.errors.keys, ['cards']);
  });

  test('reports a manifest-level failure without hiding the catalog', () async {
    final catalog = GamesCatalog.fromJson(_catalogJson([_catalogEntryJson()]));
    final client = MockClient((request) async => http.Response('nope', 503));

    final registry = await fetchVerifiedCatalog(
      catalog,
      'https://cdn.example.com/release-manifest.json',
      trustedKeys: _trustedKeys,
      client: client,
    );

    expect(registry.games, isEmpty);
    expect(registry.errors, isEmpty);
    expect(registry.error, contains('HTTP 503'));
  });
}
