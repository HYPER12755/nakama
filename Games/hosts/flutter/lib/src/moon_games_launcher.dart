import 'dart:async';

import 'package:flutter/material.dart';

import 'bundle_manager.dart';
import 'games_catalog.dart';
import 'host_models.dart';
import 'launcher_icons.dart';
import 'moon_games_host.dart';
import 'release_proof.dart';

/// Optional deep-link request consumed by [MoonGamesLauncher].
class MoonGamesLaunchRequest {
  const MoonGamesLaunchRequest({
    required this.gameId,
    this.query,
    this.requestId,
  });

  final String gameId;
  final String? query;

  /// Optional nonce that allows the same request to be issued again.
  final String? requestId;

  String get storageKey => '${requestId ?? ''}|$gameId|${query ?? ''}';
}

/// Bundled fallback assets for one game.
class MoonGamesBundledAsset {
  const MoonGamesBundledAsset({
    required this.descriptorAsset,
    required this.zipAsset,
  });

  final String descriptorAsset;
  final String zipAsset;
}

/// A native Flutter catalog/menu that verifies signed releases and launches
/// them through [MoonGamesHost].
class MoonGamesLauncher extends StatefulWidget {
  const MoonGamesLauncher({
    super.key,
    required this.catalogUrl,
    required this.trustedKeys,
    this.manifestUrl,
    this.hostProtocol = 1,
    this.bundledAssets = const {},
    this.locale = 'en',
    this.theme = const MoonGamesTheme(),
    this.session,
    this.nakama,
    this.accountLabel,
    this.launchRequest,
    this.showGameChrome = true,
    this.onLaunchRequestHandled,
    this.onOpenAccount,
    this.onRequestSignIn,
    this.onGameClosed,
    this.onRequestSessionRefresh,
    this.onReady,
    this.onToast,
    this.onSound,
    this.onAnalytics,
    this.onOpenUrl,
    this.onError,
  });

  final String catalogUrl;
  final String? manifestUrl;
  final Map<String, String> trustedKeys;
  final int hostProtocol;
  final Map<String, MoonGamesBundledAsset> bundledAssets;
  final String locale;
  final MoonGamesTheme theme;
  final MoonGamesSession? session;
  final MoonGamesNakamaConfig? nakama;
  final String? accountLabel;
  final MoonGamesLaunchRequest? launchRequest;
  final bool showGameChrome;

  final VoidCallback? onLaunchRequestHandled;
  final VoidCallback? onOpenAccount;
  final VoidCallback? onRequestSignIn;
  final void Function(String gameId)? onGameClosed;
  final VoidCallback? onRequestSessionRefresh;
  final void Function(BundleLaunch launch)? onReady;
  final void Function(String message, String? level)? onToast;
  final void Function(String name)? onSound;
  final void Function(String event, Map<String, dynamic>? properties)?
  onAnalytics;
  final void Function(String url)? onOpenUrl;
  final void Function(Object error)? onError;

  @override
  State<MoonGamesLauncher> createState() => _MoonGamesLauncherState();
}

enum _LoadStage { catalog, releases }

enum _LauncherFilter {
  all('All games'),
  online('Online'),
  local('Local'),
  ai('Solo AI');

  const _LauncherFilter(this.label);

  final String label;

  String get wireName => switch (this) {
    _LauncherFilter.all => 'all',
    _LauncherFilter.online => 'online',
    _LauncherFilter.local => 'local',
    _LauncherFilter.ai => 'ai',
  };
}

class _LauncherNotice {
  const _LauncherNotice({
    required this.title,
    required this.message,
    this.tone = _BannerTone.warning,
    this.accountAction = false,
  });

  final String title;
  final String message;
  final _BannerTone tone;
  final bool accountAction;
}

class _ActiveGame {
  const _ActiveGame({
    required this.game,
    required this.official,
    this.release,
    this.launchQuery,
  });

  final GameCatalogEntry game;
  final bool official;
  final MoonGamesReleaseIdentity? release;
  final String? launchQuery;
}

enum _BannerTone { info, warning, error }

class _LauncherPalette {
  const _LauncherPalette({
    required this.background,
    required this.surface,
    required this.raised,
    required this.text,
    required this.muted,
    required this.border,
    required this.accent,
    required this.accentText,
    required this.good,
    required this.warning,
    required this.danger,
    required this.isDark,
  });

  final Color background;
  final Color surface;
  final Color raised;
  final Color text;
  final Color muted;
  final Color border;
  final Color accent;
  final Color accentText;
  final Color good;
  final Color warning;
  final Color danger;
  final bool isDark;

  static const _light = _LauncherPalette(
    background: Color(0xFFF3EFE6),
    surface: Color(0xFFFBF8F1),
    raised: Color(0xFFFFFDF8),
    text: Color(0xFF20231F),
    muted: Color(0xFF686F66),
    border: Color(0xFFDDD6C8),
    accent: Color(0xFFA96E28),
    accentText: Color(0xFFFFFAF0),
    good: Color(0xFF2F7555),
    warning: Color(0xFF98691F),
    danger: Color(0xFFA64141),
    isDark: false,
  );

