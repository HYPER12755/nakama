/// Query parameters supplied by a native launch or deep link.
///
/// Hosts send this in the init config so file-backed game bundles receive the
/// same launch context that a browser gets from `window.location.search`.
class GameLaunchContext {
  const GameLaunchContext({required this.query, required this.params});

  /// Normalized query string without a leading `?` or `#`.
  final String query;

  /// Decoded query parameters.
  final Map<String, String> params;

  Map<String, dynamic> toJson() => {'query': query, 'params': params};

  /// Returns null for empty, malformed, or oversized launch queries.
  static GameLaunchContext? parse(String? raw) {
    if (raw == null) {
      return null;
    }
    final normalized = raw.trim().replaceFirst(RegExp(r'^[?#]+'), '');
    if (normalized.isEmpty || normalized.length > 4096) {
      return null;
    }
    try {
      final params = Uri.splitQueryString(normalized);
      if (params.isEmpty) {
        return null;
      }
      return GameLaunchContext(query: normalized, params: params);
    } on FormatException {
      return null;
    }
  }
}
