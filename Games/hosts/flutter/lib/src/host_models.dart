enum MoonGamesThemeMode { system, light, dark }

class MoonGamesTheme {
  const MoonGamesTheme({
    this.mode = MoonGamesThemeMode.dark,
    this.accent,
    this.background,
    this.surface,
    this.text,
  });

  final MoonGamesThemeMode mode;
  final String? accent;
  final String? background;
  final String? surface;
  final String? text;

  Map<String, dynamic> toJson() {
    return {
      'mode': mode.name,
      if (accent != null) 'accent': accent,
      if (background != null) 'background': background,
      if (surface != null) 'surface': surface,
      if (text != null) 'text': text,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is MoonGamesTheme &&
        other.mode == mode &&
        other.accent == accent &&
        other.background == background &&
        other.surface == surface &&
        other.text == text;
  }

  @override
  int get hashCode => Object.hash(mode, accent, background, surface, text);
}

class MoonGamesSession {
  const MoonGamesSession({
    required this.token,
    required this.refreshToken,
    required this.userId,
    required this.username,
    required this.expiresAt,
  });

  final String token;
  final String refreshToken;
  final String userId;
  final String username;

  /// UNIX timestamp in seconds.
  final int expiresAt;

  Map<String, dynamic> toJson() {
    return {
      'token': token,
      'refreshToken': refreshToken,
      'userId': userId,
      'username': username,
      'expiresAt': expiresAt,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is MoonGamesSession &&
        other.token == token &&
        other.refreshToken == refreshToken &&
        other.userId == userId &&
        other.username == username &&
        other.expiresAt == expiresAt;
  }

  @override
  int get hashCode =>
      Object.hash(token, refreshToken, userId, username, expiresAt);
}

class MoonGamesNakamaConfig {
  const MoonGamesNakamaConfig({
    required this.host,
    required this.port,
    required this.serverKey,
    required this.useSSL,
  });

  final String host;
  final String port;
  final String serverKey;
  final bool useSSL;

  Map<String, dynamic> toJson() {
    return {
      'host': host,
      'port': port,
      'serverKey': serverKey,
      'useSSL': useSSL,
    };
  }

  @override
  bool operator ==(Object other) {
    return other is MoonGamesNakamaConfig &&
        other.host == host &&
        other.port == port &&
        other.serverKey == serverKey &&
        other.useSSL == useSSL;
  }

  @override
  int get hashCode => Object.hash(host, port, serverKey, useSSL);
}
