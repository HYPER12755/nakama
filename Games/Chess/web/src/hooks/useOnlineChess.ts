import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Client,
  Session,
  type MatchData,
  type MatchmakerMatched,
  type Socket,
} from "@heroiclabs/nakama-js";
import type { GameHostConfig } from "@moongames/game-sdk";
import type {
  ChessState,
  Color,
  PromotionPiece,
  Square,
} from "@moongames/chess-core";
import {
  ONLINE_OP,
  TIME_CONTROLS,
  clockForColor,
  defaultServerAddress,
  normalizedOnlineState,
  parseServerAddress,
  pgnFromHistory,
  type OnlineClock,
  type OnlineConnectionStatus,
  type OnlineDrawOffer,
  type OnlineHistoryEntry,
  type OnlineLeaderboardEntry,
  type OnlineLeaderboardPayload,
  type OnlineProfile,
  type OnlineProfilePayload,
  type OnlineRpcResponse,
  type OnlineSessionInfo,
  type OnlineStatePayload,
  type OnlineTimeControl,
} from "../lib/onlineProtocol";

const DEVICE_ID_KEY = "moongames.chess.deviceId";
const SERVER_ADDRESS_KEY = "moongames.chess.serverAddress";
const TIME_CONTROL_KEY = "moongames.chess.timeControl";
const MATCH_ID_KEY = "moongames.chess.matchId";
const SPECTATE_KEY = "moongames.chess.spectate";
const QUICK_MATCH_FALLBACK_MS = 5000;

export interface PendingOnlinePromotion {
  from: Square;
  to: Square;
  color: Color;
}

export interface OnlineChessController {
  connection: OnlineConnectionStatus;
  session: OnlineSessionInfo | null;
  serverAddress: string;
  setServerAddress: (value: string) => void;
  timeControlId: string;
  setTimeControlId: (value: string) => void;
  timeControl: OnlineTimeControl;
  matchId: string | null;
  serverState: OnlineStatePayload | null;
  myColor: Color | null;
  players: OnlineStatePayload["players"];
  spectators: OnlineStatePayload["spectators"];
  spectating: boolean;
  displayClock: { whiteMs: number; blackMs: number } | null;
  drawOffer: OnlineDrawOffer | null;
  selected: Square | null;
  legalTargets: Square[];
  checkSquare: Square | null;
  pendingPromotion: PendingOnlinePromotion | null;
  error: string | null;
  canAct: boolean;
  matchmaking: boolean;
  matchmakingSeconds: number;
  profile: OnlineProfile | null;
  history: OnlineHistoryEntry[];
  leaderboard: OnlineLeaderboardEntry[];
  myLeaderboard: OnlineLeaderboardEntry | null;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => void;
  connect: () => Promise<void>;
  disconnect: () => void;
  quickMatch: () => Promise<void>;
  cancelQuickMatch: () => void;
  createPrivateMatch: () => Promise<void>;
  joinMatch: (
    matchId: string,
    options?: { spectator?: boolean },
  ) => Promise<void>;
  leaveMatch: () => Promise<void>;
  selectSquare: (square: Square) => void;
  choosePromotion: (piece: PromotionPiece) => void;
  cancelPromotion: () => void;
  resign: () => void;
  offerDraw: () => void;
  acceptDraw: () => void;
  declineDraw: () => void;
  requestState: () => void;
  pgn: () => string;
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing or embedded webviews.
  }
}

function rememberMatchId(matchId: string | null): void {
  try {
    if (matchId === null) {
      window.localStorage.removeItem(MATCH_ID_KEY);
    } else {
      window.localStorage.setItem(MATCH_ID_KEY, matchId);
    }
  } catch {
    // Storage can be unavailable in private browsing or embedded webviews.
  }
}

function rememberSpectating(value: boolean): void {
  try {
    if (value) {
      window.localStorage.setItem(SPECTATE_KEY, "1");
    } else {
      window.localStorage.removeItem(SPECTATE_KEY);
    }
  } catch {
    // Storage can be unavailable in private browsing or embedded webviews.
  }
}

function storedSpectating(): boolean {
  return readStorage(SPECTATE_KEY) === "1";
}