  static const _dark = _LauncherPalette(
    background: Color(0xFF0B0F0E),
    surface: Color(0xFF141A18),
    raised: Color(0xFF1A211E),
    text: Color(0xFFF4EFE3),
    muted: Color(0xFF98A39A),
    border: Color(0xFF2C3731),
    accent: Color(0xFFD9B66F),
    accentText: Color(0xFF19150F),
    good: Color(0xFF69C89B),
    warning: Color(0xFFE1BA6D),
    danger: Color(0xFFEF9292),
    isDark: true,
  );

  static _LauncherPalette resolve(MoonGamesTheme theme, Brightness brightness) {
    final dark = switch (theme.mode) {
      MoonGamesThemeMode.system => brightness == Brightness.dark,
      MoonGamesThemeMode.light => false,
      MoonGamesThemeMode.dark => true,
    };
    final base = dark ? _dark : _light;
    return _LauncherPalette(
      background: _parseColor(theme.background, base.background),
      surface: _parseColor(theme.surface, base.surface),
      raised: base.raised,
      text: _parseColor(theme.text, base.text),
      muted: base.muted,
      border: base.border,
      accent: _parseColor(theme.accent, base.accent),
      accentText: base.accentText,
      good: base.good,
      warning: base.warning,
      danger: base.danger,
      isDark: dark,
    );
  }
}

Color _parseColor(String? value, Color fallback) {
  if (value == null) {
    return fallback;
  }
  final normalized = value.startsWith('#') ? value.substring(1) : value;
  if (normalized.length != 6) {
    return fallback;
  }
  final parsed = int.tryParse(normalized, radix: 16);
  return parsed == null ? fallback : Color(0xFF000000 | parsed);
}

Color _withAlpha(Color color, double opacity) {
  final alpha = (opacity.clamp(0.0, 1.0) * 255).round();
  return color.withAlpha(alpha);
}

TextStyle _style(
  double size,
  FontWeight weight,
  Color color, {
  double letterSpacing = 0,
  double? height,
}) {
  return TextStyle(
    fontSize: size,
    fontWeight: weight,
    color: color,
    letterSpacing: letterSpacing,
    height: height,
  );
}

String _errorMessage(Object cause, String fallback) {
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

const _capabilityLabels = <String, String>{
  'online': 'Online',
  'local': 'Local',
  'private-match': 'Private',
  'ai': 'Solo AI',
  'spectators': 'Spectate',
  'invite-links': 'Invites',
  'replay': 'Replay',
};

class _GameArtwork extends StatelessWidget {
  const _GameArtwork({required this.game, required this.size});

  final GameCatalogEntry game;
  final double size;

  @override
  Widget build(BuildContext context) {
    final accent = _parseColor(game.accent, const Color(0xFFD9B66F));
    return Container(
      width: size,
      height: size,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: _withAlpha(accent, 0.12),
        borderRadius: BorderRadius.circular(size * 0.28),
        border: Border.all(color: _withAlpha(accent, 0.45)),
      ),
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            width: size * 0.74,
            height: size * 0.74,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: _withAlpha(accent, 0.3)),
            ),
          ),
          Transform.rotate(
            angle: 0.31,
            child: Container(
              width: size * 0.38,
              height: size * 0.38,
              decoration: BoxDecoration(
                border: Border.all(color: _withAlpha(accent, 0.42)),
              ),
            ),
          ),
          MoonGamesLauncherIconWidget(
            launcherGameIcon(game.icon),
            size: size * 0.42,
            color: accent,
            strokeWidth: 1.5,
          ),
        ],
      ),
    );
  }
}

class _ReleaseBadge extends StatelessWidget {
  const _ReleaseBadge({required this.official, required this.palette});

  final bool official;
  final _LauncherPalette palette;

  @override
  Widget build(BuildContext context) {
    if (!official) {
      return const SizedBox.shrink();
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 4),
      decoration: BoxDecoration(
        color: _withAlpha(palette.good, 0.13),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: _withAlpha(palette.good, 0.32)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          MoonGamesLauncherIconWidget(
            MoonGamesLauncherIcon.shield,
            size: 11,
            color: palette.good,
            strokeWidth: 2,
          ),
          const SizedBox(width: 4),
          Text(
            'VERIFIED',
            style: _style(
              8.5,
              FontWeight.w700,
              palette.good,
              letterSpacing: 0.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.label, required this.palette, this.color});

  final String label;
  final _LauncherPalette palette;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final foreground = color ?? palette.muted;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color == null ? palette.raised : _withAlpha(foreground, 0.08),
        borderRadius: BorderRadius.circular(9),
        border: Border.all(
          color: color == null ? palette.border : _withAlpha(foreground, 0.25),
        ),
      ),
      child: Text(
        label.toUpperCase(),
        style: _style(8, FontWeight.w600, foreground, letterSpacing: 0.3),
      ),
    );
  }
}

