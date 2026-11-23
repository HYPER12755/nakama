import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart';
import 'package:flutter/services.dart' show rootBundle;
import 'package:http/http.dart' as http;
import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'bundle_descriptor.dart';

enum BundleSource { remote, delta, cache, bundled }

enum BundleUpdateMode { background, forced, prompt, manual }

class BundleUpdatePolicy {
  const BundleUpdatePolicy({
    this.mode = BundleUpdateMode.background,
    this.checkIntervalMs = 6 * 60 * 60 * 1000,
    this.allowCellular = true,
    this.keepVersions = 2,
  });

  final BundleUpdateMode mode;
  final int checkIntervalMs;
  final bool allowCellular;
  final int keepVersions;
}

class BundleLaunch {
  const BundleLaunch({
    required this.descriptor,
    required this.directory,
    required this.source,
  });

  final BundleDescriptor descriptor;
  final Directory directory;
  final BundleSource source;

  File get entryFile => File(p.join(directory.path, descriptor.entry));
}

class _CachedManifest {
  const _CachedManifest({
    this.etag,
    required this.fetchedAt,
    required this.value,
  });

  final String? etag;
  final int fetchedAt;
  final Object? value;
}

class BundleManager {
  BundleManager({
    required this.gameId,
    required this.hostProtocol,
    required this.trustedKeys,
    this.manifestUrl,
    this.bundledDescriptorAsset,
    this.bundledZipAsset,
    this.updatePolicy = const BundleUpdatePolicy(),
    this.onUpdateAvailable,
    this.onLog,
    http.Client? client,
    Directory? supportDirectory,
  }) : _client = client ?? http.Client(),
       _ownsClient = client == null,
       _supportDirectory = supportDirectory;

  final String gameId;
  final int hostProtocol;
  final Map<String, String> trustedKeys;
  final String? manifestUrl;
  final String? bundledDescriptorAsset;
  final String? bundledZipAsset;
  final BundleUpdatePolicy updatePolicy;
  final void Function(BundleDescriptor descriptor)? onUpdateAvailable;
  final void Function(String message)? onLog;
  final http.Client _client;
  final Directory? _supportDirectory;

  Directory? _cacheRoot;
  final bool _ownsClient;

  Future<BundleLaunch> resolve() async {
    final root = await _ensureCacheRoot();
    final installed = await _loadInstalled(root);

    try {
      final remote = await _resolveRemote(root, installed);
      if (remote != null) {
        return remote;
      }
    } catch (cause) {
      onLog?.call('Remote bundle unavailable: $cause');
    }

    if (installed != null) {
      return installed;
    }

    if (bundledZipAsset != null && bundledDescriptorAsset != null) {
      onLog?.call('Using the app-bundled fallback.');
      return _resolveBundled(root);
    }

    throw StateError('No game bundle is available offline.');
  }

  Future<void> dispose() async {
    if (_ownsClient) {
      _client.close();
    }
  }

  Future<Directory> _ensureCacheRoot() async {
    final existing = _cacheRoot;
    if (existing != null) {
      return existing;
    }
    final support = _supportDirectory ?? await getApplicationSupportDirectory();
    final root = Directory(p.join(support.path, 'moongames_bundles'));
    if (!await root.exists()) {
      await root.create(recursive: true);
    }
    _cacheRoot = root;
    return root;
  }

  Directory _bundleDirectory(Directory root, BundleDescriptor descriptor) {
    return Directory(
      p.join(
        root.path,
        descriptor.gameId,
        '${descriptor.version}-${descriptor.sha256.substring(0, 12)}',
      ),
    );
  }

  Directory _deltaDirectory(Directory root, BundleDescriptor descriptor, String fromVersion) {
    return Directory(
      p.join(
        root.path,
        descriptor.gameId,
        'delta-$fromVersion-${descriptor.version}-${DateTime.now().microsecondsSinceEpoch}',
      ),
    );
  }

  File _metadataFile(Directory root) {
    return File(p.join(root.path, gameId, 'installed.json'));
  }

  File _manifestCacheFile(Directory root) {
    return File(p.join(root.path, gameId, 'release-manifest-cache.json'));
  }

