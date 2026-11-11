import 'package:flutter_test/flutter_test.dart';
import 'package:moongames_host/moongames_host.dart';

Map<String, dynamic> descriptorJson({
  String version = '0.2.0',
  int minHostProtocol = 1,
  String entry = 'index.html',
}) {
  return {
    'format': 1,
    'gameId': 'chess',
    'gameName': 'Chess',
    'version': version,
    'sdkVersion': '0.1.0',
    'minHostProtocol': minHostProtocol,
    'entry': entry,
    'capabilities': ['local'],
    'publishedAt': '2026-01-02T03:04:05.000Z',
    'sha256': List.filled(64, 'a').join(),
    'size': 123,
    'url': 'chess/$version/chess-$version.zip',
    'keyId': 'test-1',
    'publicKey': '${List.filled(43, 'A').join()}=',
    'signature': '${List.filled(86, 'A').join()}==',
  };
}

void main() {
  test('keeps the signed payload stable across host implementations', () {
    final descriptor = BundleDescriptor.fromJson(descriptorJson());
    expect(
      descriptor.signingPayload(),
      [
        'moongames-bundle-v1',
        '1',
        'chess',
        '0.2.0',
        '0.1.0',
        '1',
        'index.html',
        List.filled(64, 'a').join(),
        '123',
        'test-1',
      ].join('\n'),
    );
  });

  test('selects the newest compatible bundle', () {
    final manifest = ReleaseManifest.fromJson({
      'format': 1,
      'generatedAt': '2026-01-02T03:04:05.000Z',
      'signers': {
        'test-1': {
          'algorithm': 'ed25519',
          'publicKey': '${List.filled(43, 'A').join()}=',
        },
      },
      'bundles': [
        descriptorJson(version: '0.1.0'),
        descriptorJson(version: '0.3.0'),
        descriptorJson(version: '0.4.0', minHostProtocol: 2),
      ],
    });
    expect(manifest.latestFor('chess', 1)?.version, '0.3.0');
    expect(manifest.latestFor('chess', 2)?.version, '0.4.0');
    expect(manifest.latestFor('checkers', 1), isNull);
  });

  test('compares stable and prerelease semver values', () {
    expect(compareSemver('1.0.0', '1.0.0-beta'), greaterThan(0));
    expect(compareSemver('1.0.0-beta.2', '1.0.0-beta.10'), lessThan(0));
  });

  test('rejects unsafe entry paths and malformed manifests', () {
    expect(
      () => BundleDescriptor.fromJson(descriptorJson(entry: '../index.html')),
      throwsFormatException,
    );
    expect(
      () => ReleaseManifest.fromJson({
        'format': 2,
        'generatedAt': '2026-01-02T03:04:05.000Z',
        'signers': <String, dynamic>{},
        'bundles': <dynamic>[],
      }),
      throwsFormatException,
    );
  });
}
