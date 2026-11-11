import 'dart:convert';

const int gameBundleFormat = 1;
const int releaseManifestFormat = 1;
const String bundleSigningPrefix = 'moongames-bundle-v1';

final RegExp _hexSha256 = RegExp(r'^[a-f0-9]{64}$');
final RegExp _gameId = RegExp(r'^[a-z0-9][a-z0-9-]*$');
final RegExp _semver = RegExp(r'^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$');

String _requireString(Object? value, String field) {
  if (value is! String ||
      value.isEmpty ||
      value.contains('\n') ||
      value.contains('\r')) {
    throw FormatException('$field must be a non-empty single-line string.');
  }
  return value;
}

String _requireEntry(Object? value) {
  final entry = _requireString(value, 'entry');
  if (entry.startsWith('/') ||
      entry.contains('\\') ||
      entry.split('/').any((part) => part.isEmpty || part == '..')) {
    throw const FormatException('entry must be a safe relative path.');
  }
  return entry;
}

class BundleDescriptor {
  const BundleDescriptor({
    required this.format,
    required this.gameId,
    required this.gameName,
    required this.version,
    required this.sdkVersion,
    required this.minHostProtocol,
    required this.entry,
    required this.capabilities,
    required this.publishedAt,
    required this.sha256,
    required this.size,
    required this.url,
    required this.keyId,
    required this.publicKey,
    required this.signature,
  });

  final int format;
  final String gameId;
  final String gameName;
  final String version;
  final String sdkVersion;
  final int minHostProtocol;
  final String entry;
  final List<String> capabilities;
  final String publishedAt;
  final String sha256;
  final int size;
  final String url;
  final String keyId;
  final String publicKey;
  final String signature;

  factory BundleDescriptor.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('The bundle descriptor must be an object.');
    }
    if (value['format'] != gameBundleFormat) {
      throw const FormatException('Unsupported game bundle format.');
    }
    final gameId = _requireString(value['gameId'], 'gameId');
    if (!_gameId.hasMatch(gameId)) {
      throw const FormatException(
        'gameId must use lowercase letters, digits, and dashes.',
      );
    }
    final version = _requireString(value['version'], 'version');
    if (!_semver.hasMatch(version)) {
      throw const FormatException('version must be a semver string.');
    }
    final minHostProtocol = value['minHostProtocol'];
    if (minHostProtocol is! int || minHostProtocol < 1) {
      throw const FormatException(
        'minHostProtocol must be a positive integer.',
      );
    }
    final sha256 = _requireString(value['sha256'], 'sha256');
    if (!_hexSha256.hasMatch(sha256)) {
      throw const FormatException(
        'sha256 must be 64 lowercase hexadecimal characters.',
      );
    }
    final size = value['size'];
    if (size is! int || size < 0) {
      throw const FormatException('size must be a non-negative integer.');
    }
    final capabilitiesValue = value['capabilities'];
    if (capabilitiesValue is! List) {
      throw const FormatException('capabilities must be an array.');
    }
    final capabilities = capabilitiesValue
        .map((capability) => _requireString(capability, 'capabilities[]'))
        .toList(growable: false);

    return BundleDescriptor(
      format: gameBundleFormat,
      gameId: gameId,
      gameName: _requireString(value['gameName'], 'gameName'),
      version: version,
      sdkVersion: _requireString(value['sdkVersion'], 'sdkVersion'),
      minHostProtocol: minHostProtocol,
      entry: _requireEntry(value['entry']),
      capabilities: capabilities,
      publishedAt: _requireString(value['publishedAt'], 'publishedAt'),
      sha256: sha256,
      size: size,
      url: _requireString(value['url'], 'url'),
      keyId: _requireString(value['keyId'], 'keyId'),
      publicKey: _requireString(value['publicKey'], 'publicKey'),
      signature: _requireString(value['signature'], 'signature'),
    );
  }

  factory BundleDescriptor.fromJsonString(String value) {
    return BundleDescriptor.fromJson(jsonDecode(value));
  }

  Map<String, dynamic> toJson() {
    return {
      'format': format,
      'gameId': gameId,
      'gameName': gameName,
      'version': version,
      'sdkVersion': sdkVersion,
      'minHostProtocol': minHostProtocol,
      'entry': entry,
      'capabilities': capabilities,
      'publishedAt': publishedAt,
      'sha256': sha256,
      'size': size,
      'url': url,
      'keyId': keyId,
      'publicKey': publicKey,
      'signature': signature,
    };
  }

  String signingPayload() {
    return [
      bundleSigningPrefix,
      '$format',
      gameId,
      version,
      sdkVersion,
      '$minHostProtocol',
      entry,
      sha256,
      '$size',
      keyId,
    ].join('\n');
  }

  Uri resolveUrl(Uri manifestUrl) => manifestUrl.resolve(url);
}

