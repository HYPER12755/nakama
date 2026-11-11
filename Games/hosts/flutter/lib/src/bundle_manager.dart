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

enum BundleSource { remote, cache, bundled }

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

class BundleManager {
  BundleManager({
    required this.gameId,
    required this.hostProtocol,
    required this.trustedKeys,
    this.manifestUrl,
    this.bundledDescriptorAsset,
    this.bundledZipAsset,
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
  final void Function(String message)? onLog;
  final http.Client _client;
  final Directory? _supportDirectory;

  Directory? _cacheRoot;
  final bool _ownsClient;

  Future<BundleLaunch> resolve() async {
    final root = await _ensureCacheRoot();

    try {
      final remote = await _resolveRemote(root);
      if (remote != null) {
        return remote;
      }
    } catch (cause) {
      onLog?.call('Remote bundle unavailable: $cause');
    }

    final installed = await _loadInstalled(root);
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

  File _metadataFile(Directory root) {
    return File(p.join(root.path, gameId, 'installed.json'));
  }

  Future<BundleLaunch?> _resolveRemote(Directory root) async {
    final url = manifestUrl;
    if (url == null || url.isEmpty) {
      return null;
    }
    final manifestUri = Uri.parse(url);
    onLog?.call('Fetching release manifest $manifestUri');
    final response = await _client
        .get(manifestUri, headers: const {'Accept': 'application/json'})
        .timeout(const Duration(seconds: 12));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw HttpException(
        'Release manifest request failed: HTTP ${response.statusCode}.',
        uri: manifestUri,
      );
    }

    final manifest = ReleaseManifest.fromJson(
      jsonDecode(utf8.decode(response.bodyBytes)),
    );
    final descriptor = manifest.latestFor(gameId, hostProtocol);
    if (descriptor == null) {
      throw StateError(
        'No compatible $gameId bundle is available for host protocol $hostProtocol.',
      );
    }
    _verifyPinnedKey(descriptor);
    await _verifyDescriptorSignature(descriptor);

    final installed = await _loadInstalled(root);
    if (installed != null &&
        compareSemver(installed.descriptor.version, descriptor.version) > 0) {
      onLog?.call(
        'Keeping installed ${installed.descriptor.version}; the remote manifest offers an older signed build.',
      );
      return installed;
    }

    final directory = _bundleDirectory(root, descriptor);
    if (await _hasEntry(directory, descriptor)) {
      return BundleLaunch(
        descriptor: descriptor,
        directory: directory,
        source: BundleSource.cache,
      );
    }

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
    await _rememberInstalled(root, descriptor, directory, BundleSource.remote);
    return BundleLaunch(
      descriptor: descriptor,
      directory: directory,
      source: BundleSource.remote,
    );
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
      final descriptorValue = value['descriptor'];
      final descriptor = BundleDescriptor.fromJson(descriptorValue);
      if (descriptor.gameId != gameId) {
        return null;
      }
      _verifyPinnedKey(descriptor);
      await _verifyDescriptorSignature(descriptor);
      // Derive the location instead of trusting a path from metadata. The
      // descriptor is signed and the directory name includes its hash.
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
      throw StateError('Unsafe ZIP entry: $name');
    }
    final destination = File(p.normalize(p.join(root.path, name)));
    if (!p.isWithin(root.path, destination.path)) {
      throw StateError('Unsafe ZIP entry: $name');
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
  }
}
