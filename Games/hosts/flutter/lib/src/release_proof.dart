import 'dart:convert';

import 'package:cryptography/cryptography.dart';
import 'package:http/http.dart' as http;

import 'bundle_descriptor.dart';
import 'games_catalog.dart';
import 'host_models.dart';

/// One release that matched both the public catalog and the signed manifest.
class VerifiedCatalogRelease {
  const VerifiedCatalogRelease({
    required this.gameId,
    required this.version,
    required this.descriptor,
    required this.verifiedAt,
  });

  final String gameId;
  final String version;
  final BundleDescriptor descriptor;
  final DateTime verifiedAt;

  MoonGamesReleaseIdentity toIdentity() {
    return MoonGamesReleaseIdentity(
      version: version,
      sha256: descriptor.sha256,
      keyId: descriptor.keyId,
    );
  }
}

/// The result of checking every available game in the catalog.
class VerifiedCatalogRegistry {
  const VerifiedCatalogRegistry({
    required this.manifestUrl,
    required this.games,
    required this.errors,
    required this.error,
  });

  final String manifestUrl;
  final Map<String, VerifiedCatalogRelease> games;
  final Map<String, String> errors;

  /// Set when the manifest itself could not be fetched or parsed.
  final String? error;
}

/// Verifies one catalog release against the signed manifest and pinned keys.
///
/// The catalog is presentation data. This is the gate that allows a verified
/// game to receive the launcher account.
Future<VerifiedCatalogRelease> verifyCatalogRelease(
  GameCatalogEntry entry,
  ReleaseManifest manifest,
  Map<String, String> trustedKeys, {
  int hostProtocol = 1,
}) async {
  if (!entry.isAvailable) {
    throw StateError('The game is not available.');
  }
  final release = entry.release;
  if (release == null) {
    throw StateError('The catalog has no signed release for this game.');
  }
  if (entry.version != null && entry.version != release.version) {
    throw StateError('The catalog version does not match its signed release.');
  }
  if (release.minHostProtocol > hostProtocol) {
    throw StateError('This release needs a newer MoonGames host.');
  }

  BundleDescriptor? descriptor;
  for (final bundle in manifest.bundles) {
    if (bundle.gameId == entry.id && bundle.version == release.version) {
      descriptor = bundle;
      break;
    }
  }
  if (descriptor == null) {
    throw StateError(
      'Release ${release.version} is missing from the signed manifest.',
    );
  }
  if (descriptor.sha256 != release.sha256 ||
      descriptor.size != release.size ||
      descriptor.keyId != release.keyId ||
      descriptor.minHostProtocol != release.minHostProtocol) {
    throw StateError(
      'The catalog release does not match the signed descriptor.',
    );
  }
  if (descriptor.minHostProtocol > hostProtocol) {
    throw StateError('This release needs a newer MoonGames host.');
  }

  final pinned = trustedKeys[descriptor.keyId];
  if (pinned == null) {
    throw StateError(
      'No trusted public key is configured for ${descriptor.keyId}.',
    );
  }
  if (pinned != descriptor.publicKey) {
    throw StateError(
      'The descriptor public key does not match the pinned key '
      '${descriptor.keyId}.',
    );
  }
  final signer = manifest.signers[descriptor.keyId];
  if (signer == null || signer.publicKey != pinned) {
    throw StateError(
      'The release manifest does not declare the pinned key '
      '${descriptor.keyId}.',
    );
  }
  await _verifyDescriptorSignature(descriptor);

  return VerifiedCatalogRelease(
    gameId: entry.id,
    version: descriptor.version,
    descriptor: descriptor,
    verifiedAt: DateTime.now().toUtc(),
  );
}

/// Loads the signed manifest and verifies every available catalog entry.
///
/// A single bad game is isolated in [VerifiedCatalogRegistry.errors] so the
/// rest of the library still opens independently.
Future<VerifiedCatalogRegistry> fetchVerifiedCatalog(
  GamesCatalog catalog,
  String manifestUrl, {
  required Map<String, String> trustedKeys,
  http.Client? client,
  Duration timeout = const Duration(seconds: 12),
  int hostProtocol = 1,
}) async {
  final requestClient = client ?? http.Client();
  final games = <String, VerifiedCatalogRelease>{};
  final errors = <String, String>{};
  try {
    final response = await requestClient
        .get(
          Uri.parse(manifestUrl),
          headers: const {'accept': 'application/json'},
        )
        .timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw StateError(
        'Release manifest request failed with HTTP ${response.statusCode}.',
      );
    }
    final decoded = jsonDecode(utf8.decode(response.bodyBytes));
    final manifest = ReleaseManifest.fromJson(decoded);
    await Future.wait(
      catalog.availableGames().map((entry) async {
        try {
          final record = await verifyCatalogRelease(
            entry,
            manifest,
            trustedKeys,
            hostProtocol: hostProtocol,
          );
          games[entry.id] = record;
        } catch (cause) {
          errors[entry.id] = _causeMessage(
            cause,
            'The release could not be verified.',
          );
        }
      }),
    );
    return VerifiedCatalogRegistry(
      manifestUrl: manifestUrl,
      games: Map.unmodifiable(games),
      errors: Map.unmodifiable(errors),
      error: null,
    );
  } catch (cause) {
    return VerifiedCatalogRegistry(
      manifestUrl: manifestUrl,
      games: const {},
      errors: const {},
      error: _causeMessage(
        cause,
        'The signed release manifest could not be loaded.',
      ),
    );
  } finally {
    if (client == null) {
      requestClient.close();
    }
  }
}

String _causeMessage(Object cause, String fallback) {
  var message = cause.toString().trim();
  for (final prefix in const [
    'Bad state: ',
    'Exception: ',
    'FormatException: ',
  ]) {
    if (message.startsWith(prefix)) {
      message = message.substring(prefix.length).trim();
      break;
    }
  }
  return message.isEmpty ? fallback : message;
}

Future<void> _verifyDescriptorSignature(BundleDescriptor descriptor) async {
  final publicKey = base64.decode(descriptor.publicKey);
  final signature = base64.decode(descriptor.signature);
  if (publicKey.length != 32) {
    throw StateError('The Ed25519 public key must be 32 bytes.');
  }
  if (signature.length != 64) {
    throw StateError('The Ed25519 signature must be 64 bytes.');
  }
  final algorithm = Ed25519();
  final valid = await algorithm.verify(
    utf8.encode(descriptor.signingPayload()),
    signature: Signature(
      signature,
      publicKey: SimplePublicKey(publicKey, type: KeyPairType.ed25519),
    ),
  );
  if (!valid) {
    throw StateError('The release signature is invalid.');
  }
}