function getDeviceId(): string {
  const existing = readStorage(DEVICE_ID_KEY);
  if (existing !== null && existing.length > 0) {
    return existing;
  }

  const created =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeStorage(DEVICE_ID_KEY, created);
  return created;
}

function decodeMatchData(data: Uint8Array | string): unknown {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  return JSON.parse(new TextDecoder().decode(data));
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof Error && cause.message.length > 0) {
    return cause.message;
  }
  if (typeof cause === "string" && cause.length > 0) {
    return cause;
  }
  return fallback;
}

function serverKey(): string {
  return (import.meta.env.VITE_NAKAMA_SERVER_KEY as string | undefined) ??
    "defaultkey";
}

function hostServerAddress(config: GameHostConfig | null | undefined): string | null {
  const nakama = config?.nakama;
  if (nakama === undefined) {
    return null;
  }
  return `${nakama.useSSL ? "https" : "http"}://${nakama.host}:${nakama.port}`;
}

function hostSession(config: GameHostConfig | null | undefined): Session | null {
  const token = config?.session?.token;
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  try {
    return Session.restore(token, config?.session?.refreshToken ?? "");
  } catch {
    return null;
  }
}

interface PendingMatchmaker {
  resolve: (matched: MatchmakerMatched | null) => void;
  reject: (error: Error) => void;
  ticket: string | null;
  timer: number;
  fallbackTimer: number | null;
}

