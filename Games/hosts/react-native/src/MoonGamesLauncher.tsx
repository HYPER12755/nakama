import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import {
  createGameLaunchContext,
  fetchGamesCatalog,
  type GameCapability,
  type GameCatalogEntry,
  type GameHostConfig,
  type GameSession,
  type GameTheme,
  type GamesCatalog,
  type NakamaConnection,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";
import {
  buildLauncherHostConfig,
  fetchVerifiedCatalog,
  type VerifiedCatalogRegistry,
} from "@moongames/host-core";
import { LauncherIcon, launcherGameIcon } from "./LauncherIcon";
import { MoonGamesWebView } from "./MoonGamesWebView";
import type { BundledFallback, ResolvedBundle } from "./bundleManager";

export type LauncherFilter = "all" | "local" | "online" | "ai";

export interface NativeLaunchRequest {
  gameId: string;
  /** Deep-link query, for example `match=abc&spectate=1`. */
  query?: string;
  /** Optional nonce so the same request can be issued again after closing. */
  requestId?: string;
}

export interface MoonGamesLauncherProps {
  catalogUrl: string;
  manifestUrl?: string;
  trustedKeys: TrustedBundleKeys;
  bundledFallbacks?: Record<string, BundledFallback>;
  fetchImpl?: typeof fetch;
  locale?: string;
  theme?: GameTheme;
  session?: GameSession;
  nakama?: NakamaConnection;
  accountLabel?: string;
  launchRequest?: NativeLaunchRequest | null;
  showGameChrome?: boolean;
  onLaunchRequestHandled?: () => void;
  onOpenAccount?: () => void;
  onRequestSignIn?: () => void;
  onGameClosed?: (gameId: string) => void;
  onRequestSessionRefresh?: () => void;
  onReady?: (bundle: ResolvedBundle) => void;
  onToast?: (message: string, level?: "info" | "success" | "error") => void;
  onSound?: (name: string) => void;
  onAnalytics?: (
    event: string,
    properties?: Record<string, unknown>,
  ) => void;
  onOpenUrl?: (url: string) => void;
  onError?: (error: Error) => void;
}

interface Palette {
  background: string;
  surface: string;
  raised: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentText: string;
  good: string;
  warning: string;
  danger: string;
}

interface ActiveGame {
  game: GameCatalogEntry;
  config: GameHostConfig;
}

interface LauncherNotice {
  title: string;
  message: string;
  tone?: "info" | "warning" | "error";
  accountAction?: boolean;
}

interface FilterOption {
  id: LauncherFilter;
  label: string;
}

const FILTERS: FilterOption[] = [
  { id: "all", label: "All games" },
  { id: "online", label: "Online" },
  { id: "local", label: "Local" },
  { id: "ai", label: "Solo AI" },
];

const CAPABILITY_LABELS: Partial<Record<GameCapability, string>> = {
  online: "Online",
  local: "Local",
  "private-match": "Private",
  ai: "Solo AI",
  spectators: "Spectate",
  "invite-links": "Invites",
  replay: "Replay",
};

const LIGHT: Palette = {
  background: "#f3efe6",
  surface: "#fbf8f1",
  raised: "#fffdf8",
  text: "#20231f",
  muted: "#686f66",
  border: "#ddd6c8",
  accent: "#a96e28",
  accentText: "#fffaf0",
  good: "#2f7555",
  warning: "#98691f",
  danger: "#a64141",
};

const DARK: Palette = {
  background: "#0b0f0e",
  surface: "#141a18",
  raised: "#1a211e",
  text: "#f4efe3",
  muted: "#98a39a",
  border: "#2c3731",
  accent: "#d9b66f",
  accentText: "#19150f",
  good: "#69c89b",
  warning: "#e1ba6d",
  danger: "#ef9292",
};

function withAlpha(hex: string, alpha: number): string {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex : LIGHT.accent;
  const channel = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${normalized}${channel}`;
}

function launcherPalette(theme: GameTheme, system: "light" | "dark"): Palette {
  const base = (theme.mode === "system" ? system : theme.mode) === "light"
    ? LIGHT
    : DARK;
  return {
    ...base,
    ...(theme.background === undefined ? {} : { background: theme.background }),
    ...(theme.surface === undefined ? {} : { surface: theme.surface }),
    ...(theme.text === undefined ? {} : { text: theme.text }),
    ...(theme.accent === undefined ? {} : { accent: theme.accent }),
    accentText: base.accentText,
  };
}

function gameMatches(
  game: GameCatalogEntry,
  query: string,
  filter: LauncherFilter,
): boolean {
  const normalized = query.trim().toLowerCase();
  if (filter !== "all" && !game.capabilities.includes(filter)) {
    return false;
  }
  if (normalized.length === 0) {
    return true;
  }
  const haystack = [
    game.name,
    game.tagline,
    game.description,
    ...game.tags,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
}

export function filterLauncherGames(
  games: GameCatalogEntry[],
  query: string,
  filter: LauncherFilter,
): GameCatalogEntry[] {
  return games.filter(
    (game) => game.status !== "hidden" && gameMatches(game, query, filter),
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message.length > 0
    ? cause.message
    : fallback;
}

function GameArtwork({
  game,
  size,
}: {
  game: GameCatalogEntry;
  size: number;
}) {
  return (
    <View
      style={[
        styles.artwork,
        {
          width: size,
          height: size,
          borderRadius: size * 0.28,
          borderColor: withAlpha(game.accent, 0.45),
          backgroundColor: withAlpha(game.accent, 0.12),
        },
      ]}
    >
      <View
        style={[
          styles.artRing,
          {
            width: size * 0.74,
            height: size * 0.74,
            borderRadius: size,
            borderColor: withAlpha(game.accent, 0.3),
          },
        ]}
      />
      <View
        style={[
          styles.artDiamond,
          {
            width: size * 0.38,
            height: size * 0.38,
            borderColor: withAlpha(game.accent, 0.42),
          },
        ]}
      />
      <LauncherIcon
        name={launcherGameIcon(game.icon)}
        size={Math.round(size * 0.42)}
        color={game.accent}
        strokeWidth={1.5}
      />
    </View>
  );
}

function ReleaseBadge({
  official,
  palette,
}: {
  official: boolean;
  palette: Palette;
}) {
  if (!official) {
    return null;
  }
  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: withAlpha(palette.good, 0.13),
          borderColor: withAlpha(palette.good, 0.32),
        },
      ]}
    >
      <LauncherIcon name="shield" size={11} color={palette.good} strokeWidth={2} />
      <Text style={[styles.badgeText, { color: palette.good }]}>Verified</Text>
    </View>
  );
}

function Banner({
  tone,
  title,
  message,
  actionLabel,
  onAction,
  onClose,
  palette,
}: {
  tone: "info" | "warning" | "error";
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose?: () => void;
  palette: Palette;
}) {
  const color =
    tone === "error"
      ? palette.danger
      : tone === "warning"
        ? palette.warning
        : palette.accent;
  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: withAlpha(color, 0.1),
          borderColor: withAlpha(color, 0.3),
        },
      ]}
    >
      <View style={styles.bannerIcon}>
        <LauncherIcon
          name={tone === "error" ? "offline" : "spark"}
          size={17}
          color={color}
        />
      </View>
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerTitle, { color: palette.text }]}>{title}</Text>
        <Text style={[styles.bannerMessage, { color: palette.muted }]}>
          {message}
        </Text>
      </View>
      {actionLabel !== undefined && onAction !== undefined ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }: { pressed: boolean }) => [
            styles.bannerAction,
            {
              borderColor: withAlpha(color, 0.45),
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <Text style={[styles.bannerActionText, { color }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {onClose === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss message"
          hitSlop={8}
          onPress={onClose}
          style={styles.bannerClose}
        >
          <LauncherIcon name="close" size={15} color={palette.muted} />
        </Pressable>
      )}
    </View>
  );
}

function GameCard({
  game,
  official,
  palette,
  onPress,
}: {
  game: GameCatalogEntry;
  official: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  const available = game.status === "available";
  const capabilities = game.capabilities
    .map((capability) => CAPABILITY_LABELS[capability])
    .filter((label): label is string => label !== undefined)
    .slice(0, 3);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${game.name}. ${game.tagline}`}
      accessibilityState={{ disabled: !available }}
      disabled={!available}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.gameCard,
        {
          backgroundColor: palette.surface,
          borderColor: official
            ? withAlpha(palette.good, 0.26)
            : palette.border,
          opacity: available ? (pressed ? 0.78 : 1) : 0.58,
        },
      ]}
    >
      <GameArtwork game={game} size={62} />
      <View style={styles.gameCardCopy}>
        <View style={styles.gameTitleRow}>
          <Text
            numberOfLines={1}
            style={[styles.gameTitle, { color: palette.text }]}
          >
            {game.name}
          </Text>
          <ReleaseBadge official={official} palette={palette} />
        </View>
        <Text
          numberOfLines={2}
          style={[styles.gameTagline, { color: palette.muted }]}
        >
          {game.tagline}
        </Text>
        <View style={styles.metaRow}>
          {available ? (
            capabilities.map((label) => (
              <View
                key={label}
                style={[
                  styles.metaChip,
                  {
                    backgroundColor: palette.raised,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={[styles.metaText, { color: palette.muted }]}>
                  {label}
                </Text>
              </View>
            ))
          ) : (
            <View
              style={[
                styles.metaChip,
                {
                  backgroundColor: withAlpha(palette.warning, 0.08),
                  borderColor: withAlpha(palette.warning, 0.25),
                },
              ]}
            >
              <Text style={[styles.metaText, { color: palette.warning }]}>
                Coming soon
              </Text>
            </View>
          )}
          {available && game.version !== undefined ? (
            <Text style={[styles.versionText, { color: palette.muted }]}>
              v{game.version}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.gameCardTrailing}>
        <LauncherIcon
          name="arrow-right"
          size={18}
          color={available ? palette.muted : withAlpha(palette.muted, 0.5)}
        />
      </View>
    </Pressable>
  );
}

export function MoonGamesLauncher({
  catalogUrl,
  manifestUrl,
  trustedKeys,
  bundledFallbacks,
  fetchImpl,
  locale = "en",
  theme = { mode: "dark" },
  session,
  nakama,
  accountLabel,
  launchRequest,
  showGameChrome = true,
  onLaunchRequestHandled,
  onOpenAccount,
  onRequestSignIn,
  onGameClosed,
  onRequestSessionRefresh,
  onReady,
  onToast,
  onSound,
  onAnalytics,
  onOpenUrl,
  onError,
}: MoonGamesLauncherProps) {
  const systemScheme = useColorScheme() === "light" ? "light" : "dark";
  const trustedKeysKey = JSON.stringify(trustedKeys);
  const [catalog, setCatalog] = useState<GamesCatalog | null>(null);
  const [registry, setRegistry] = useState<VerifiedCatalogRegistry | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadStage, setLoadStage] = useState<"catalog" | "releases">("catalog");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LauncherFilter>("all");
  const [notice, setNotice] = useState<LauncherNotice | null>(null);
  const [active, setActive] = useState<ActiveGame | null>(null);
  const handledRequest = useRef<string | null>(null);
  const callbacks = useRef({
    onError,
    onGameClosed,
    onLaunchRequestHandled,
    onRequestSignIn,
  });
  callbacks.current = {
    onError,
    onGameClosed,
    onLaunchRequestHandled,
    onRequestSignIn,
  };

  const palette = useMemo(() => {
    return launcherPalette(theme, systemScheme);
  }, [
    systemScheme,
    theme.accent,
    theme.background,
    theme.mode,
    theme.surface,
    theme.text,
  ]);
  const resolvedTheme = useMemo(
    () => ({ ...theme }),
    [theme.accent, theme.background, theme.mode, theme.surface, theme.text],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadStage("catalog");
    setLoadError(null);
    setRegistry(null);

    const load = async () => {
      try {
        if (catalogUrl.trim().length === 0) {
          throw new Error("A games catalog URL is required.");
        }
        const nextCatalog = await fetchGamesCatalog(catalogUrl, { fetchImpl });
        if (cancelled) {
          return;
        }
        setCatalog(nextCatalog);
        if (manifestUrl !== undefined && manifestUrl.trim().length > 0) {
          setLoadStage("releases");
          const nextRegistry = await fetchVerifiedCatalog(
            nextCatalog,
            manifestUrl,
            { fetchImpl, trustedKeys },
          );
          if (!cancelled) {
            setRegistry(nextRegistry);
          }
        }
        if (!cancelled) {
          setLoading(false);
        }
      } catch (cause) {
        if (!cancelled) {
          setLoadError(errorMessage(cause, "The game library could not be loaded."));
          callbacks.current.onError?.(
            cause instanceof Error
              ? cause
              : new Error("The game library could not be loaded."),
          );
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
    };
    // trustedKeysKey captures the verified public-key set without re-fetching on
    // every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    catalogUrl,
    fetchImpl,
    manifestUrl,
    reloadToken,
    trustedKeysKey,
  ]);

  const sortedGames = useMemo(() => {
    if (catalog === null) {
      return [];
    }
    return [...catalog.games]
      .filter((game) => game.status !== "hidden")
      .sort((left, right) => left.sortOrder - right.sortOrder);
  }, [catalog]);
  const visibleGames = useMemo(
    () => filterLauncherGames(sortedGames, query, filter),
    [filter, query, sortedGames],
  );
  const availableGames = visibleGames.filter(
    (game) => game.status === "available",
  );
  const comingSoonGames = visibleGames.filter(
    (game) => game.status === "coming-soon",
  );
  const hero = useMemo(
    () =>
      sortedGames.find(
        (game) => game.status === "available" && game.featured,
      ) ??
      sortedGames.find((game) => game.status === "available") ??
      null,
    [sortedGames],
  );
  const showHero =
    hero !== null && query.trim().length === 0 && filter === "all";
  const officialCount = registry?.games.size ?? 0;
  const releaseErrorCount = registry?.errors.size ?? 0;
  const hasSharedAccount = session !== undefined && nakama !== undefined;

  const openGame = useCallback(
    (game: GameCatalogEntry, launchQuery?: string): boolean => {
      if (game.status !== "available") {
        return false;
      }
      const release = registry?.games.get(game.id) ?? null;
      if (release !== null && (!session || !nakama)) {
        setNotice({
          title: "A launcher account is needed",
          message:
            "This release is verified. Open the launcher account to play it with your shared identity.",
          tone: "warning",
          accountAction: true,
        });
        callbacks.current.onRequestSignIn?.();
        return false;
      }
      try {
        const config = buildLauncherHostConfig({
          entry: game,
          release,
          session: release === null ? undefined : session,
          nakama: release === null ? undefined : nakama,
          theme: resolvedTheme,
          locale,
          launch: createGameLaunchContext(launchQuery),
        });
        setNotice(null);
        setActive({ game, config });
        return true;
      } catch (cause) {
        const failure = new Error(
          errorMessage(cause, `Could not open ${game.name}.`),
        );
        setNotice({
          title: "Could not open game",
          message: failure.message,
          tone: "error",
        });
        callbacks.current.onError?.(failure);
        return false;
      }
    },
    [locale, nakama, registry, resolvedTheme, session],
  );

  const closeGame = useCallback(() => {
    const gameId = active?.game.id;
    setActive(null);
    if (gameId !== undefined) {
      callbacks.current.onGameClosed?.(gameId);
    }
  }, [active]);

  useEffect(() => {
    if (active === null) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        closeGame();
        return true;
      },
    );
    return () => subscription.remove();
  }, [active, closeGame]);

  useEffect(() => {
    if (
      active !== null &&
      (registry?.games.has(active.game.id) ?? false) &&
      (session === undefined || nakama === undefined)
    ) {
      closeGame();
      setNotice({
        title: "Launcher account disconnected",
        message:
          "The verified game was closed because its shared account session is no longer available.",
        tone: "warning",
      });
    }
  }, [active, closeGame, nakama, registry, session]);

  const requestKey =
    launchRequest === undefined || launchRequest === null
      ? null
      : `${launchRequest.requestId ?? ""}|${launchRequest.gameId}|${launchRequest.query ?? ""}`;

  useEffect(() => {
    if (
      launchRequest === undefined ||
      launchRequest === null ||
      requestKey === null ||
      handledRequest.current === requestKey ||
      loading ||
      loadError !== null ||
      catalog === null ||
      active !== null
    ) {
      return;
    }
    const game = catalog.games.find(
      (entry) => entry.id === launchRequest.gameId && entry.status !== "hidden",
    );
    if (game === undefined) {
      setNotice({
        title: "Launch request not found",
        message: `The catalog has no game with the id ${launchRequest.gameId}.`,
        tone: "error",
      });
      handledRequest.current = requestKey;
      callbacks.current.onLaunchRequestHandled?.();
      return;
    }
    if (game.status !== "available") {
      setNotice({
        title: "Not available yet",
        message: `${game.name} is still marked as coming soon.`,
        tone: "info",
      });
      handledRequest.current = requestKey;
      callbacks.current.onLaunchRequestHandled?.();
      return;
    }
    if (openGame(game, launchRequest.query)) {
      handledRequest.current = requestKey;
      callbacks.current.onLaunchRequestHandled?.();
    }
  }, [active, catalog, launchRequest, loadError, loading, openGame, requestKey]);

  if (active !== null) {
    const official = registry?.games.has(active.game.id) ?? false;
    return (
      <View style={[styles.gameRoot, { backgroundColor: palette.background }]}>
        {showGameChrome ? (
          <SafeAreaView
            style={[
              styles.gameChromeSafe,
              {
                backgroundColor: palette.surface,
                borderBottomColor: palette.border,
              },
            ]}
          >
            <View style={styles.gameChrome}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back to the game library"
                onPress={closeGame}
                style={({ pressed }: { pressed: boolean }) => [
                  styles.gameBack,
                  {
                    backgroundColor: palette.raised,
                    borderColor: palette.border,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <LauncherIcon name="arrow-left" size={17} color={palette.text} />
                <Text style={[styles.gameBackText, { color: palette.text }]}>
                  Library
                </Text>
              </Pressable>
              <View style={styles.gameChromeTitle}>
                <Text
                  numberOfLines={1}
                  style={[styles.gameChromeName, { color: palette.text }]}
                >
                  {active.game.name}
                </Text>
                <ReleaseBadge official={official} palette={palette} />
              </View>
              <View style={styles.gameChromeSpacer} />
            </View>
          </SafeAreaView>
        ) : null}
        <MoonGamesWebView
          gameId={active.game.id}
          manifestUrl={manifestUrl}
          trustedKeys={trustedKeys}
          bundledFallback={bundledFallbacks?.[active.game.id]}
          locale={locale}
          theme={resolvedTheme}
          session={official ? session : undefined}
          nakama={official ? nakama : undefined}
          hostConfig={active.config}
          style={styles.webView}
          onReady={onReady}
          onExit={closeGame}
          onToast={onToast}
          onSound={onSound}
          onAnalytics={onAnalytics}
          onOpenUrl={onOpenUrl}
          onRequestSessionRefresh={onRequestSessionRefresh}
          onError={(error) => {
            callbacks.current.onError?.(error);
          }}
        />
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandRow}>
          <View
            style={[
              styles.brandMark,
              {
                borderColor: withAlpha(palette.accent, 0.5),
                backgroundColor: withAlpha(palette.accent, 0.08),
              },
            ]}
          >
            <View
              style={[
                styles.brandOrbit,
                { borderColor: withAlpha(palette.accent, 0.45) },
              ]}
            />
            <View
              style={[styles.brandCore, { backgroundColor: palette.accent }]}
            />
          </View>
          <View style={styles.brandCopy}>
            <Text style={[styles.brandTitle, { color: palette.text }]}>
              MoonGames
            </Text>
            <Text style={[styles.brandSubtitle, { color: palette.muted }]}>
              One library. One account.
            </Text>
          </View>
          <Pressable
            accessibilityRole={onOpenAccount === undefined ? undefined : "button"}
            accessibilityLabel="Launcher account"
            disabled={onOpenAccount === undefined}
            onPress={onOpenAccount}
            style={({ pressed }: { pressed: boolean }) => [
              styles.accountChip,
              {
                backgroundColor: palette.surface,
                borderColor: hasSharedAccount
                  ? withAlpha(palette.good, 0.3)
                  : palette.border,
                opacity: pressed ? 0.72 : 1,
              },
            ]}
          >
            <LauncherIcon
              name={hasSharedAccount ? "shield" : "users"}
              size={15}
              color={hasSharedAccount ? palette.good : palette.muted}
            />
            <Text
              numberOfLines={1}
              style={[styles.accountText, { color: palette.text }]}
            >
              {accountLabel ??
                session?.username ??
                (hasSharedAccount ? "Account" : "Independent")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusPill,
              {
                backgroundColor: withAlpha(
                  loading
                    ? palette.accent
                    : registry?.error !== null && registry?.error !== undefined
                      ? palette.warning
                      : palette.good,
                  0.1,
                ),
                borderColor: withAlpha(
                  loading
                    ? palette.accent
                    : registry?.error !== null && registry?.error !== undefined
                      ? palette.warning
                      : palette.good,
                  0.28,
                ),
              },
            ]}
          >
            {loading ? (
              <ActivityIndicator size="small" color={palette.accent} />
            ) : (
              <LauncherIcon
                name={
                  registry?.error !== null && registry?.error !== undefined
                    ? "offline"
                    : "shield"
                }
                size={13}
                color={
                  registry?.error !== null && registry?.error !== undefined
                    ? palette.warning
                    : palette.good
                }
                strokeWidth={2}
              />
            )}
            <Text style={[styles.statusText, { color: palette.muted }]}>
              {loading
                ? loadStage === "catalog"
                  ? "Loading library"
                  : "Verifying releases"
                : registry?.error !== null && registry?.error !== undefined
                  ? "Independent mode"
                  : officialCount > 0
                    ? `${officialCount} verified ${officialCount === 1 ? "release" : "releases"}`
                    : manifestUrl === undefined
                      ? "Local library"
                      : "No verified releases"}
            </Text>
          </View>
          {loading ? null : (
            <Text style={[styles.libraryCount, { color: palette.muted }]}>
              {sortedGames.filter((game) => game.status === "available").length}{" "}
              ready
            </Text>
          )}
        </View>

        {loading ? (
          <View style={styles.loadingCard}>
            <View
              style={[
                styles.loadingMark,
                {
                  borderColor: withAlpha(palette.accent, 0.35),
                  backgroundColor: withAlpha(palette.accent, 0.07),
                },
              ]}
            >
              <LauncherIcon
                name={loadStage === "catalog" ? "board" : "shield"}
                size={28}
                color={palette.accent}
                strokeWidth={1.5}
              />
            </View>
            <Text style={[styles.loadingTitle, { color: palette.text }]}>
              {loadStage === "catalog"
                ? "Opening the library"
                : "Checking signed releases"}
            </Text>
            <Text style={[styles.loadingText, { color: palette.muted }]}>
              {loadStage === "catalog"
                ? "The native menu is reading the operator catalog."
                : "Verified badges and shared accounts are enabled only for releases that pass signature checks."}
            </Text>
          </View>
        ) : loadError !== null ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIcon,
                {
                  backgroundColor: withAlpha(palette.danger, 0.1),
                  borderColor: withAlpha(palette.danger, 0.3),
                },
              ]}
            >
              <LauncherIcon name="offline" size={26} color={palette.danger} />
            </View>
            <Text style={[styles.emptyTitle, { color: palette.text }]}>
              Library unavailable
            </Text>
            <Text style={[styles.emptyText, { color: palette.muted }]}>
              {loadError}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setReloadToken((value) => value + 1)}
              style={({ pressed }: { pressed: boolean }) => [
                styles.primaryButton,
                {
                  backgroundColor: palette.accent,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <LauncherIcon
                name="refresh"
                size={17}
                color={palette.accentText}
              />
              <Text
                style={[styles.primaryButtonText, { color: palette.accentText }]}
              >
                Try again
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {notice === null ? null : (
              <Banner
                tone={notice.tone ?? "warning"}
                title={notice.title}
                message={notice.message}
                actionLabel={
                  notice.accountAction && onRequestSignIn !== undefined
                    ? "Open account"
                    : undefined
                }
                onAction={onRequestSignIn}
                onClose={() => setNotice(null)}
                palette={palette}
              />
            )}

            {registry?.error !== null && registry?.error !== undefined ? (
              <Banner
                tone="warning"
                title="Release proofs are unavailable"
                message={`${registry.error} Games still open with their own account.`}
                actionLabel="Retry"
                onAction={() => setReloadToken((value) => value + 1)}
                palette={palette}
              />
            ) : null}

            {releaseErrorCount > 0 ? (
              <Banner
                tone="info"
                title="Some releases need attention"
                message={`${releaseErrorCount} ${releaseErrorCount === 1 ? "game could" : "games could"} not be verified. ${releaseErrorCount === 1 ? "It opens" : "They open"} independently.`}
                palette={palette}
              />
            ) : null}

            {!hasSharedAccount && officialCount > 0 ? (
              <Banner
                tone="info"
                title="Play verified games with one account"
                message="Connect the launcher account to share your identity, friends, and progress across every verified game."
                actionLabel={
                  onRequestSignIn === undefined ? undefined : "Open account"
                }
                onAction={onRequestSignIn}
                palette={palette}
              />
            ) : null}

            {showHero && hero !== null ? (
              <View
                style={[
                  styles.hero,
                  {
                    backgroundColor: palette.surface,
                    borderColor: withAlpha(hero.accent, 0.35),
                  },
                ]}
              >
                <View style={styles.heroTop}>
                  <GameArtwork game={hero} size={86} />
                  <View style={styles.heroCopy}>
                    <View style={styles.heroEyebrowRow}>
                      <Text
                        style={[styles.heroEyebrow, { color: palette.accent }]}
                      >
                        Featured
                      </Text>
                      <ReleaseBadge
                        official={registry?.games.has(hero.id) ?? false}
                        palette={palette}
                      />
                    </View>
                    <Text style={[styles.heroTitle, { color: palette.text }]}>
                      {hero.name}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={[styles.heroTagline, { color: palette.muted }]}
                    >
                      {hero.tagline}
                    </Text>
                  </View>
                </View>
                <Text
                  numberOfLines={3}
                  style={[styles.heroDescription, { color: palette.muted }]}
                >
                  {hero.description}
                </Text>
                <View style={styles.heroFooter}>
                  <View style={styles.heroMeta}>
                    {hero.capabilities.slice(0, 2).map((capability) => (
                      <View
                        key={capability}
                        style={[
                          styles.metaChip,
                          {
                            backgroundColor: palette.raised,
                            borderColor: palette.border,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.metaText, { color: palette.muted }]}
                        >
                          {CAPABILITY_LABELS[capability] ?? capability}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Play ${hero.name}`}
                    onPress={() => openGame(hero)}
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.primaryButton,
                      {
                        backgroundColor: palette.accent,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.primaryButtonText,
                        { color: palette.accentText },
                      ]}
                    >
                      Play
                    </Text>
                    <LauncherIcon
                      name="arrow-right"
                      size={17}
                      color={palette.accentText}
                    />
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View style={styles.searchRow}>
              <View
                style={[
                  styles.searchField,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <LauncherIcon name="search" size={18} color={palette.muted} />
                <TextInput
                  accessibilityLabel="Search games"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={setQuery}
                  placeholder="Search games"
                  placeholderTextColor={palette.muted}
                  returnKeyType="search"
                  selectionColor={palette.accent}
                  style={[styles.searchInput, { color: palette.text }]}
                  value={query}
                />
                {query.length === 0 ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Clear search"
                    hitSlop={8}
                    onPress={() => setQuery("")}
                    style={styles.searchClear}
                  >
                    <LauncherIcon name="close" size={15} color={palette.muted} />
                  </Pressable>
                )}
              </View>
            </View>

            <ScrollView
              horizontal
              contentContainerStyle={styles.filterRow}
              showsHorizontalScrollIndicator={false}
            >
              {FILTERS.map((option) => {
                const selected = filter === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setFilter(option.id)}
                    style={({ pressed }: { pressed: boolean }) => [
                      styles.filterChip,
                      {
                        backgroundColor: selected
                          ? palette.text
                          : palette.surface,
                        borderColor: selected
                          ? palette.text
                          : palette.border,
                        opacity: pressed ? 0.72 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterText,
                        {
                          color: selected
                            ? palette.background
                            : palette.muted,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Library
              </Text>
              <Text style={[styles.sectionCount, { color: palette.muted }]}>
                {availableGames.length} available
              </Text>
            </View>

            {availableGames.length === 0 ? (
              <View style={styles.emptyState}>
                <View
                  style={[
                    styles.emptyIcon,
                    {
                      backgroundColor: palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <LauncherIcon name="search" size={25} color={palette.muted} />
                </View>
                <Text style={[styles.emptyTitle, { color: palette.text }]}>
                  No games match
                </Text>
                <Text style={[styles.emptyText, { color: palette.muted }]}>
                  Try a different search or filter.
                </Text>
              </View>
            ) : (
              availableGames.map((game) => (
                <GameCard
                  key={game.id}
                  game={game}
                  official={registry?.games.has(game.id) ?? false}
                  palette={palette}
                  onPress={() => openGame(game)}
                />
              ))
            )}

            {comingSoonGames.length > 0 ? (
              <>
                <View style={styles.sectionHeader}>
                  <Text style={[styles.sectionTitle, { color: palette.text }]}>
                    Coming soon
                  </Text>
                  <Text style={[styles.sectionCount, { color: palette.muted }]}>
                    {comingSoonGames.length}
                  </Text>
                </View>
                {comingSoonGames.map((game) => (
                  <GameCard
                    key={game.id}
                    game={game}
                    official={false}
                    palette={palette}
                    onPress={() => undefined}
                  />
                ))}
              </>
            ) : null}

            <View style={styles.footer}>
              <LauncherIcon name="shield" size={13} color={palette.muted} />
              <Text style={[styles.footerText, { color: palette.muted }]}>
                Signed releases are verified before the shared account is used.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 44,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  brandOrbit: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
  },
  brandCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  brandCopy: { flex: 1 },
  brandTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  brandSubtitle: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    letterSpacing: 0.5,
  },
  accountChip: {
    maxWidth: 124,
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  accountText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  statusRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  statusPill: {
    minHeight: 28,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  libraryCount: {
    fontSize: 11,
    fontWeight: "500",
  },
  loadingCard: {
    marginTop: 28,
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 42,
  },
  loadingMark: {
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingTitle: {
    marginTop: 20,
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  loadingText: {
    marginTop: 8,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
    maxWidth: 300,
  },
  banner: {
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bannerIcon: {
    marginTop: 1,
  },
  bannerCopy: { flex: 1 },
  bannerTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  bannerMessage: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 17,
  },
  bannerAction: {
    minHeight: 30,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerActionText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  bannerClose: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    marginTop: 22,
    borderRadius: 26,
    borderWidth: 1,
    padding: 18,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  heroCopy: { flex: 1 },
  heroEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  heroTitle: {
    marginTop: 5,
    fontSize: 27,
    fontWeight: "700",
    letterSpacing: -0.4,
  },
  heroTagline: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 18,
  },
  heroDescription: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 20,
  },
  heroFooter: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  heroMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    flex: 1,
  },
  artwork: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  artRing: {
    position: "absolute",
    borderWidth: 1,
  },
  artDiamond: {
    position: "absolute",
    borderWidth: 1,
    transform: [{ rotate: "18deg" }],
  },
  badge: {
    minHeight: 20,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  primaryButton: {
    minHeight: 42,
    borderRadius: 21,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  searchRow: { marginTop: 20 },
  searchField: {
    minHeight: 48,
    borderRadius: 17,
    borderWidth: 1,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchClear: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  filterRow: {
    paddingTop: 12,
    paddingBottom: 2,
    gap: 8,
  },
  filterChip: {
    minHeight: 32,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  filterText: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.25,
  },
  sectionHeader: {
    marginTop: 26,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: -0.15,
  },
  sectionCount: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  gameCard: {
    minHeight: 92,
    borderRadius: 22,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  gameCardCopy: { flex: 1 },
  gameTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gameTitle: {
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.1,
  },
  gameTagline: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 16,
  },
  metaRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  metaChip: {
    minHeight: 19,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  metaText: {
    fontSize: 8,
    fontWeight: "600",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  versionText: {
    marginLeft: 2,
    fontSize: 9,
    fontWeight: "500",
  },
  gameCardTrailing: {
    width: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyState: {
    marginTop: 28,
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 30,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    marginTop: 16,
    fontSize: 17,
    fontWeight: "700",
  },
  emptyText: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    maxWidth: 280,
  },
  footer: {
    marginTop: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  footerText: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 0.15,
  },
  gameRoot: { flex: 1 },
  gameChromeSafe: {
    borderBottomWidth: 1,
  },
  gameChrome: {
    minHeight: 52,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  gameBack: {
    minHeight: 36,
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  gameBackText: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  gameChromeTitle: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  gameChromeName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  gameChromeSpacer: {
    width: 76,
  },
  webView: { flex: 1 },
});