class _FilterPill extends StatelessWidget {
  const _FilterPill({
    required this.label,
    required this.selected,
    required this.palette,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final _LauncherPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? palette.text : palette.surface,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: selected ? palette.text : palette.border),
        ),
        child: Text(
          label,
          style: _style(
            10,
            FontWeight.w600,
            selected ? palette.background : palette.muted,
            letterSpacing: 0.25,
          ),
        ),
      ),
    );
  }
}

class _PrimaryButton extends StatelessWidget {
  const _PrimaryButton({
    required this.label,
    required this.palette,
    required this.onPressed,
    this.icon = MoonGamesLauncherIcon.arrowRight,
  });

  final String label;
  final _LauncherPalette palette;
  final VoidCallback? onPressed;
  final MoonGamesLauncherIcon icon;

  @override
  Widget build(BuildContext context) {
    return FilledButton(
      onPressed: onPressed,
      style: FilledButton.styleFrom(
        backgroundColor: palette.accent,
        foregroundColor: palette.accentText,
        disabledBackgroundColor: _withAlpha(palette.accent, 0.4),
        minimumSize: const Size(0, 42),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        shape: const StadiumBorder(),
        textStyle: _style(
          11,
          FontWeight.w700,
          palette.accentText,
          letterSpacing: 0.5,
        ),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label.toUpperCase()),
          const SizedBox(width: 8),
          MoonGamesLauncherIconWidget(
            icon,
            size: 17,
            color: palette.accentText,
          ),
        ],
      ),
    );
  }
}

class _LauncherBanner extends StatelessWidget {
  const _LauncherBanner({
    required this.tone,
    required this.title,
    required this.message,
    required this.palette,
    this.actionLabel,
    this.onAction,
    this.onClose,
  });