export function useOnlineChess(
  hostConfig?: GameHostConfig | null,
): OnlineChessController {
  const [connection, setConnection] =
    useState<OnlineConnectionStatus>("offline");
  const [session, setSession] = useState<OnlineSessionInfo | null>(null);
  const [serverAddress, setServerAddressState] = useState<string>(() => {
    return readStorage(SERVER_ADDRESS_KEY) ?? defaultServerAddress();
  });
  const [timeControlId, setTimeControlIdState] = useState<string>(() => {
    return readStorage(TIME_CONTROL_KEY) ?? "5+0";
  });
  const [matchId, setMatchId] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<OnlineStatePayload | null>(null);
  const [drawOffer, setDrawOffer] = useState<OnlineDrawOffer | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingOnlinePromotion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [matchmaking, setMatchmaking] = useState(false);
  const [matchmakingSeconds, setMatchmakingSeconds] = useState(0);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [profile, setProfile] = useState<OnlineProfile | null>(null);
  const [history, setHistory] = useState<OnlineHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<OnlineLeaderboardEntry[]>([]);
  const [myLeaderboard, setMyLeaderboard] =
    useState<OnlineLeaderboardEntry | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileRefresh, setProfileRefresh] = useState(0);

  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const hostConfigRef = useRef<GameHostConfig | null>(hostConfig ?? null);
  const serverAddressTouchedRef = useRef(false);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const matchmakerRef = useRef<PendingMatchmaker | null>(null);
  const matchmakingActiveRef = useRef(false);
  const matchmakingRunRef = useRef(0);
  const clockOffsetRef = useRef(0);

  useEffect(() => {
    if (!matchmaking) {
      setMatchmakingSeconds(0);
      return;
    }

    setMatchmakingSeconds(0);
    const timer = window.setInterval(() => {
      setMatchmakingSeconds((seconds) => seconds + 1);
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [matchmaking]);

  const timeControl = useMemo<OnlineTimeControl>(() => {
    const found =
      TIME_CONTROLS.find((control) => control.id === timeControlId) ??
      TIME_CONTROLS[1];
    return {
      initialMs: found.initialMs,
      incrementMs: found.incrementMs,
    };
  }, [timeControlId]);

  useEffect(() => {
    if (
      connection !== "connected" ||
      serverState === null ||
      !serverState.match.started ||
      serverState.result !== null
    ) {
      return;
    }

    setNowTick(Date.now());
    const timer = window.setInterval(() => setNowTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [connection, serverState?.match.started, serverState?.result]);

  const setServerAddress = useCallback((value: string) => {
    serverAddressTouchedRef.current = true;
    setServerAddressState(value);
    writeStorage(SERVER_ADDRESS_KEY, value);
  }, []);

  const setTimeControlId = useCallback((value: string) => {
    setTimeControlIdState(value);
    writeStorage(TIME_CONTROL_KEY, value);
  }, []);

  useEffect(() => {
    hostConfigRef.current = hostConfig ?? null;
    const address = hostServerAddress(hostConfig);
    if (
      address !== null &&
      connection === "offline" &&
      !serverAddressTouchedRef.current
    ) {
      setServerAddressState(address);
    }
  }, [connection, hostConfig]);

  useEffect(() => {
    const next = hostConfig?.session;
    const current = sessionRef.current;
    if (
      socketRef.current !== null &&
      current !== null &&
      typeof next?.token === "string" &&
      next.token.length > 0
    ) {
      try {
        current.update(next.token, next.refreshToken ?? current.refresh_token);
      } catch {
        // A malformed host session is ignored; reconnect will re-authenticate.
      }
    }
  }, [hostConfig?.session?.refreshToken, hostConfig?.session?.token]);

  const applyPayload = useCallback((payload: OnlineStatePayload) => {
    const normalized = normalizedOnlineState(payload);
    setServerState(normalized);
    setDrawOffer(normalized.drawOffer ?? null);
    setSelected(null);
    setPendingPromotion(null);
    setError(null);

    if (normalized.match.id) {
      matchIdRef.current = normalized.match.id;
      setMatchId(normalized.match.id);
      rememberMatchId(normalized.match.id);
    }

    if (normalized.serverTime !== undefined) {
      clockOffsetRef.current = normalized.serverTime - Date.now();
    }

    if (normalized.result !== null) {
      setProfileRefresh((current) => current + 1);
    }
  }, []);

  const handleMatchData = useCallback(
    (matchData: MatchData) => {
      let payload: unknown;
      try {
        payload = decodeMatchData(matchData.data);
      } catch {
        return;
      }

      if (typeof payload !== "object" || payload === null) {
        return;
      }

      switch (matchData.op_code) {
        case ONLINE_OP.STATE:
        case ONLINE_OP.MATCH_STARTED:
        case ONLINE_OP.MOVE:
        case ONLINE_OP.GAME_OVER: {
          applyPayload(payload as OnlineStatePayload);
          break;
        }
        case ONLINE_OP.CLOCK: {
          const clock = payload as OnlineClock;
          if (clock.serverTime !== undefined) {
            clockOffsetRef.current = clock.serverTime - Date.now();
          }
          setServerState((current) => {
            if (current === null) {
              return current;
            }
            return {
              ...current,
              clock,
              players: current.players.map((player) => ({
                ...player,
                remainingMs:
                  player.color === "w" ? clock.whiteMs : clock.blackMs,
              })),
              serverTime: clock.serverTime ?? current.serverTime,
            };
          });
          break;
        }
        case ONLINE_OP.DRAW_OFFER: {
          const offer = payload as OnlineDrawOffer;
          setDrawOffer(offer);
          break;
        }
        case ONLINE_OP.DRAW_DECLINED: {
          setDrawOffer(null);
          break;
        }
        case ONLINE_OP.ERROR: {
          const message = (payload as { message?: unknown }).message;
          setError(
            typeof message === "string" ? message : "The server rejected that action.",
          );
          break;
        }
        case ONLINE_OP.PLAYER_JOINED: {
          setError(null);
          break;
        }
        case ONLINE_OP.PLAYER_LEFT: {
          break;
        }
        default:
          break;
      }
    },
    [applyPayload],
  );

  const failPendingMatchmaker = useCallback((message: string) => {
    const pending = matchmakerRef.current;
    if (pending === null) {
      return;
    }
    window.clearTimeout(pending.timer);
    if (pending.fallbackTimer !== null) {
      window.clearTimeout(pending.fallbackTimer);
    }
    matchmakerRef.current = null;
    pending.reject(new Error(message));
  }, []);

  const disconnect = useCallback(() => {
    matchmakingRunRef.current += 1;
    failPendingMatchmaker("Disconnected while searching for a match.");
    const socket = socketRef.current;
    if (socket !== null) {
      try {
        socket.disconnect(false);
      } catch {
        // Socket may already be closed.
      }
    }

    socketRef.current = null;
    clientRef.current = null;
    sessionRef.current = null;
    setConnection("offline");
    setSession(null);
    setServerState(null);
    setMatchId(null);
    matchIdRef.current = null;
    rememberMatchId(null);
    rememberSpectating(false);
    setDrawOffer(null);
    setSelected(null);
    setPendingPromotion(null);
    matchmakingActiveRef.current = false;
    setMatchmaking(false);
    setError(null);
    setProfile(null);
    setHistory([]);
    setLeaderboard([]);
    setMyLeaderboard(null);
    setProfileError(null);
    setProfileLoading(false);
  }, [failPendingMatchmaker]);

  const connect = useCallback((): Promise<void> => {
    if (socketRef.current !== null) {
      return Promise.resolve();
    }

    if (connectPromiseRef.current !== null) {
      return connectPromiseRef.current;
    }

    const promise = (async () => {
      setConnection("connecting");
      setError(null);

      try {
        const activeHost = hostConfigRef.current;
        const address = parseServerAddress(
          hostServerAddress(activeHost) ?? serverAddress,
        );
        const client = new Client(
          activeHost?.nakama?.serverKey ?? serverKey(),
          address.host,
          address.port,
          address.useSSL,
        );
        const restored = hostSession(activeHost);
        let sessionResult: Session;
        if (restored !== null) {
          sessionResult = restored;
          const now = Date.now() / 1000;
          if (
            restored.isexpired(now) &&
            !restored.isrefreshexpired(now) &&
            restored.refresh_token.length > 0
          ) {
            sessionResult = await client.sessionRefresh(restored);
          }
        } else {
          sessionResult = await client.authenticateDevice(getDeviceId(), true);
        }
        const socket = client.createSocket(address.useSSL, false);

        socket.onmatchdata = handleMatchData;
        socket.onmatchmakermatched = (matched) => {
          const pending = matchmakerRef.current;
          if (pending === null) {
            return;
          }
          window.clearTimeout(pending.timer);
          if (pending.fallbackTimer !== null) {
            window.clearTimeout(pending.fallbackTimer);
          }
          matchmakerRef.current = null;
          pending.resolve(matched);
        };
        socket.onerror = () => {
          setError("The realtime connection reported an error.");
        };
        socket.ondisconnect = () => {
          failPendingMatchmaker(
            "Disconnected while searching for a match.",
          );
          socketRef.current = null;
          clientRef.current = null;
          sessionRef.current = null;
          setConnection("offline");
          setProfileLoading(false);
          setError("Disconnected from the server. Reconnect to resume.");
        };

        await socket.connect(sessionResult, true);

        clientRef.current = client;
        sessionRef.current = sessionResult;
        socketRef.current = socket;

        setSession({
          userId: sessionResult.user_id ?? "",
          username: sessionResult.username ?? "Player",
        });
        setConnection("connected");

        const currentMatchId =
          matchIdRef.current ?? readStorage(MATCH_ID_KEY);
        if (currentMatchId !== null && currentMatchId.length > 0) {
          const reconnectAsSpectator = storedSpectating();
          try {
            await socket.joinMatch(
              currentMatchId,
              undefined,
              reconnectAsSpectator ? { spectate: "1" } : undefined,
            );
            matchIdRef.current = currentMatchId;
            setMatchId(currentMatchId);
            rememberMatchId(currentMatchId);
            rememberSpectating(reconnectAsSpectator);
          } catch {
            // The match ended, expired, or was created by another account.
            matchIdRef.current = null;
            setMatchId(null);
            setServerState(null);
            rememberMatchId(null);
            rememberSpectating(false);
          }
        }
      } catch (cause) {
        const activeSocket = socketRef.current;
        if (activeSocket !== null) {
          try {
            activeSocket.disconnect(false);
          } catch {
            // Ignore cleanup errors.
          }
        }
        socketRef.current = null;
        clientRef.current = null;
        sessionRef.current = null;
        setConnection("error");
        setError(errorMessage(cause, "Could not connect to the game server."));
        throw cause;
      }
    })();

    connectPromiseRef.current = promise.finally(() => {
      connectPromiseRef.current = null;
    });
    return connectPromiseRef.current;
  }, [failPendingMatchmaker, handleMatchData, serverAddress]);

  useEffect(() => {
    return () => {
      const socket = socketRef.current;
      if (socket !== null) {
        try {
          socket.disconnect(false);
        } catch {
          // Ignore cleanup errors.
        }
      }
    };
  }, []);

  useEffect(() => {
    if (connection !== "connected" || session === null) {
      return;
    }

    const client = clientRef.current;
    const currentSession = sessionRef.current;
    if (client === null || currentSession === null) {
      return;
    }

    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);

    void (async () => {
      const [profileResult, leaderboardResult] = await Promise.allSettled([
        client.rpc(currentSession, "chess_get_profile", {}),
        client.rpc(currentSession, "chess_get_leaderboard", { limit: 5 }),
      ]);

      if (cancelled) {
        return;
      }

      let nextError: string | null = null;

      if (profileResult.status === "fulfilled") {
        const payload = (profileResult.value.payload ??
          {}) as OnlineProfilePayload;
        if (payload.ok === true && payload.profile) {
          setProfile(payload.profile);
          setHistory(Array.isArray(payload.history) ? payload.history : []);
        } else {
          nextError =
            payload.error?.message ?? "Could not load your Chess profile.";
        }
      } else {
        nextError = errorMessage(
          profileResult.reason,
          "Could not load your Chess profile.",
        );
      }

      if (leaderboardResult.status === "fulfilled") {
        const payload = (leaderboardResult.value.payload ??
          {}) as OnlineLeaderboardPayload;
        if (payload.ok === true) {
          setLeaderboard(
            Array.isArray(payload.entries) ? payload.entries : [],
          );
          setMyLeaderboard(payload.me ?? null);
        } else if (nextError === null) {
          nextError =
            payload.error?.message ?? "Could not load the rating leaderboard.";
        }
      } else if (nextError === null) {
        nextError = errorMessage(
          leaderboardResult.reason,
          "Could not load the rating leaderboard.",
        );
      }

      setProfileError(nextError);
      setProfileLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [connection, profileRefresh, session]);

  const refreshProfile = useCallback(() => {
    setProfileRefresh((current) => current + 1);
  }, []);

  const requireSocket = useCallback(async (): Promise<Socket> => {
    if (socketRef.current === null) {
      await connect();
    }

    if (socketRef.current === null) {
      throw new Error("Not connected to the game server.");
    }

    return socketRef.current;
  }, [connect]);

  const callRpc = useCallback(
    async (
      id: "chess_quick_match" | "chess_create_private_match",
      input: object,
    ): Promise<OnlineRpcResponse> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        throw new Error("Not connected to the game server.");
      }

      const response = await client.rpc(currentSession, id, input);
      return (response.payload ?? { ok: false }) as OnlineRpcResponse;
    },
    [],
  );

  const joinMatch = useCallback(
    async (rawMatchId: string, options: { spectator?: boolean } = {}) => {
      const nextMatchId = rawMatchId.trim();
      if (nextMatchId.length === 0) {
        throw new Error("Enter a match ID.");
      }

      const socket = await requireSocket();
      const currentMatchId = matchIdRef.current;
      if (currentMatchId !== null && currentMatchId !== nextMatchId) {
        try {
          await socket.leaveMatch(currentMatchId);
        } catch {
          // The previous match may already be gone.
        }
      }

      setError(null);
      await socket.joinMatch(
        nextMatchId,
        undefined,
        options.spectator ? { spectate: "1" } : undefined,
      );
      matchIdRef.current = nextMatchId;
      setMatchId(nextMatchId);
      rememberMatchId(nextMatchId);
      rememberSpectating(options.spectator === true);
    },
    [requireSocket],
  );

  const quickMatch = useCallback(async () => {
    if (matchmakingActiveRef.current) {
      setError("A quick match search is already running.");
      return;
    }

    const run = matchmakingRunRef.current + 1;
    matchmakingRunRef.current = run;
    matchmakingActiveRef.current = true;
    setMatchmaking(true);

    let socket: Socket | null = null;
    try {
      socket = await requireSocket();
      const activeSocket = socket;
      if (run !== matchmakingRunRef.current) {
        return;
      }
      setError(null);

      const label = `${Math.round(timeControl.initialMs / 60000)}+${Math.round(
        timeControl.incrementMs / 1000,
      )}`;
      const timeControlKey = `${timeControl.initialMs}_${timeControl.incrementMs}`;
      const query = `+properties.game:chess +properties.timeControlKey:${timeControlKey}`;
      let resolveMatched: (matched: MatchmakerMatched | null) => void = () => {
        // Replaced synchronously by the Promise constructor below.
      };
      let rejectMatched: (error: Error) => void = () => {
        // Replaced synchronously by the Promise constructor below.
      };
      const matchedPromise = new Promise<MatchmakerMatched | null>(
        (resolve, reject) => {
          resolveMatched = resolve;
          rejectMatched = reject;
        },
      );
      const pending: PendingMatchmaker = {
        resolve: resolveMatched,
        reject: rejectMatched,
        ticket: null,
        timer: 0,
        fallbackTimer: null,
      };
      pending.timer = window.setTimeout(() => {
        if (matchmakerRef.current === pending) {
          matchmakerRef.current = null;
          if (pending.fallbackTimer !== null) {
            window.clearTimeout(pending.fallbackTimer);
          }
          if (pending.ticket !== null) {
            void activeSocket.removeMatchmaker(pending.ticket).catch(() => {
              // The ticket may already be gone.
            });
          }
        }
        pending.reject(new Error("Matchmaking timed out. Try again."));
      }, 60000);
      matchmakerRef.current = pending;

      const ticket = await activeSocket.addMatchmaker(query, 2, 2, {
        game: "chess",
        timeControl: label,
        timeControlKey,
      });
      if (matchmakerRef.current !== pending) {
        // The search was cancelled or matched while the ticket was being
        // created. Remove this run's ticket without touching a newer search.
        try {
          await activeSocket.removeMatchmaker(ticket.ticket);
        } catch {
          // The ticket may already be gone.
        }
      } else if (run !== matchmakingRunRef.current) {
        matchmakerRef.current = null;
        window.clearTimeout(pending.timer);
        try {
          await activeSocket.removeMatchmaker(ticket.ticket);
        } catch {
          // The ticket may already be gone.
        }
        pending.reject(new Error("Matchmaking cancelled."));
      } else {
        pending.ticket = ticket.ticket;
        // The matchmaker is great at pairing players who are searching at the
        // same moment. In a small game, however, two players often arrive a
        // minute apart. If no atomic pairing happens quickly, open a normal
        // quick table instead so the next player can join it later.
        pending.fallbackTimer = window.setTimeout(() => {
          if (matchmakerRef.current !== pending) {
            return;
          }
          matchmakerRef.current = null;
          window.clearTimeout(pending.timer);
          if (pending.ticket !== null) {
            void activeSocket
              .removeMatchmaker(pending.ticket)
              .catch(() => {
                // The ticket may already be gone.
              });
          }
          pending.resolve(null);
        }, QUICK_MATCH_FALLBACK_MS);
      }

      const matched = await matchedPromise;
      if (run !== matchmakingRunRef.current) {
        return;
      }

      if (matched !== null) {
        await activeSocket.joinMatch(matched.match_id, matched.token);
        if (run !== matchmakingRunRef.current) {
          try {
            await activeSocket.leaveMatch(matched.match_id);
          } catch {
            // The match may already have ended.
          }
          return;
        }
        matchIdRef.current = matched.match_id;
        setMatchId(matched.match_id);
        rememberMatchId(matched.match_id);
        rememberSpectating(false);
        return;
      }

      const result = await callRpc("chess_quick_match", { timeControl });
      if (run !== matchmakingRunRef.current) {
        return;
      }
      if (!result.ok || !result.matchId) {
        throw new Error(
          result.error?.message ?? "Could not open a quick match.",
        );
      }
      await joinMatch(result.matchId);
    } catch (cause) {
      if (run !== matchmakingRunRef.current) {
        return;
      }
      const pending = matchmakerRef.current;
      if (pending !== null) {
        window.clearTimeout(pending.timer);
        if (pending.fallbackTimer !== null) {
          window.clearTimeout(pending.fallbackTimer);
        }
        matchmakerRef.current = null;
        if (pending.ticket !== null && socket !== null) {
          try {
            await socket.removeMatchmaker(pending.ticket);
          } catch {
            // The ticket may already be gone.
          }
        }
      }
      setError(errorMessage(cause, "Could not start a quick match."));
    } finally {
      if (matchmakingRunRef.current === run) {
        matchmakingActiveRef.current = false;
        setMatchmaking(false);
      }
    }
  }, [callRpc, joinMatch, requireSocket, timeControl]);

  const cancelQuickMatch = useCallback(() => {
    if (!matchmakingActiveRef.current) {
      return;
    }

    matchmakingRunRef.current += 1;
    matchmakingActiveRef.current = false;
    setMatchmaking(false);
    setError(null);

    const pending = matchmakerRef.current;
    if (pending === null) {
      return;
    }

    matchmakerRef.current = null;
    window.clearTimeout(pending.timer);
    if (pending.fallbackTimer !== null) {
      window.clearTimeout(pending.fallbackTimer);
    }
    if (pending.ticket !== null && socketRef.current !== null) {
      void socketRef.current.removeMatchmaker(pending.ticket).catch(() => {
        // The ticket may already be gone.
      });
    }
    pending.reject(new Error("Matchmaking cancelled."));
  }, []);

  const createPrivateMatch = useCallback(async () => {
    try {
      await requireSocket();
      setError(null);
      const result = await callRpc("chess_create_private_match", {
        timeControl,
      });
      if (!result.ok || !result.matchId) {
        throw new Error(
          result.error?.message ?? "Could not create a private match.",
        );
      }
      await joinMatch(result.matchId);
    } catch (cause) {
      setError(errorMessage(cause, "Could not create a private match."));
    }
  }, [callRpc, joinMatch, requireSocket, timeControl]);

  const leaveMatch = useCallback(async () => {
    const pending = matchmakerRef.current;
    if (pending !== null) {
      matchmakingRunRef.current += 1;
      matchmakingActiveRef.current = false;
      setMatchmaking(false);
      window.clearTimeout(pending.timer);
      if (pending.fallbackTimer !== null) {
        window.clearTimeout(pending.fallbackTimer);
      }
      matchmakerRef.current = null;
      if (pending.ticket !== null && socketRef.current !== null) {
        try {
          await socketRef.current.removeMatchmaker(pending.ticket);
        } catch {
          // The ticket may already be gone.
        }
      }
      pending.reject(new Error("Matchmaking cancelled."));
    }

    const currentMatchId = matchIdRef.current;
    if (currentMatchId !== null && socketRef.current !== null) {
      try {
        await socketRef.current.leaveMatch(currentMatchId);
      } catch {
        // The match may already have ended.
      }
    }

    matchIdRef.current = null;
    setMatchId(null);
    setServerState(null);
    rememberMatchId(null);
    rememberSpectating(false);
    setDrawOffer(null);
    setSelected(null);
    setPendingPromotion(null);
    setError(null);
  }, []);

  const sendMatchState = useCallback(
    (opCode: number, payload: object) => {
      const currentMatchId = matchIdRef.current;
      const socket = socketRef.current;
      if (currentMatchId === null) {
        setError("Join a match first.");
        return;
      }
      if (socket === null) {
        setError("You are disconnected. Reconnect to continue the match.");
        return;
      }

      void socket
        .sendMatchState(currentMatchId, opCode, JSON.stringify(payload))
        .catch((cause: unknown) => {
          setError(errorMessage(cause, "Could not send the action."));
        });
    },
    [],
  );

  const myColor = useMemo<Color | null>(() => {
    if (session === null || serverState === null) {
      return null;
    }
    return (
      serverState.players.find((player) => player.userId === session.userId)
        ?.color ?? null
    );
  }, [serverState, session]);

  const spectating = useMemo(() => {
    if (session === null || serverState === null) {
      return false;
    }
    return serverState.spectators.some(
      (spectator) => spectator.userId === session.userId,
    );
  }, [serverState, session]);

  const canAct =
    connection === "connected" &&
    myColor !== null &&
    serverState !== null &&
    serverState.match.started &&
    serverState.result === null &&
    (serverState.state.status === "active" ||
      serverState.state.status === "check") &&
    serverState.state.turn === myColor;

  const sendMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      sendMatchState(ONLINE_OP.MOVE_REQUEST, {
        from,
        to,
        promotion,
      });
      setSelected(null);
      setPendingPromotion(null);
      setError(null);
    },
    [sendMatchState],
  );

  const selectSquare = useCallback(
    (square: Square) => {
      if (serverState === null || myColor === null || pendingPromotion !== null) {
        return;
      }

      const state = serverState.state;
      const isTerminal =
        state.status === "checkmate" ||
        state.status === "stalemate" ||
        state.status === "draw" ||
        serverState.result !== null;

      if (isTerminal || !serverState.match.started) {
        return;
      }

      if (selected !== null) {
        const candidates = (state.legalMoves[selected] ?? []).filter(
          (move) => move.to === square,
        );

        if (candidates.length > 0) {
          if (candidates.some((move) => move.promotion !== undefined)) {
            setPendingPromotion({
              from: selected,
              to: square,
              color: myColor,
            });
            setError(null);
            return;
          }

          sendMove(selected, square);
          return;
        }
      }

      const piece = state.board.find((candidate) => candidate.square === square);
      if (piece?.color === myColor && state.turn === myColor) {
        setSelected((current) => (current === square ? null : square));
        setError(null);
        return;
      }

      setSelected(null);
    },
    [myColor, pendingPromotion, sendMove, selected, serverState],
  );

  const choosePromotion = useCallback(
    (promotion: PromotionPiece) => {
      if (pendingPromotion === null) {
        return;
      }
      sendMove(pendingPromotion.from, pendingPromotion.to, promotion);
    },
    [pendingPromotion, sendMove],
  );

  const cancelPromotion = useCallback(() => {
    setPendingPromotion(null);
    setSelected(null);
  }, []);

  const resign = useCallback(() => {
    sendMatchState(ONLINE_OP.RESIGN, {});
  }, [sendMatchState]);

  const offerDraw = useCallback(() => {
    sendMatchState(ONLINE_OP.DRAW_OFFER_REQUEST, {});
  }, [sendMatchState]);

  const acceptDraw = useCallback(() => {
    sendMatchState(ONLINE_OP.DRAW_ACCEPT, {});
  }, [sendMatchState]);

  const declineDraw = useCallback(() => {
    sendMatchState(ONLINE_OP.DRAW_DECLINE, {});
  }, [sendMatchState]);

  const requestState = useCallback(() => {
    sendMatchState(ONLINE_OP.REQUEST_STATE, {});
  }, [sendMatchState]);

  const legalTargets = useMemo(() => {
    if (selected === null || serverState === null) {
      return [];
    }

    return [
      ...new Set(
        (serverState.state.legalMoves[selected] ?? []).map(
          (move) => move.to,
        ),
      ),
    ];
  }, [selected, serverState]);

  const checkSquare = useMemo(() => {
    if (serverState === null || !serverState.state.inCheck) {
      return null;
    }

    return (
      serverState.state.board.find(
        (piece) =>
          piece.type === "k" && piece.color === serverState.state.turn,
      )?.square ?? null
    );
  }, [serverState]);

  const serverNow = nowTick + clockOffsetRef.current;

  const displayClock = useMemo(() => {
    if (serverState === null) {
      return null;
    }

    return {
      whiteMs: clockForColor(serverState.clock, "w", serverNow),
      blackMs: clockForColor(serverState.clock, "b", serverNow),
    };
  }, [serverNow, serverState]);

  const pgn = useCallback(() => {
    return serverState === null ? "" : pgnFromHistory(serverState.state.history);
  }, [serverState]);

  return {
    connection,
    session,
    serverAddress,
    setServerAddress,
    timeControlId,
    setTimeControlId,
    timeControl,
    matchId,
    serverState,
    myColor,
    players: serverState?.players ?? [],
    spectators: serverState?.spectators ?? [],
    spectating,
    displayClock,
    drawOffer,
    selected,
    legalTargets,
    checkSquare,
    pendingPromotion,
    error,
    canAct,
    matchmaking,
    matchmakingSeconds,
    profile,
    history,
    leaderboard,
    myLeaderboard,
    profileLoading,
    profileError,
    refreshProfile,
    connect,
    disconnect,
    quickMatch,
    cancelQuickMatch,
    createPrivateMatch,
    joinMatch,
    leaveMatch,
    selectSquare,
    choosePromotion,
    cancelPromotion,
    resign,
    offerDraw,
    acceptDraw,
    declineDraw,
    requestState,
    pgn,
  };
}
