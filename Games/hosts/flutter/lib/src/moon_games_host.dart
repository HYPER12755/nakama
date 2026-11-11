import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:url_launcher/url_launcher.dart';

import 'bundle_manager.dart';
import 'host_models.dart';
import 'launch_context.dart';

const int _gameProtocolVersion = 1;

class MoonGamesHost extends StatefulWidget {
  const MoonGamesHost({
    super.key,
    required this.gameId,
    required this.trustedKeys,
    this.manifestUrl,
    this.bundledDescriptorAsset,
    this.bundledZipAsset,
    this.hostProtocol = 1,
    this.locale = 'en',
    this.launchQuery,
    this.theme = const MoonGamesTheme(),
    this.session,
    this.nakama,
    this.onReady,
    this.onExit,
    this.onToast,
    this.onSound,
    this.onAnalytics,
    this.onOpenUrl,
    this.onRequestSessionRefresh,
    this.onError,
  });

  final String gameId;
  final Map<String, String> trustedKeys;
  final String? manifestUrl;
  final String? bundledDescriptorAsset;
  final String? bundledZipAsset;
  final int hostProtocol;
  final String locale;

  /// Query from a native deep link, for example `match=abc&spectate=1`.
  final String? launchQuery;
  final MoonGamesTheme theme;
  final MoonGamesSession? session;
  final MoonGamesNakamaConfig? nakama;
  final void Function(BundleLaunch launch)? onReady;
  final void Function(String? reason)? onExit;
  final void Function(String message, String? level)? onToast;
  final void Function(String name)? onSound;
  final void Function(String event, Map<String, dynamic>? properties)?
  onAnalytics;
  final void Function(String url)? onOpenUrl;
  final VoidCallback? onRequestSessionRefresh;
  final void Function(Object error)? onError;

  @override
  State<MoonGamesHost> createState() => _MoonGamesHostState();
}

