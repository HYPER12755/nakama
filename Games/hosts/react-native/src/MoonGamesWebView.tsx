import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Linking,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import {
  GAME_PROTOCOL_VERSION,
  createGameLaunchContext,
  type GameHostConfig,
  type GameSession,
  type GameTheme,
  type GameToHostMessage,
  type HostToGameMessage,
  type NakamaConnection,
  type TrustedBundleKeys,
} from "@moongames/game-sdk";
import {
  resolveGameBundle,
  type BundledFallback,
  type ResolvedBundle,
} from "./bundleManager";

export interface MoonGamesWebViewProps {
  gameId: string;
  manifestUrl?: string;
  hostProtocol?: number;
  trustedKeys: TrustedBundleKeys;
  bundledFallback?: BundledFallback;
  locale?: string;
  /** Query from a native deep link, for example `match=abc&spectate=1`. */
  launchQuery?: string;
  theme?: GameTheme;
  session?: GameSession;
  nakama?: NakamaConnection;
  style?: unknown;
  onReady?: (bundle: ResolvedBundle) => void;
  onExit?: (reason?: string) => void;
  onToast?: (message: string, level?: "info" | "success" | "error") => void;
  onSound?: (name: string) => void;
  onAnalytics?: (
    event: string,
    properties?: Record<string, unknown>,
  ) => void;
  onOpenUrl?: (url: string) => void;
  onRequestSessionRefresh?: () => void;
  onError?: (error: Error) => void;
}

const HAPTICS: Record<string, number | number[]> = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [10, 40, 10],
  error: [20, 50, 20],
};

const DEFAULT_THEME: GameTheme = { mode: "dark" };

function isGameMessage(value: unknown): value is GameToHostMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function MoonGamesWebView({
  gameId,
  manifestUrl,
  hostProtocol = 1,
  trustedKeys,
  bundledFallback,
  locale = "en",
  launchQuery,
  theme = DEFAULT_THEME,
  session,
  nakama,
  style,
  onReady,
  onExit,
  onToast,
  onSound,
  onAnalytics,
  onOpenUrl,
  onRequestSessionRefresh,
  onError,
}: MoonGamesWebViewProps) {
  const webViewRef = useRef<WebView | null>(null);
  const readyRef = useRef(false);
  const [bundle, setBundle] = useState<ResolvedBundle | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const trustedKeysKey = JSON.stringify(trustedKeys);
  const bundledFallbackKey = JSON.stringify(bundledFallback);
  const launch = useMemo(
    () => createGameLaunchContext(launchQuery),
    [launchQuery],
  );

  useEffect(() => {
    let cancelled = false;
    setBundle(null);
    setError(null);
    readyRef.current = false;

    resolveGameBundle({
      gameId,
      manifestUrl,
      hostProtocol,
      trustedKeys,
      bundledFallback,
      onLog: (message) => console.info(`[MoonGames] ${message}`),
    })
      .then((resolved) => {
        if (!cancelled) {
          setBundle(resolved);
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) {
          return;
        }
        const failure =
          cause instanceof Error ? cause : new Error(String(cause));
        setError(failure);
        onError?.(failure);
      });

    return () => {
      cancelled = true;
    };
    // The serialized keys keep object props from re-running the resolver on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, manifestUrl, hostProtocol, trustedKeysKey, bundledFallbackKey]);

  const postToGame = useCallback((message: HostToGameMessage) => {
    const payload = JSON.stringify(message);
    const script = `window.postMessage(${JSON.stringify(payload)}, "*"); true;`;
    webViewRef.current?.injectJavaScript(script);
  }, []);

  const sendInit = useCallback(() => {
    const config: GameHostConfig = {
      protocol: GAME_PROTOCOL_VERSION,
      gameId,
      locale,
      theme,
      session,
      nakama,
      launch,
    };
    postToGame({
      type: "init",
      protocol: GAME_PROTOCOL_VERSION,
      config,
    });
  }, [gameId, launch, locale, nakama, postToGame, session, theme]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.nativeEvent.data);
      } catch {
        return;
      }
      if (!isGameMessage(parsed)) {
        return;
      }

      switch (parsed.type) {
        case "ready":
          readyRef.current = true;
          sendInit();
          if (bundle !== null) {
            onReady?.(bundle);
          }
          break;
        case "exit":
          onExit?.(parsed.reason);
          break;
        case "toast":
          onToast?.(parsed.message, parsed.level);
          break;
        case "haptic":
          Vibration.vibrate(HAPTICS[parsed.pattern] ?? 10);
          break;
        case "sound":
          onSound?.(parsed.name);
          break;
        case "openUrl":
          void Linking.openURL(parsed.url).catch(() => {
            // Native URL handlers can reject; keep the WebView alive.
          });
          onOpenUrl?.(parsed.url);
          break;
        case "analytics":
          onAnalytics?.(parsed.event, parsed.properties);
          break;
        case "requestSessionRefresh":
          onRequestSessionRefresh?.();
          break;
      }
    },
    [
      bundle,
      onAnalytics,
      onExit,
      onOpenUrl,
      onReady,
      onRequestSessionRefresh,
      onSound,
      onToast,
      sendInit,
    ],
  );

  useEffect(() => {
    if (readyRef.current) {
      postToGame({ type: "theme", theme });
    }
  }, [postToGame, theme]);

  useEffect(() => {
    if (readyRef.current && session !== undefined) {
      postToGame({ type: "session", session });
    }
  }, [postToGame, session]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (!readyRef.current) {
        return;
      }
      postToGame({ type: state === "active" ? "resume" : "pause" });
    });
    return () => subscription.remove();
  }, [postToGame]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: "#081018" },
        centered: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        },
        error: { color: "#ffb4b4", textAlign: "center", lineHeight: 22 },
        webview: { flex: 1, backgroundColor: "#081018" },
      }),
    [],
  );

  if (error !== null) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>
          Could not start {gameId}. {error.message}
        </Text>
      </View>
    );
  }

  if (bundle === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.error}>Preparing {gameId}…</Text>
      </View>
    );
  }

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: bundle.entryUri }}
      originWhitelist={["*"]}
      allowFileAccess
      allowFileAccessFromFileURLs
      allowUniversalAccessFromFileURLs
      javaScriptEnabled
      domStorageEnabled
      mixedContentMode="compatibility"
      onMessage={handleMessage}
      onError={(event: { nativeEvent: { description: string } }) => {
        const failure = new Error(event.nativeEvent.description);
        setError(failure);
        onError?.(failure);
      }}
      style={[styles.webview, style]}
    />
  );
}