  Future<_CachedManifest?> _readManifestCache(Directory root) async {
    final file = _manifestCacheFile(root);
    if (!await file.exists()) {
      return null;
    }
    try {
      final value = jsonDecode(await file.readAsString());
      if (value is! Map<String, dynamic>) {
        return null;
      }
      final fetchedAt = value['fetchedAt'];
      if (fetchedAt is! int) {
        return null;
      }
      final etag = value['etag'];
      return _CachedManifest(
        etag: etag is String ? etag : null,
        fetchedAt: fetchedAt,
        value: value['value'],
      );
    } catch (_) {
      return null;
    }
  }

  Future<void> _writeManifestCache(Directory root, _CachedManifest cache) async {
    final file = _manifestCacheFile(root);
    await file.parent.create(recursive: true);
    await file.writeAsString(
      jsonEncode({
        'etag': cache.etag,
        'fetchedAt': cache.fetchedAt,
        'value': cache.value,
      }),
      flush: true,
    );
  }

  Future<ReleaseManifest> _parseManifest(Object? value) async {
    final manifest = ReleaseManifest.fromJson(value);
    return manifest;
  }

  Future<BundleLaunch?> _resolveRemote(
    Directory root,
    BundleLaunch? installed,
  ) async {
    final url = manifestUrl;
    if (url == null || url.isEmpty) {
      return null;
    }
    final manifestUri = Uri.parse(url);
    final cache = await _readManifestCache(root);
    final fresh = cache != null &&
        DateTime.now().millisecondsSinceEpoch - cache.fetchedAt <
            updatePolicy.checkIntervalMs;

    Object? manifestValue;
    String? etag;
    if (updatePolicy.mode == BundleUpdateMode.manual) {
      if (cache == null) {
        return null;
      }
      manifestValue = cache.value;
      etag = cache.etag;
    } else if (fresh && updatePolicy.mode != BundleUpdateMode.forced) {
      manifestValue = cache.value;
      etag = cache.etag;
    } else {
      try {
        final response = await _client
            .get(
              manifestUri,
              headers: {
                'Accept': 'application/json',
                if (cache?.etag != null) 'If-None-Match': cache!.etag!,
                'Cache-Control': 'no-cache',
              },
            )
            .timeout(const Duration(seconds: 20));
        if (response.statusCode == 304 && cache != null) {
          manifestValue = cache.value;
          etag = cache.etag;
        } else if (response.statusCode >= 200 && response.statusCode < 300) {
          manifestValue = jsonDecode(utf8.decode(response.bodyBytes));
          etag = response.headers['etag'];
        } else {
          throw HttpException(
            'Release manifest request failed: HTTP ${response.statusCode}.',
            uri: manifestUri,
          );
        }
        await _writeManifestCache(
          root,
          _CachedManifest(
            etag: etag,
            fetchedAt: DateTime.now().millisecondsSinceEpoch,
            value: manifestValue,
          ),
        );
      } catch (cause) {
        if (cache == null) {
          rethrow;
        }
        onLog?.call('Using the cached release manifest.');
        manifestValue = cache.value;
        etag = cache.etag;
      }
    }

    final manifest = await _parseManifest(manifestValue);
    final descriptor = manifest.latestFor(gameId, hostProtocol);
    if (descriptor == null) {
      throw StateError(
        'No compatible $gameId bundle is available for host protocol $hostProtocol.',
      );
    }
    _verifyPinnedKey(descriptor);
    await _verifyDescriptorSignature(descriptor);

    if (installed != null &&
        compareSemver(installed.descriptor.version, descriptor.version) > 0) {
      onLog?.call(
        'Keeping installed ${installed.descriptor.version}; the remote manifest offers an older signed build.',
      );
      return installed;
    }

    final upToDate = installed != null &&
        installed.descriptor.version == descriptor.version &&
        installed.descriptor.sha256 == descriptor.sha256;
    if (upToDate) {
      return installed;
    }

    if (installed != null &&
        (updatePolicy.mode == BundleUpdateMode.prompt ||
            updatePolicy.mode == BundleUpdateMode.manual)) {
      onUpdateAvailable?.call(descriptor);
      return installed;
    }

    if (installed != null) {
      try {
        return await _installDelta(root, installed.descriptor, descriptor, manifestUri);
      } catch (cause) {
        onLog?.call('Delta unavailable: $cause');
      }
    }

    try {
      return await _downloadAndInstall(root, descriptor, manifestUri);
    } catch (cause) {
      if (updatePolicy.mode == BundleUpdateMode.forced) {
        rethrow;
      }
      onLog?.call('Update failed: $cause');
      if (installed != null) {
        return installed;
      }
      rethrow;
    }
  }