class BundleSigner {
  const BundleSigner({required this.algorithm, required this.publicKey});

  final String algorithm;
  final String publicKey;

  factory BundleSigner.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('A signer must be an object.');
    }
    final algorithm = _requireString(value['algorithm'], 'signer.algorithm');
    if (algorithm != 'ed25519') {
      throw FormatException('Unsupported signing algorithm: $algorithm.');
    }
    return BundleSigner(
      algorithm: algorithm,
      publicKey: _requireString(value['publicKey'], 'signer.publicKey'),
    );
  }

  Map<String, dynamic> toJson() => {
    'algorithm': algorithm,
    'publicKey': publicKey,
  };
}

class ReleaseManifest {
  const ReleaseManifest({
    required this.format,
    required this.generatedAt,
    required this.signers,
    required this.bundles,
  });

  final int format;
  final String generatedAt;
  final Map<String, BundleSigner> signers;
  final List<BundleDescriptor> bundles;

  factory ReleaseManifest.fromJson(Object? value) {
    if (value is! Map<String, dynamic>) {
      throw const FormatException('The release manifest must be an object.');
    }
    if (value['format'] != releaseManifestFormat) {
      throw const FormatException('Unsupported release manifest format.');
    }
    final signersValue = value['signers'];
    if (signersValue is! Map<String, dynamic>) {
      throw const FormatException('signers must be an object.');
    }
    final signers = <String, BundleSigner>{};
    for (final entry in signersValue.entries) {
      signers[entry.key] = BundleSigner.fromJson(entry.value);
    }
    final bundlesValue = value['bundles'];
    if (bundlesValue is! List) {
      throw const FormatException('bundles must be an array.');
    }
    return ReleaseManifest(
      format: releaseManifestFormat,
      generatedAt: _requireString(value['generatedAt'], 'generatedAt'),
      signers: signers,
      bundles: bundlesValue
          .map(BundleDescriptor.fromJson)
          .toList(growable: false),
    );
  }

  factory ReleaseManifest.fromJsonString(String value) {
    return ReleaseManifest.fromJson(jsonDecode(value));
  }

  Map<String, dynamic> toJson() {
    return {
      'format': format,
      'generatedAt': generatedAt,
      'signers': signers.map((key, value) => MapEntry(key, value.toJson())),
      'bundles': bundles.map((bundle) => bundle.toJson()).toList(),
    };
  }

  BundleDescriptor? latestFor(String gameId, int hostProtocol) {
    final candidates =
        bundles
            .where(
              (bundle) =>
                  bundle.gameId == gameId &&
                  bundle.minHostProtocol <= hostProtocol,
            )
            .toList()
          ..sort((left, right) => compareSemver(right.version, left.version));
    return candidates.isEmpty ? null : candidates.first;
  }
}

int compareSemver(String left, String right) {
  ({List<int> core, List<String> prerelease}) parse(String value) {
    final withoutBuild = value.split('+').first;
    final separator = withoutBuild.indexOf('-');
    final coreValue = separator == -1
        ? withoutBuild
        : withoutBuild.substring(0, separator);
    final prerelease = separator == -1
        ? const <String>[]
        : withoutBuild.substring(separator + 1).split('.');
    return (
      core: coreValue
          .split('.')
          .map((part) => int.parse(part))
          .toList(growable: false),
      prerelease: prerelease,
    );
  }

  final a = parse(left);
  final b = parse(right);
  for (var index = 0; index < 3; index += 1) {
    final difference = a.core[index] - b.core[index];
    if (difference != 0) {
      return difference;
    }
  }
  if (a.prerelease.isEmpty && b.prerelease.isEmpty) {
    return 0;
  }
  if (a.prerelease.isEmpty) {
    return 1;
  }
  if (b.prerelease.isEmpty) {
    return -1;
  }

  final length = a.prerelease.length > b.prerelease.length
      ? a.prerelease.length
      : b.prerelease.length;
  for (var index = 0; index < length; index += 1) {
    if (index >= a.prerelease.length) {
      return -1;
    }
    if (index >= b.prerelease.length) {
      return 1;
    }
    final leftPart = a.prerelease[index];
    final rightPart = b.prerelease[index];
    if (leftPart == rightPart) {
      continue;
    }
    final leftNumeric = RegExp(r'^\d+$').hasMatch(leftPart);
    final rightNumeric = RegExp(r'^\d+$').hasMatch(rightPart);
    if (leftNumeric && rightNumeric) {
      return int.parse(leftPart) - int.parse(rightPart);
    }
    if (leftNumeric) {
      return -1;
    }
    if (rightNumeric) {
      return 1;
    }
    return leftPart.compareTo(rightPart);
  }
  return 0;
}