class _MoonGamesHostState extends State<MoonGamesHost>
    with WidgetsBindingObserver {
  late BundleManager _bundleManager;
  InAppWebViewController? _controller;
  BundleLaunch? _launch;
  Object? _error;
  bool _loading = true;
  bool _ready = false;
  int _loadGeneration = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _bundleManager = _createManager();
    unawaited(_load());
  }

  BundleManager _createManager() {
    return BundleManager(
      gameId: widget.gameId,
      manifestUrl: widget.manifestUrl,
      hostProtocol: widget.hostProtocol,
      trustedKeys: widget.trustedKeys,
      bundledDescriptorAsset: widget.bundledDescriptorAsset,
      bundledZipAsset: widget.bundledZipAsset,
      onLog: (message) => debugPrint('[MoonGames] $message'),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_bundleManager.dispose());
    super.dispose();
  }

  Future<void> _load() async {
    final generation = ++_loadGeneration;
    if (!_loading) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final launch = await _bundleManager.resolve();
      if (!mounted || generation != _loadGeneration) {
        return;
      }
      setState(() {
        _launch = launch;
        _loading = false;
      });
    } catch (cause) {
      if (!mounted || generation != _loadGeneration) {
        return;
      }
      setState(() {
        _error = cause;
        _loading = false;
      });
      widget.onError?.call(cause);
    }
  }

  @override
  void didUpdateWidget(covariant MoonGamesHost oldWidget) {
    super.didUpdateWidget(oldWidget);
    final bundleChanged =
        oldWidget.gameId != widget.gameId ||
        oldWidget.manifestUrl != widget.manifestUrl ||
        oldWidget.hostProtocol != widget.hostProtocol ||
        oldWidget.bundledDescriptorAsset != widget.bundledDescriptorAsset ||
        oldWidget.bundledZipAsset != widget.bundledZipAsset ||
        !_sameKeys(oldWidget.trustedKeys, widget.trustedKeys);
    if (bundleChanged) {
      unawaited(_bundleManager.dispose());
      _bundleManager = _createManager();
      _controller = null;
      _launch = null;
      _error = null;
      _loading = true;
      _ready = false;
      unawaited(_load());
      return;
    }
    if (_ready && oldWidget.theme != widget.theme) {
      _post({'type': 'theme', 'theme': widget.theme.toJson()});
    }
    if (_ready && oldWidget.session != widget.session) {
      final session = widget.session;
      if (session != null) {
        _post({'type': 'session', 'session': session.toJson()});
      }
    }
  }

  bool _sameKeys(Map<String, String> left, Map<String, String> right) {
    if (left.length != right.length) {
      return false;
    }
    for (final entry in left.entries) {
      if (right[entry.key] != entry.value) {
        return false;
      }
    }
    return true;
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_ready) {
      return;
    }
    if (state == AppLifecycleState.resumed) {
      _post({'type': 'resume'});
    } else if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.inactive ||
        state == AppLifecycleState.hidden) {
      _post({'type': 'pause'});
    }
  }

  void _sendInit() {
    final launch = GameLaunchContext.parse(widget.launchQuery);
    _post({
      'type': 'init',
      'protocol': _gameProtocolVersion,
      'config': {
        'protocol': _gameProtocolVersion,
        'gameId': widget.gameId,
        'locale': widget.locale,
        'theme': widget.theme.toJson(),
        if (widget.session != null) 'session': widget.session!.toJson(),
        if (widget.nakama != null) 'nakama': widget.nakama!.toJson(),
        if (launch != null) 'launch': launch.toJson(),
      },
    });
  }

  void _post(Map<String, dynamic> message) {
    final controller = _controller;
    if (controller == null) {
      return;
    }
    final payload = jsonEncode(message);
    unawaited(
      controller.evaluateJavascript(
        source: 'window.postMessage(${jsonEncode(payload)}, "*");',
      ),
    );
  }

  dynamic _handleBridgeMessage(List<dynamic> args) {
    if (args.isEmpty) {
      return null;
    }
    Object? raw = args.first;
    if (raw is String) {
      try {
        raw = jsonDecode(raw);
      } catch (_) {
        return null;
      }
    }
    if (raw is! Map) {
      return null;
    }
    final message = Map<String, dynamic>.from(raw);
    switch (message['type']) {
      case 'ready':
        _ready = true;
        _sendInit();
        final launch = _launch;
        if (launch != null) {
          widget.onReady?.call(launch);
        }
        break;
      case 'exit':
        widget.onExit?.call(message['reason'] as String?);
        break;
      case 'toast':
        widget.onToast?.call(
          message['message'] as String? ?? '',
          message['level'] as String?,
        );
        break;
      case 'haptic':
        unawaited(_handleHaptic(message['pattern'] as String?));
        break;
      case 'sound':
        widget.onSound?.call(message['name'] as String? ?? '');
        break;
      case 'openUrl':
        final url = message['url'] as String?;
        if (url != null && url.isNotEmpty) {
          unawaited(_openUrl(url));
        }
        break;
      case 'analytics':
        final properties = message['properties'];
        widget.onAnalytics?.call(
          message['event'] as String? ?? '',
          properties is Map ? Map<String, dynamic>.from(properties) : null,
        );
        break;
      case 'requestSessionRefresh':
        widget.onRequestSessionRefresh?.call();
        break;
    }
    return null;
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) {
      return;
    }
    try {
      final opened = await launchUrl(uri, mode: LaunchMode.externalApplication);
      if (opened) {
        widget.onOpenUrl?.call(url);
      }
    } catch (error) {
      debugPrint('[MoonGames] Could not open $url: $error');
    }
  }

  Future<void> _handleHaptic(String? pattern) async {
    switch (pattern) {
      case 'light':
        await HapticFeedback.lightImpact();
        break;
      case 'medium':
        await HapticFeedback.mediumImpact();
        break;
      case 'heavy':
        await HapticFeedback.heavyImpact();
        break;
      case 'success':
        await HapticFeedback.mediumImpact();
        break;
      case 'error':
        await HapticFeedback.heavyImpact();
        break;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final error = _error;
    if (error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Could not start ${widget.gameId}.\n$error',
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: () => unawaited(_load()),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }
    final launch = _launch;
    if (launch == null) {
      return const SizedBox.shrink();
    }

    return InAppWebView(
      initialFile: launch.entryFile.path,
      initialSettings: InAppWebViewSettings(
        javaScriptEnabled: true,
        domStorageEnabled: true,
        allowFileAccess: true,
        allowFileAccessFromFileURLs: true,
        allowUniversalAccessFromFileURLs: true,
        mediaPlaybackRequiresUserGesture: false,
      ),
      onWebViewCreated: (controller) {
        _controller = controller;
        controller.addJavaScriptHandler(
          handlerName: 'moongames',
          callback: _handleBridgeMessage,
        );
      },
      onConsoleMessage: (controller, message) {
        debugPrint('[MoonGames web] ${message.message}');
      },
    );
  }
}