  Uri _deltaUrlFor(
    BundleDescriptor descriptor,
    Uri manifestUri,
    String fromVersion,
  ) {
    final bundleUri = manifestUri.resolve(descriptor.url);
    final segments = List<String>.from(bundleUri.pathSegments)
      ..removeLast()
      ..addAll([
        'deltas',
        '${Uri.encodeComponent(fromVersion)}-${Uri.encodeComponent(descriptor.version)}',
        'delta.json',
      ]);
    return bundleUri.replace(pathSegments: segments);
  }

  Future<BundleLaunch> _installDelta(
    Directory root,
    BundleDescriptor installed,
    BundleDescriptor descriptor,
    Uri manifestUri,
  ) async {
    final deltaUri = _deltaUrlFor(descriptor, manifestUri, installed.version);
    final response = await _client
        .get(deltaUri, headers: const {'Accept': 'application/json'})
        .timeout(const Duration(seconds: 20));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException('Delta request failed: HTTP ${response.statusCode}.', uri: deltaUri);
    }
    final delta = BundleDelta.fromJson(jsonDecode(utf8.decode(response.bodyBytes)));
    await _verifyDelta(delta);
    if (delta.gameId != descriptor.gameId ||
        delta.baseVersion != installed.version ||
        delta.baseSha256 != installed.sha256 ||
        delta.targetVersion != descriptor.version ||
        delta.targetSha256 != descriptor.sha256) {
      throw StateError('The delta does not match the installed or target release.');
    }

