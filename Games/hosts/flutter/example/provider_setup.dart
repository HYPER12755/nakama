import 'package:flutter/material.dart';
import 'package:moongames_host/moongames_host.dart';

const Map<String, String> trustedKeys = {
  'prod-1': 'REPLACE_WITH_PINNED_ED25519_PUBLIC_KEY',
};

class PartnerUnoScreen extends StatelessWidget {
  const PartnerUnoScreen({super.key, required this.updateController});

  final MoonGamesHostController updateController;

  @override
  Widget build(BuildContext context) {
    return MoonGamesHost(
      gameId: 'uno',
      manifestUrl: 'https://cdn.example.com/moongames/release-manifest.json',
      trustedKeys: trustedKeys,
      hostProtocol: 2,
      updatePolicy: const BundleUpdatePolicy(
        mode: BundleUpdateMode.background,
        checkIntervalMs: 6 * 60 * 60 * 1000,
        keepVersions: 2,
      ),
      controller: updateController,
      onUpdateAvailable: (descriptor) {
        debugPrint('MoonGames update available: ${descriptor.version}');
      },
      onError: (error) {
        debugPrint('MoonGames error: $error');
      },
    );
  }
}