  final _BannerTone tone;
  final String title;
  final String message;
  final _LauncherPalette palette;
  final String? actionLabel;
  final VoidCallback? onAction;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    final color = switch (tone) {
      _BannerTone.error => palette.danger,
      _BannerTone.warning => palette.warning,
      _BannerTone.info => palette.accent,
    };
    final icon = switch (tone) {
      _BannerTone.error => MoonGamesLauncherIcon.offline,
      _BannerTone.warning => MoonGamesLauncherIcon.spark,
      _BannerTone.info => MoonGamesLauncherIcon.spark,
    };
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: _withAlpha(color, 0.1),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: _withAlpha(color, 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Padding(
                padding: const EdgeInsets.only(top: 1),
                child: MoonGamesLauncherIconWidget(
                  icon,
                  size: 17,
                  color: color,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: _style(
                        12,
                        FontWeight.w700,
                        palette.text,
                        letterSpacing: 0.2,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      message,
                      style: _style(
                        11,
                        FontWeight.w400,
                        palette.muted,
                        height: 1.55,
                      ),
                    ),
                  ],
                ),
              ),
              if (onClose != null) ...[
                const SizedBox(width: 6),
                InkWell(
                  onTap: onClose,
                  borderRadius: BorderRadius.circular(12),
                  child: Padding(
                    padding: const EdgeInsets.all(4),
                    child: MoonGamesLauncherIconWidget(
                      MoonGamesLauncherIcon.close,
                      size: 15,
                      color: palette.muted,
                    ),
                  ),
                ),
              ],
            ],
          ),
          if (actionLabel != null && onAction != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: InkWell(
                onTap: onAction,
                borderRadius: BorderRadius.circular(15),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 11,
                    vertical: 7,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(15),
                    border: Border.all(color: _withAlpha(color, 0.45)),
                  ),
                  child: Text(
                    actionLabel!.toUpperCase(),
                    style: _style(
                      9,
                      FontWeight.w700,
                      color,
                      letterSpacing: 0.4,
                    ),
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _GameCard extends StatelessWidget {
  const _GameCard({
    required this.game,
    required this.official,
    required this.palette,
    required this.onTap,
  });

  final GameCatalogEntry game;
  final bool official;
  final _LauncherPalette palette;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final available = game.isAvailable;
    final capabilities = game.capabilities
        .map((capability) => _capabilityLabels[capability])
        .whereType<String>()
        .take(3)
        .toList(growable: false);
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Opacity(
        opacity: available ? 1 : 0.58,
        child: Material(
          color: Colors.transparent,
          child: InkWell(
            onTap: available ? onTap : null,
            borderRadius: BorderRadius.circular(22),
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: palette.surface,
                borderRadius: BorderRadius.circular(22),
                border: Border.all(
                  color: official
                      ? _withAlpha(palette.good, 0.26)
                      : palette.border,
                ),
              ),
              child: Row(
                children: [
                  _GameArtwork(game: game, size: 62),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Flexible(
                              child: Text(
                                game.name,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: _style(
                                  16,
                                  FontWeight.w700,
                                  palette.text,
                                  letterSpacing: -0.1,
                                ),
                              ),
                            ),
                            if (official) ...[
                              const SizedBox(width: 8),
                              _ReleaseBadge(official: true, palette: palette),
                            ],
                          ],
                        ),
                        const SizedBox(height: 3),
                        Text(
                          game.tagline,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: _style(
                            11,
                            FontWeight.w400,
                            palette.muted,
                            height: 1.45,
                          ),
                        ),
                        const SizedBox(height: 7),
                        Wrap(
                          spacing: 5,
                          runSpacing: 5,
                          crossAxisAlignment: WrapCrossAlignment.center,
                          children: [
                            if (available)
                              for (final label in capabilities)
                                _MetaChip(label: label, palette: palette)
                            else
                              _MetaChip(
                                label: 'Coming soon',
                                palette: palette,
                                color: palette.warning,
                              ),
                            if (available && game.version != null)
                              Text(
                                'v${game.version}',
                                style: _style(
                                  9,
                                  FontWeight.w500,
                                  palette.muted,
                                ),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 9),
                  MoonGamesLauncherIconWidget(
                    MoonGamesLauncherIcon.arrowRight,
                    size: 18,
                    color: _withAlpha(palette.muted, available ? 1 : 0.5),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.game,
    required this.official,
    required this.palette,
    required this.onPlay,
  });

  final GameCatalogEntry game;
  final bool official;
  final _LauncherPalette palette;
  final VoidCallback onPlay;

  @override
  Widget build(BuildContext context) {
    final accent = _parseColor(game.accent, palette.accent);
    final capabilities = game.capabilities
        .map((capability) => _capabilityLabels[capability])
        .whereType<String>()
        .take(2)
        .toList(growable: false);
    return Container(
      margin: const EdgeInsets.only(top: 22),
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: palette.surface,
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: _withAlpha(accent, 0.35)),
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            _withAlpha(accent, palette.isDark ? 0.11 : 0.08),
            palette.surface,
          ],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              _GameArtwork(game: game, size: 86),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(
                          'FEATURED',
                          style: _style(
                            9,
                            FontWeight.w700,
                            palette.accent,
                            letterSpacing: 1.4,
                          ),
                        ),
                        if (official) ...[
                          const SizedBox(width: 8),
                          _ReleaseBadge(official: true, palette: palette),
                        ],
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      game.name,
                      style: _style(
                        27,
                        FontWeight.w700,
                        palette.text,
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      game.tagline,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: _style(
                        12,
                        FontWeight.w400,
                        palette.muted,
                        height: 1.4,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            game.description,
            maxLines: 3,
            overflow: TextOverflow.ellipsis,
            style: _style(13, FontWeight.w400, palette.muted, height: 1.55),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final label in capabilities)
                      _MetaChip(label: label, palette: palette),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              _PrimaryButton(
                label: 'Play',
                palette: palette,
                onPressed: onPlay,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _MoonGamesLauncherState extends State<MoonGamesLauncher> {
  final TextEditingController _searchController = TextEditingController();
  GamesCatalog? _catalog;
  VerifiedCatalogRegistry? _registry;
  bool _loading = true;
  _LoadStage _stage = _LoadStage.catalog;
  String? _loadError;
  int _generation = 0;
  String _query = '';
  _LauncherFilter _filter = _LauncherFilter.all;
  _LauncherNotice? _notice;
  _ActiveGame? _active;
  String? _handledRequestKey;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      unawaited(_load());
    });
  }

  @override
  void didUpdateWidget(covariant MoonGamesLauncher oldWidget) {
    super.didUpdateWidget(oldWidget);
    final bundleChanged =
        oldWidget.catalogUrl != widget.catalogUrl ||
        oldWidget.manifestUrl != widget.manifestUrl ||
        oldWidget.hostProtocol != widget.hostProtocol ||
        !_sameKeys(oldWidget.trustedKeys, widget.trustedKeys);
    if (bundleChanged) {
      unawaited(_load());
      return;
    }

    final accountChanged =
        oldWidget.session != widget.session ||
        oldWidget.nakama != widget.nakama;
    final active = _active;
    if (accountChanged &&
        active != null &&
        active.official &&
        !_hasSharedAccount) {
      _closeGame();
      if (mounted) {
        setState(() {
          _notice = const _LauncherNotice(
            title: 'Launcher account disconnected',
            message:
                'The verified game was closed because its shared account '
                'session is no longer available.',
          );
        });
      }
    }

    final oldRequest = oldWidget.launchRequest?.storageKey;
    final newRequest = widget.launchRequest?.storageKey;
    if (accountChanged || oldRequest != newRequest) {
      _maybeHandleRequest();
    }
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  bool get _hasSharedAccount => widget.session != null && widget.nakama != null;

  Future<void> _load() async {
    final generation = ++_generation;
    if (mounted) {
      setState(() {
        _loading = true;
        _stage = _LoadStage.catalog;
        _loadError = null;
        _catalog = null;
        _registry = null;
      });
    }
    try {
      if (widget.catalogUrl.trim().isEmpty) {
        throw StateError('A games catalog URL is required.');
      }
      final catalog = await fetchGamesCatalog(widget.catalogUrl);
      if (!mounted || generation != _generation) {
        return;
      }
      setState(() {
        _catalog = catalog;
        _stage = _LoadStage.releases;
      });

      final manifestUrl = widget.manifestUrl?.trim();
      if (manifestUrl != null && manifestUrl.isNotEmpty) {
        final registry = await fetchVerifiedCatalog(
          catalog,
          manifestUrl,
          trustedKeys: widget.trustedKeys,
          hostProtocol: widget.hostProtocol,
        );
        if (!mounted || generation != _generation) {
          return;
        }
        setState(() {
          _registry = registry;
        });
      }

      if (!mounted || generation != _generation) {
        return;
      }
      setState(() {
        _loading = false;
      });
      _maybeHandleRequest();
    } catch (cause) {
      if (!mounted || generation != _generation) {
        return;
      }
      setState(() {
        _loadError = _errorMessage(
          cause,
          'The game library could not be loaded.',
        );
        _loading = false;
      });
      widget.onError?.call(cause);
    }
  }

  void _maybeHandleRequest() {
    if (!mounted) {
      return;
    }
    final request = widget.launchRequest;
    final catalog = _catalog;
    if (request == null ||
        catalog == null ||
        _loading ||
        _loadError != null ||
        _active != null ||
        _handledRequestKey == request.storageKey) {
      return;
    }
    final game = catalog.findGame(request.gameId);
    if (game == null) {
      setState(() {
        _notice = _LauncherNotice(
          title: 'Launch request not found',
          message: 'The catalog has no game with the id ${request.gameId}.',
          tone: _BannerTone.error,
        );
      });
      _handledRequestKey = request.storageKey;
      widget.onLaunchRequestHandled?.call();
      return;
    }
    if (!game.isAvailable) {
      setState(() {
        _notice = _LauncherNotice(
          title: 'Not available yet',
          message: '${game.name} is still marked as coming soon.',
          tone: _BannerTone.info,
        );
      });
      _handledRequestKey = request.storageKey;
      widget.onLaunchRequestHandled?.call();
      return;
    }
    if (_openGame(game, launchQuery: request.query)) {
      _handledRequestKey = request.storageKey;
      widget.onLaunchRequestHandled?.call();
    }
  }

  bool _openGame(GameCatalogEntry game, {String? launchQuery}) {
    if (!game.isAvailable) {
      return false;
    }
    final release = _registry?.games[game.id];
    if (release != null && !_hasSharedAccount) {
      setState(() {
        _notice = const _LauncherNotice(
          title: 'A launcher account is needed',
          message:
              'This release is verified. Open the launcher account to play '
              'it with your shared identity.',
          accountAction: true,
        );
      });
      widget.onRequestSignIn?.call();
      return false;
    }
    setState(() {
      _notice = null;
      _active = _ActiveGame(
        game: game,
        official: release != null,
        release: release?.toIdentity(),
        launchQuery: launchQuery,
      );
    });
    return true;
  }

  void _closeGame() {
    final active = _active;
    if (active == null) {
      return;
    }
    setState(() {
      _active = null;
    });
    widget.onGameClosed?.call(active.game.id);
  }

  List<GameCatalogEntry> get _sortedGames {
    final games =
        _catalog?.games
            .where((game) => game.status != GameAvailability.hidden)
            .toList(growable: true) ??
        <GameCatalogEntry>[];
    games.sort((left, right) => left.sortOrder.compareTo(right.sortOrder));
    return games;
  }

  bool _matches(GameCatalogEntry game) {
    if (_filter != _LauncherFilter.all &&
        !game.capabilities.contains(_filter.wireName)) {
      return false;
    }
    final query = _query.trim().toLowerCase();
    if (query.isEmpty) {
      return true;
    }
    final haystack = [
      game.name,
      game.tagline,
      game.description,
      ...game.tags,
    ].join(' ').toLowerCase();
    return haystack.contains(query);
  }

  List<GameCatalogEntry> get _visibleGames {
    return _sortedGames.where(_matches).toList(growable: false);
  }

  GameCatalogEntry? get _hero {
    for (final game in _sortedGames) {
      if (game.isAvailable && game.featured) {
        return game;
      }
    }
    for (final game in _sortedGames) {
      if (game.isAvailable) {
        return game;
      }
    }
    return null;
  }

  int get _officialCount => _registry?.games.length ?? 0;

  int get _releaseErrorCount => _registry?.errors.length ?? 0;

  bool get _proofUnavailable => _registry?.error != null;

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

  void _retry() {
    unawaited(_load());
  }

  @override
  Widget build(BuildContext context) {
    final palette = _LauncherPalette.resolve(
      widget.theme,
      MediaQuery.platformBrightnessOf(context),
    );
    final active = _active;
    if (active != null) {
      return _buildGame(active, palette);
    }
    return Scaffold(
      backgroundColor: palette.background,
      body: SafeArea(
        bottom: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 44),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _buildBrandRow(palette),
              const SizedBox(height: 18),
              _buildStatusRow(palette),
              if (_loading)
                _buildLoadingCard(palette)
              else if (_loadError != null)
                _buildErrorCard(palette)
              else
                ..._buildMenuContent(palette),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGame(_ActiveGame active, _LauncherPalette palette) {
    final asset = widget.bundledAssets[active.game.id];
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, result) {
        if (!didPop) {
          _closeGame();
        }
      },
      child: Scaffold(
        backgroundColor: palette.background,
        body: Column(
          children: [
            if (widget.showGameChrome) _buildGameChrome(active, palette),
            Expanded(
              child: MoonGamesHost(
                gameId: active.game.id,
                manifestUrl: widget.manifestUrl,
                trustedKeys: widget.trustedKeys,
                bundledDescriptorAsset: asset?.descriptorAsset,
                bundledZipAsset: asset?.zipAsset,
                hostProtocol: widget.hostProtocol,
                locale: widget.locale,
                launchQuery: active.launchQuery,
                theme: widget.theme,
                session: active.official ? widget.session : null,
                nakama: active.official ? widget.nakama : null,
                accountMode: active.official
                    ? MoonGamesAccountMode.shared
                    : MoonGamesAccountMode.perGame,
                official: active.official,
                release: active.release,
                onReady: widget.onReady,
                onExit: (_) => _closeGame(),
                onToast: widget.onToast,
                onSound: widget.onSound,
                onAnalytics: widget.onAnalytics,
                onOpenUrl: widget.onOpenUrl,
                onRequestSessionRefresh: widget.onRequestSessionRefresh,
                onError: (error) => widget.onError?.call(error),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildGameChrome(_ActiveGame active, _LauncherPalette palette) {
    return SafeArea(
      bottom: false,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: palette.surface,
          border: Border(bottom: BorderSide(color: palette.border)),
        ),
        child: Row(
          children: [
            InkWell(
              onTap: _closeGame,
              borderRadius: BorderRadius.circular(18),
              child: Container(
                constraints: const BoxConstraints(minHeight: 36),
                padding: const EdgeInsets.symmetric(horizontal: 11),
                decoration: BoxDecoration(
                  color: palette.raised,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: palette.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    MoonGamesLauncherIconWidget(
                      MoonGamesLauncherIcon.arrowLeft,
                      size: 17,
                      color: palette.text,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      'Library',
                      style: _style(
                        11,
                        FontWeight.w600,
                        palette.text,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Flexible(
                    child: Text(
                      active.game.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _style(
                        13,
                        FontWeight.w700,
                        palette.text,
                        letterSpacing: 0.1,
                      ),
                    ),
                  ),
                  if (active.official) ...[
                    const SizedBox(width: 7),
                    _ReleaseBadge(official: true, palette: palette),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 76),
          ],
        ),
      ),
    );
  }

  List<Widget> _buildMenuContent(_LauncherPalette palette) {
    final visibleGames = _visibleGames;
    final availableGames = visibleGames
        .where((game) => game.isAvailable)
        .toList(growable: false);
    final comingSoonGames = visibleGames
        .where((game) => game.status == GameAvailability.comingSoon)
        .toList(growable: false);
    final hero = _hero;
    final showHero =
        hero != null && _query.trim().isEmpty && _filter == _LauncherFilter.all;

    return [
      if (_notice != null)
        _LauncherBanner(
          tone: _notice!.tone,
          title: _notice!.title,
          message: _notice!.message,
          palette: palette,
          actionLabel: _notice!.accountAction && widget.onRequestSignIn != null
              ? 'Open account'
              : null,
          onAction: widget.onRequestSignIn,
          onClose: () => setState(() => _notice = null),
        ),
      if (_proofUnavailable)
        _LauncherBanner(
          tone: _BannerTone.warning,
          title: 'Release proofs are unavailable',
          message:
              '${_registry!.error} Games still open with their own account.',
          palette: palette,
          actionLabel: 'Retry',
          onAction: _retry,
        ),
      if (_releaseErrorCount > 0)
        _LauncherBanner(
          tone: _BannerTone.info,
          title: 'Some releases need attention',
          message:
              '$_releaseErrorCount '
              '${_releaseErrorCount == 1 ? 'game could' : 'games could'} not '
              'be verified. '
              '${_releaseErrorCount == 1 ? 'It opens' : 'They open'} '
              'independently.',
          palette: palette,
        ),
      if (!_hasSharedAccount && _officialCount > 0)
        _LauncherBanner(
          tone: _BannerTone.info,
          title: 'Play verified games with one account',
          message:
              'Connect the launcher account to share your identity, friends, '
              'and progress across every verified game.',
          palette: palette,
          actionLabel: widget.onRequestSignIn == null ? null : 'Open account',
          onAction: widget.onRequestSignIn,
        ),
      if (showHero && hero != null)
        _HeroCard(
          game: hero,
          official: _registry?.games.containsKey(hero.id) ?? false,
          palette: palette,
          onPlay: () => _openGame(hero),
        ),
      const SizedBox(height: 20),
      TextField(
        controller: _searchController,
        onChanged: (value) => setState(() => _query = value),
        style: _style(14, FontWeight.w400, palette.text),
        cursorColor: palette.accent,
        autocorrect: false,
        textCapitalization: TextCapitalization.none,
        textInputAction: TextInputAction.search,
        decoration: InputDecoration(
          hintText: 'Search games',
          hintStyle: _style(13, FontWeight.w400, palette.muted),
          filled: true,
          fillColor: palette.surface,
          prefixIconConstraints: const BoxConstraints(
            minWidth: 44,
            minHeight: 44,
          ),
          prefixIcon: Padding(
            padding: const EdgeInsets.only(left: 14, right: 8),
            child: MoonGamesLauncherIconWidget(
              MoonGamesLauncherIcon.search,
              size: 18,
              color: palette.muted,
            ),
          ),
          suffixIcon: _query.isEmpty
              ? null
              : Padding(
                  padding: const EdgeInsets.only(right: 4),
                  child: InkWell(
                    onTap: () {
                      _searchController.clear();
                      setState(() => _query = '');
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: MoonGamesLauncherIconWidget(
                        MoonGamesLauncherIcon.close,
                        size: 15,
                        color: palette.muted,
                      ),
                    ),
                  ),
                ),
          contentPadding: const EdgeInsets.symmetric(vertical: 14),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: BorderSide(color: palette.border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(17),
            borderSide: BorderSide(color: _withAlpha(palette.accent, 0.65)),
          ),
        ),
      ),
      const SizedBox(height: 12),
      SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(
          children: [
            for (final option in _LauncherFilter.values)
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: _FilterPill(
                  label: option.label,
                  selected: _filter == option,
                  palette: palette,
                  onTap: () {
                    setState(() => _filter = option);
                  },
                ),
              ),
          ],
        ),
      ),
      _buildSectionHeader(
        palette,
        'Library',
        '${availableGames.length} available',
      ),
      if (availableGames.isEmpty)
        _buildEmptyState(palette)
      else
        for (final game in availableGames)
          _GameCard(
            game: game,
            official: _registry?.games.containsKey(game.id) ?? false,
            palette: palette,
            onTap: () => _openGame(game),
          ),
      if (comingSoonGames.isNotEmpty) ...[
        _buildSectionHeader(
          palette,
          'Coming soon',
          '${comingSoonGames.length}',
        ),
        for (final game in comingSoonGames)
          _GameCard(
            game: game,
            official: false,
            palette: palette,
            onTap: () => _openGame(game),
          ),
      ],
      const SizedBox(height: 18),
      Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          MoonGamesLauncherIconWidget(
            MoonGamesLauncherIcon.shield,
            size: 13,
            color: palette.muted,
          ),
          const SizedBox(width: 7),
          Flexible(
            child: Text(
              'Signed releases are verified before the shared account is used.',
              textAlign: TextAlign.center,
              style: _style(
                10,
                FontWeight.w500,
                palette.muted,
                letterSpacing: 0.15,
              ),
            ),
          ),
        ],
      ),
    ];
  }

  Widget _buildBrandRow(_LauncherPalette palette) {
    final hasSharedAccount = _hasSharedAccount;
    final label =
        widget.accountLabel ??
        widget.session?.username ??
        (hasSharedAccount ? 'Account' : 'Independent');
    return Row(
      children: [
        Container(
          width: 42,
          height: 42,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: _withAlpha(palette.accent, 0.08),
            border: Border.all(color: _withAlpha(palette.accent, 0.5)),
          ),
          child: Stack(
            alignment: Alignment.center,
            children: [
              Container(
                width: 26,
                height: 26,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: _withAlpha(palette.accent, 0.45)),
                ),
              ),
              Container(
                width: 10,
                height: 10,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: palette.accent,
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'MoonGames',
                style: _style(
                  22,
                  FontWeight.w700,
                  palette.text,
                  letterSpacing: 0.2,
                ),
              ),
              const SizedBox(height: 2),
              Text(
                'One library. One account.',
                style: _style(
                  11,
                  FontWeight.w500,
                  palette.muted,
                  letterSpacing: 0.5,
                ),
              ),
            ],
          ),
        ),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 124),
          child: InkWell(
            onTap: widget.onOpenAccount,
            borderRadius: BorderRadius.circular(18),
            child: Container(
              constraints: const BoxConstraints(minHeight: 36),
              padding: const EdgeInsets.symmetric(horizontal: 11),
              decoration: BoxDecoration(
                color: palette.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(
                  color: hasSharedAccount
                      ? _withAlpha(palette.good, 0.3)
                      : palette.border,
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  MoonGamesLauncherIconWidget(
                    hasSharedAccount
                        ? MoonGamesLauncherIcon.shield
                        : MoonGamesLauncherIcon.users,
                    size: 15,
                    color: hasSharedAccount ? palette.good : palette.muted,
                  ),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: _style(
                        11,
                        FontWeight.w600,
                        palette.text,
                        letterSpacing: 0.2,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildStatusRow(_LauncherPalette palette) {
    final statusColor = _loading
        ? palette.accent
        : _proofUnavailable
        ? palette.warning
        : palette.good;
    final statusText = _loading
        ? _stage == _LoadStage.catalog
              ? 'Loading library'
              : 'Verifying releases'
        : _proofUnavailable
        ? 'Independent mode'
        : _officialCount > 0
        ? '$_officialCount verified '
              '${_officialCount == 1 ? 'release' : 'releases'}'
        : widget.manifestUrl == null
        ? 'Local library'
        : 'No verified releases';
    final readyCount = _sortedGames.where((game) => game.isAvailable).length;
    return Row(
      children: [
        Container(
          constraints: const BoxConstraints(minHeight: 28),
          padding: const EdgeInsets.symmetric(horizontal: 10),
          decoration: BoxDecoration(
            color: _withAlpha(statusColor, 0.1),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _withAlpha(statusColor, 0.28)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_loading)
                SizedBox.square(
                  dimension: 12,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: palette.accent,
                  ),
                )
              else
                MoonGamesLauncherIconWidget(
                  _proofUnavailable
                      ? MoonGamesLauncherIcon.offline
                      : MoonGamesLauncherIcon.shield,
                  size: 13,
                  color: statusColor,
                  strokeWidth: 2,
                ),
              const SizedBox(width: 6),
              Text(
                statusText.toUpperCase(),
                style: _style(
                  9,
                  FontWeight.w600,
                  palette.muted,
                  letterSpacing: 0.35,
                ),
              ),
            ],
          ),
        ),
        const Spacer(),
        if (!_loading)
          Text(
            '$readyCount ready',
            style: _style(11, FontWeight.w500, palette.muted),
          ),
      ],
    );
  }

  Widget _buildLoadingCard(_LauncherPalette palette) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 42, 24, 30),
      child: Column(
        children: [
          Container(
            width: 72,
            height: 72,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _withAlpha(palette.accent, 0.07),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(color: _withAlpha(palette.accent, 0.35)),
            ),
            child: MoonGamesLauncherIconWidget(
              _stage == _LoadStage.catalog
                  ? MoonGamesLauncherIcon.board
                  : MoonGamesLauncherIcon.shield,
              size: 28,
              color: palette.accent,
              strokeWidth: 1.5,
            ),
          ),
          const SizedBox(height: 20),
          Text(
            _stage == _LoadStage.catalog
                ? 'Opening the library'
                : 'Checking signed releases',
            textAlign: TextAlign.center,
            style: _style(
              18,
              FontWeight.w700,
              palette.text,
              letterSpacing: 0.2,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            _stage == _LoadStage.catalog
                ? 'The native menu is reading the operator catalog.'
                : 'Verified badges and shared accounts are enabled only for '
                      'releases that pass signature checks.',
            textAlign: TextAlign.center,
            style: _style(13, FontWeight.w400, palette.muted, height: 1.55),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorCard(_LauncherPalette palette) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 30, 22, 30),
      child: Column(
        children: [
          Container(
            width: 62,
            height: 62,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: _withAlpha(palette.danger, 0.1),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: _withAlpha(palette.danger, 0.3)),
            ),
            child: MoonGamesLauncherIconWidget(
              MoonGamesLauncherIcon.offline,
              size: 26,
              color: palette.danger,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'Library unavailable',
            style: _style(17, FontWeight.w700, palette.text),
          ),
          const SizedBox(height: 7),
          Text(
            _loadError!,
            textAlign: TextAlign.center,
            style: _style(12, FontWeight.w400, palette.muted, height: 1.5),
          ),
          const SizedBox(height: 18),
          _PrimaryButton(
            label: 'Try again',
            palette: palette,
            icon: MoonGamesLauncherIcon.refresh,
            onPressed: _retry,
          ),
        ],
      ),
    );
  }

  Widget _buildEmptyState(_LauncherPalette palette) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(22, 30, 22, 30),
      child: Column(
        children: [
          Container(
            width: 62,
            height: 62,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: palette.surface,
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: palette.border),
            ),
            child: MoonGamesLauncherIconWidget(
              MoonGamesLauncherIcon.search,
              size: 25,
              color: palette.muted,
            ),
          ),
          const SizedBox(height: 16),
          Text(
            'No games match',
            style: _style(17, FontWeight.w700, palette.text),
          ),
          const SizedBox(height: 7),
          Text(
            'Try a different search or filter.',
            style: _style(12, FontWeight.w400, palette.muted, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _buildSectionHeader(
    _LauncherPalette palette,
    String title,
    String count,
  ) {
    return Padding(
      padding: const EdgeInsets.only(top: 26, bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Text(
            title,
            style: _style(
              18,
              FontWeight.w700,
              palette.text,
              letterSpacing: -0.15,
            ),
          ),
          const Spacer(),
          Text(
            count.toUpperCase(),
            style: _style(
              9,
              FontWeight.w500,
              palette.muted,
              letterSpacing: 0.3,
            ),
          ),
        ],
      ),
    );
  }
}