    final target = _bundleDirectory(root, descriptor);
    final scratch = _deltaDirectory(root, descriptor, installed.version);
    if (await scratch.exists()) {
      await scratch.delete(recursive: true);
    }
    await scratch.create(recursive: true);
    try {
      await _copyDirectory(_bundleDirectory(root, installed), scratch);
      for (final file in delta.files) {
        final objectUri = deltaUri.resolve(file.url);
        final download = await _client
            .get(objectUri)
            .timeout(const Duration(seconds: 60));
        if (download.statusCode < 200 || download.statusCode >= 300) {
          throw HttpException(
            'Delta file request failed: HTTP ${download.statusCode}.',
            uri: objectUri,
          );
        }
        final bytes = download.bodyBytes;
        if (bytes.length != file.size) {
          throw StateError('Delta file ${file.path} has the wrong size.');
        }
        if (sha256.convert(bytes).toString() != file.sha256) {
          throw StateError('Delta file ${file.path} has the wrong hash.');
        }
        final destination = _safeDestination(scratch, file.path);
        await destination.parent.create(recursive: true);
        await destination.writeAsBytes(bytes, flush: true);
      }
      for (final relative in delta.removed) {
        final file = _safeDestination(scratch, relative);
        if (await file.exists()) {
          await file.delete();
        }
      }
      if (!await _hasEntry(scratch, descriptor)) {
        throw StateError('The delta bundle entry ${descriptor.entry} is missing.');
      }
      if (await target.exists()) {
        await target.delete(recursive: true);
      }
      await scratch.rename(target.path);
      await _rememberInstalled(root, descriptor, target, BundleSource.delta);
      return BundleLaunch(
        descriptor: descriptor,
        directory: target,
        source: BundleSource.delta,
      );
    } finally {
      if (await scratch.exists()) {
        await scratch.delete(recursive: true);
      }
    }
  }

  Future<void> _verifyDelta(BundleDelta delta) async {
    final pinned = trustedKeys[delta.keyId];
    final key = pinned ?? delta.publicKey;
    if (pinned == null || pinned == delta.publicKey) {
      final publicKey = base64.decode(key);
      final signature = base64.decode(delta.signature);
      if (publicKey.length != 32 || signature.length != 64) {
        throw StateError('The delta key or signature has an invalid length.');
      }
      final valid = await Ed25519().verify(
        utf8.encode(delta.signingPayload()),
        signature: Signature(
          signature,
          publicKey: SimplePublicKey(publicKey, type: KeyPairType.ed25519),
        ),
      );
      if (!valid) {
        throw StateError('The delta signature is invalid.');
      }
      return;
    }
    throw StateError('The delta public key does not match the pinned key.');
  }

  Future<void> _copyDirectory(Directory from, Directory to) async {
    if (!await to.exists()) {
      await to.create(recursive: true);
    }
    for (final entity in from.listSync(recursive: false)) {
      final destination = File(p.join(to.path, p.basename(entity.path)));
      if (entity is Directory) {
        await _copyDirectory(entity, Directory(destination.path));
      } else if (entity is File) {
        await destination.parent.create(recursive: true);
        await entity.copy(destination.path);
      }
    }
  }

  Future<BundleLaunch?> _loadInstalled(Directory root) async {
    final metadata = _metadataFile(root);
    if (!await metadata.exists()) {
      return null;
    }
    try {
      final value = jsonDecode(await metadata.readAsString());
      if (value is! Map<String, dynamic>) {
        return null;
      }
      final descriptor = BundleDescriptor.fromJson(value['descriptor']);
      if (descriptor.gameId != gameId) {
        return null;
      }
      _verifyPinnedKey(descriptor);
      await _verifyDescriptorSignature(descriptor);
      final directory = _bundleDirectory(root, descriptor);
      if (!await _hasEntry(directory, descriptor)) {
        return null;
      }
      return BundleLaunch(
        descriptor: descriptor,
        directory: directory,
        source: BundleSource.cache,
      );
    } catch (cause) {
      onLog?.call('Ignoring cached bundle: $cause');
      return null;
    }
  }

  Future<BundleLaunch> _resolveBundled(Directory root) async {
    final descriptorAsset = bundledDescriptorAsset;
    final zipAsset = bundledZipAsset;
    if (descriptorAsset == null || zipAsset == null) {
      throw StateError('The bundled fallback is not configured.');
    }

    final descriptor = BundleDescriptor.fromJsonString(
      await rootBundle.loadString(descriptorAsset),
    );
    if (descriptor.gameId != gameId) {
      throw StateError('The bundled descriptor is for a different game.');
    }
    _verifyPinnedKey(descriptor);
    await _verifyDescriptorSignature(descriptor);

    final directory = _bundleDirectory(root, descriptor);
    if (!await _hasEntry(directory, descriptor)) {
      final data = await rootBundle.load(zipAsset);
      final bytes = data.buffer.asUint8List(
        data.offsetInBytes,
        data.lengthInBytes,
      );
      await _verifyBundleBytes(descriptor, bytes);
      await _install(root, descriptor, bytes);
    }
    await _rememberInstalled(root, descriptor, directory, BundleSource.bundled);
    return BundleLaunch(
      descriptor: descriptor,
      directory: directory,
      source: BundleSource.bundled,
    );
  }

  Future<BundleLaunch> _downloadAndInstall(
    Directory root,
    BundleDescriptor descriptor,
    Uri manifestUri,
  ) async {
    final downloadUri = descriptor.resolveUrl(manifestUri);
    onLog?.call('Downloading $downloadUri');
    final download = await _client
        .get(downloadUri)
        .timeout(const Duration(seconds: 60));
    if (download.statusCode < 200 || download.statusCode >= 300) {
      throw HttpException(
        'Bundle download failed: HTTP ${download.statusCode}.',
        uri: downloadUri,
      );
    }
    await _verifyBundleBytes(descriptor, download.bodyBytes);
    await _install(root, descriptor, download.bodyBytes);
    final directory = _bundleDirectory(root, descriptor);
    await _rememberInstalled(root, descriptor, directory, BundleSource.remote);
    return BundleLaunch(
      descriptor: descriptor,
      directory: directory,
      source: BundleSource.remote,
    );
  }

  Future<void> _install(
    Directory root,
    BundleDescriptor descriptor,
    Uint8List bytes,
  ) async {
    final target = _bundleDirectory(root, descriptor);
    final parent = target.parent;
    if (!await parent.exists()) {
      await parent.create(recursive: true);
    }
    final temporary = Directory(
      p.join(parent.path, 'extract-${DateTime.now().microsecondsSinceEpoch}'),
    );
    await temporary.create(recursive: true);

    try {
      final archive = ZipDecoder().decodeBytes(bytes, verify: true);
      for (final file in archive) {
        if (!file.isFile) {
          continue;
        }
        final destination = _safeDestination(temporary, file.name);
        await destination.parent.create(recursive: true);
        await destination.writeAsBytes(file.content, flush: true);
      }
      if (!await _hasEntry(temporary, descriptor)) {
        throw StateError('The bundle entry ${descriptor.entry} is missing.');
      }
      if (await target.exists()) {
        await target.delete(recursive: true);
      }
      await temporary.rename(target.path);
    } finally {
      if (await temporary.exists()) {
        await temporary.delete(recursive: true);
      }
    }
  }

  File _safeDestination(Directory root, String name) {
    if (name.startsWith('/') ||
        name.contains('\\') ||
        name.split('/').any((part) => part.isEmpty || part == '..')) {
      throw StateError('Unsafe bundle path: $name');
    }
    final destination = File(p.normalize(p.join(root.path, name)));
    if (!p.isWithin(root.path, destination.path)) {
      throw StateError('Unsafe bundle path: $name');
    }
    return destination;
  }

  Future<bool> _hasEntry(
    Directory directory,
    BundleDescriptor descriptor,
  ) async {
    final entry = File(p.join(directory.path, descriptor.entry));
    return entry.exists();
  }

  void _verifyPinnedKey(BundleDescriptor descriptor) {
    final pinned = trustedKeys[descriptor.keyId];
    if (pinned == null) {
      throw StateError(
        'No trusted public key is configured for ${descriptor.keyId}.',
      );
    }
    if (pinned != descriptor.publicKey) {
      throw StateError(
        'The descriptor public key does not match the pinned key ${descriptor.keyId}.',
      );
    }
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
      throw StateError('The bundle signature is invalid.');
    }
  }

  Future<void> _verifyBundleBytes(
    BundleDescriptor descriptor,
    List<int> bytes,
  ) async {
    if (bytes.length != descriptor.size) {
      throw StateError('The bundle size does not match the descriptor.');
    }
    final digest = sha256.convert(bytes).toString();
    if (digest != descriptor.sha256) {
      throw StateError('The bundle SHA-256 does not match the descriptor.');
    }
    await _verifyDescriptorSignature(descriptor);
  }

  Future<void> _rememberInstalled(
    Directory root,
    BundleDescriptor descriptor,
    Directory directory,
    BundleSource source,
  ) async {
    final metadata = _metadataFile(root);
    await metadata.parent.create(recursive: true);
    await metadata.writeAsString(
      jsonEncode({
        'descriptor': descriptor.toJson(),
        'directory': directory.path,
        'source': source.name,
      }),
      flush: true,
    );
    await _pruneVersions(root, updatePolicy.keepVersions);
  }

  Future<void> _pruneVersions(Directory root, int keep) async {
    final gameRoot = Directory(p.join(root.path, gameId));
    if (!await gameRoot.exists()) {
      return;
    }
    final directories = gameRoot
        .listSync(recursive: false)
        .whereType<Directory>()
        .where(
          (directory) => RegExp(r'^\d+\.\d+\.\d+').hasMatch(p.basename(directory.path)),
        )
        .toList()
      ..sort((left, right) => compareSemver(
        p.basename(right.path).split('-').first,
        p.basename(left.path).split('-').first,
      ));
    for (final directory in directories.skip(keep < 1 ? 1 : keep)) {
      await directory.delete(recursive: true).catchError((_) {});
    }
  }
}
