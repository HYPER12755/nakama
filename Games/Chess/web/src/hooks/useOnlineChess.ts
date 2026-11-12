import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Client,
  Session,
  type MatchData,
  type MatchmakerMatched,
  type Socket,
} from "@heroiclabs/nakama-js";
import { MoonGamesSocialClient } from "@moongames/social";
import type {
  GameHostConfig,
  MoonGamesInvite,
  SocialFriend,
} from "@moongames/game-sdk";
import type {
  ChessState,
  Color,
  PromotionPiece,
  Square,
} from "@moongames/chess-core";
import {
  authErrorDetail,
  authErrorMessage,
  clearStoredEmailSession,
  consumeGuestIdentityLinked,
  emailAuthTransportSafe,
  markGuestIdentityLinked,
  normalizeEmail,
  readStoredEmailSession,
  storeEmailSession,
  validateEmail,
  validatePassword,
  validateUsername,
  type OnlineAuthAccount,
} from "../lib/auth";
import {
  ONLINE_OP,
  TIME_CONTROLS,
  clockForColor,
  defaultServerAddress,
  normalizedOnlineState,
  parseServerAddress,
  pgnFromHistory,
  type OnlineChatMessage,
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

export interface FriendInviteInput {
  userId: string;
  username: string;
  state?: number;
  matchId?: string;
  spectate?: boolean;
  timeControl?: OnlineTimeControl;
}

export interface OnlineChessController {
  connection: OnlineConnectionStatus;
  session: OnlineSessionInfo | null;
  account: OnlineAuthAccount | null;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username?: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthFeedback: () => void;
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
  chatMessages: OnlineChatMessage[];
  selected: Square | null;
  legalTargets: Square[];
  checkSquare: Square | null;
  pendingPromotion: PendingOnlinePromotion | null;
  error: string | null;
  canAct: boolean;
  matchmaking: boolean;
  matchmakingSeconds: number;
  friends: SocialFriend[];
  friendsLoading: boolean;
  friendsError: string | null;
  inviteSendingId: string | null;
  inviteError: string | null;
  inviteNotice: string | null;
  loadFriends: () => Promise<void>;
  clearInviteFeedback: () => void;
  inviteFriend: (input: FriendInviteInput) => Promise<MoonGamesInvite>;
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
  createPrivateMatch: () => Promise<string | null>;
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
  sendChat: (text: string) => void;
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

function rotateGuestDeviceId(): void {
  try {
    window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    // Storage can be unavailable.
  }
}

async function resolveAccountIdentity(
  client: Client,
  activeSession: Session,
  kind: OnlineAuthAccount["kind"],
  email: string | null,
): Promise<OnlineAuthAccount> {
  let accountInfo: Awaited<ReturnType<Client["getAccount"]>> | null = null;
  try {
    accountInfo = await client.getAccount(activeSession);
  } catch {
    // The socket is already authenticated. A profile read failure must not
    // reject an otherwise valid sign-in.
  }

  const accountEmail =
    typeof accountInfo?.email === "string" && accountInfo.email.length > 0
      ? accountInfo.email
      : email;
  const effectiveKind =
    kind === "guest" && accountEmail !== null ? "email" : kind;

  return {
    kind: effectiveKind,
    userId: activeSession.user_id ?? "",
    username:
      accountInfo?.user?.username ??
      activeSession.username ??
      (accountEmail ?? "Player"),
    email: accountEmail,
  };
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
  const [account, setAccount] = useState<OnlineAuthAccount | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
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
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
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
  const pendingEmailAuthRef = useRef<{
    email: string;
    password: string;
  } | null>(null);
  const matchmakerRef = useRef<PendingMatchmaker | null>(null);
  const matchmakingActiveRef = useRef(false);
  const matchmakingRunRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const friendsPromiseRef = useRef<Promise<void> | null>(null);

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

    // The clock is rendered to whole seconds, so four updates per second did
    // four times the React work for no visible benefit.
    setNowTick(Date.now());
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000);
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
        case ONLINE_OP.CHAT: {
          const message = payload as OnlineChatMessage;
          if (
            typeof message.id !== "string" ||
            typeof message.text !== "string"
          ) {
            break;
          }
          setServerState((current) => {
            if (current === null || current.result !== null) {
              return current;
            }
            const chat = current.chat ?? [];
            if (chat.some((entry) => entry.id === message.id)) {
              return current;
            }
            return {
              ...current,
              chat: [...chat, message].slice(-40),
            };
          });
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
      socket.onmatchdata = () => undefined;
      socket.onmatchmakermatched = () => undefined;
      socket.onerror = () => undefined;
      socket.ondisconnect = () => undefined;
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
    setAccount(null);
    setAuthError(null);
    setAuthNotice(null);
    setServerState(null);
    setMatchId(null);
    matchIdRef.current = null;
    rememberMatchId(null);
    rememberSpectating(false);
    setDrawOffer(null);
    setSelected(null);
    setPendingPromotion(null);
    setFriends([]);
    setFriendsError(null);
    setFriendsLoading(false);
    setInviteError(null);
    setInviteNotice(null);
    setInviteSendingId(null);
    friendsPromiseRef.current = null;
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
        const storedEmail = readStoredEmailSession(address.label);
        const pendingEmail = pendingEmailAuthRef.current;
        pendingEmailAuthRef.current = null;
        const restoredHost = hostSession(activeHost);
        let sessionResult: Session;
        let authSource: OnlineAuthAccount["kind"];
        let authEmail: string | null = null;

        if (restoredHost !== null) {
          sessionResult = restoredHost;
          authSource = "host";
          const now = Date.now() / 1000;
          if (
            restoredHost.isexpired(now) &&
            !restoredHost.isrefreshexpired(now) &&
            restoredHost.refresh_token.length > 0
          ) {
            sessionResult = await client.sessionRefresh(restoredHost);
          }
        } else if (pendingEmail !== null) {
          sessionResult = await client.authenticateEmail(
            pendingEmail.email,
            pendingEmail.password,
            false,
          );
          authSource = "email";
          authEmail = pendingEmail.email;
        } else {
          let restoredEmail: Session | null = null;
          if (storedEmail !== null) {
            try {
              const candidate = Session.restore(
                storedEmail.token,
                storedEmail.refreshToken,
              );
              const now = Date.now() / 1000;
              restoredEmail =
                candidate.isexpired(now) &&
                !candidate.isrefreshexpired(now) &&
                candidate.refresh_token.length > 0
                  ? await client.sessionRefresh(candidate)
                  : candidate;
              if (restoredEmail.isexpired(Date.now() / 1000)) {
                throw new Error("The saved session has expired.");
              }
            } catch {
              clearStoredEmailSession();
              restoredEmail = null;
            }
          }

          if (restoredEmail !== null) {
            try {
              await client.getAccount(restoredEmail);
            } catch (cause) {
              if (
                typeof Response !== "undefined" &&
                cause instanceof Response &&
                (cause.status === 401 || cause.status === 403)
              ) {
                clearStoredEmailSession();
                restoredEmail = null;
              }
            }
          }

          if (restoredEmail !== null) {
            sessionResult = restoredEmail;
            authSource = "email";
            authEmail = storedEmail?.email ?? null;
          } else {
            sessionResult = await client.authenticateDevice(
              getDeviceId(),
              true,
            );
            authSource = "guest";
          }
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
          if (socketRef.current !== socket) {
            return;
          }
          failPendingMatchmaker(
            "Disconnected while searching for a match.",
          );
          socketRef.current = null;
          clientRef.current = null;
          sessionRef.current = null;
          setConnection("connecting");
          setProfileLoading(false);
          setFriendsError(null);
          setFriendsLoading(false);
          setInviteError(null);
          setInviteNotice(null);
          setInviteSendingId(null);
          friendsPromiseRef.current = null;
          setError("Connection lost. Reconnecting to the table…");

          // Nakama keeps the authoritative match alive through a short
          // disconnect grace period. Reconnect and rejoin automatically so a
          // mobile network blip does not strand players outside the room.
          let attempt = 0;
          const retry = () => {
            if (socketRef.current !== null) {
              return;
            }
            const delay = Math.min(15000, 1000 * 2 ** attempt);
            attempt += 1;
            window.setTimeout(() => {
              if (socketRef.current !== null) {
                return;
              }
              void connect().catch(() => {
                if (attempt < 6) {
                  retry();
                }
              });
            }, delay);
          };
          retry();
        };

        await socket.connect(sessionResult, true);

        clientRef.current = client;
        sessionRef.current = sessionResult;
        socketRef.current = socket;

        const resolvedAccount = await resolveAccountIdentity(
          client,
          sessionResult,
          authSource,
          authEmail,
        );
        setAccount(resolvedAccount);
        setAuthError(null);
        if (authSource === "email" && resolvedAccount.email !== null) {
          storeEmailSession({
            server: address.label,
            email: resolvedAccount.email,
            token: sessionResult.token,
            refreshToken: sessionResult.refresh_token,
          });
        }

        setSession({
          userId: resolvedAccount.userId,
          username: resolvedAccount.username,
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

  const clearAuthFeedback = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setAuthError(null);
      setAuthNotice(null);

      if (hostSession(hostConfigRef.current) !== null) {
        setAuthError("This account is managed by the MoonGames app.");
        return;
      }
      if (matchIdRef.current !== null) {
        setAuthError("Leave the current match before switching accounts.");
        return;
      }
      const emailError = validateEmail(email);
      if (emailError !== null) {
        setAuthError(emailError);
        return;
      }
      if (password.length === 0) {
        setAuthError("Enter your password.");
        return;
      }

      let address: ReturnType<typeof parseServerAddress>;
      try {
        address = parseServerAddress(
          hostServerAddress(hostConfigRef.current) ?? serverAddress,
        );
      } catch {
        setAuthError("Enter a valid server address.");
        return;
      }
      if (!emailAuthTransportSafe(address.host, address.useSSL)) {
        setAuthError(
          "Email sign-in requires HTTPS. Use a secure server address.",
        );
        return;
      }

      setAuthBusy(true);
      try {
        if (socketRef.current !== null) {
          disconnect();
        }
        pendingEmailAuthRef.current = {
          email: normalizeEmail(email),
          password,
        };
        await connect();
        setAuthNotice("Signed in. Your rating and history are now synced.");
      } catch (cause) {
        pendingEmailAuthRef.current = null;
        setAuthError(
          authErrorMessage(await authErrorDetail(cause), "sign-in"),
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [connect, disconnect, serverAddress],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      username = "",
    ): Promise<void> => {
      setAuthError(null);
      setAuthNotice(null);

      if (hostSession(hostConfigRef.current) !== null) {
        setAuthError("This account is managed by the MoonGames app.");
        return;
      }
      if (matchIdRef.current !== null) {
        setAuthError("Leave the current match before changing accounts.");
        return;
      }
      const emailError = validateEmail(email);
      if (emailError !== null) {
        setAuthError(emailError);
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError !== null) {
        setAuthError(passwordError);
        return;
      }
      const trimmedUsername = username.trim();
      const usernameError = validateUsername(trimmedUsername);
      if (usernameError !== null) {
        setAuthError(usernameError);
        return;
      }

      let address: ReturnType<typeof parseServerAddress>;
      try {
        address = parseServerAddress(
          hostServerAddress(hostConfigRef.current) ?? serverAddress,
        );
      } catch {
        setAuthError("Enter a valid server address.");
        return;
      }
      if (!emailAuthTransportSafe(address.host, address.useSSL)) {
        setAuthError(
          "Account creation requires HTTPS. Use a secure server address.",
        );
        return;
      }

      const normalizedEmail = normalizeEmail(email);
      let linked = false;
      let usernameWarning = false;
      setAuthBusy(true);
      try {
        if (socketRef.current === null) {
          await connect();
        }
        const client = clientRef.current;
        const currentSession = sessionRef.current;
        if (client === null || currentSession === null) {
          throw new Error("Could not establish a guest session.");
        }

        const currentAccount = await client.getAccount(currentSession);
        if (currentAccount.email) {
          setAuthError("You are already signed in with an email account.");
          return;
        }

        await client.linkEmail(currentSession, {
          email: normalizedEmail,
          password,
        });
        linked = true;
        markGuestIdentityLinked();

        if (trimmedUsername.length > 0) {
          try {
            await client.updateAccount(currentSession, {
              username: trimmedUsername,
            });
          } catch {
            // The account is still created; the generated name is used.
            usernameWarning = true;
          }
        }

        pendingEmailAuthRef.current = {
          email: normalizedEmail,
          password,
        };
        disconnect();
        await connect();
        if (consumeGuestIdentityLinked()) {
          rotateGuestDeviceId();
        }
        setAuthNotice(
          usernameWarning
            ? "Account created. That player name was unavailable, so your existing account name was kept."
            : "Account created. Your progress will follow you.",
        );
      } catch (cause) {
        pendingEmailAuthRef.current = null;
        setAuthError(
          linked
            ? "Your account was created, but sign-in did not finish. Try signing in with your email."
            : authErrorMessage(await authErrorDetail(cause), "sign-up"),
        );
      } finally {
        setAuthBusy(false);
      }
    },
    [connect, disconnect, serverAddress],
  );

  const signOut = useCallback(async (): Promise<void> => {
    setAuthError(null);
    setAuthNotice(null);

    if (account?.kind === "host") {
      setAuthError("This account is managed by the MoonGames app.");
      return;
    }
    if (account?.kind !== "email") {
      setAuthError("You are already playing as a guest.");
      return;
    }
    if (matchIdRef.current !== null) {
      setAuthError("Leave the current match before signing out.");
      return;
    }

    setAuthBusy(true);
    try {
      clearStoredEmailSession();
      if (consumeGuestIdentityLinked()) {
        rotateGuestDeviceId();
      }
      if (socketRef.current !== null) {
        disconnect();
      }
      await connect();
      setAuthNotice("Signed out. You are playing as a guest.");
    } catch (cause) {
      setAuthError(authErrorMessage(await authErrorDetail(cause), "sign-in"));
    } finally {
      setAuthBusy(false);
    }
  }, [account?.kind, connect, disconnect]);

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

  const loadFriends = useCallback(async (): Promise<void> => {
    if (friendsPromiseRef.current !== null) {
      return friendsPromiseRef.current;
    }

    const client = clientRef.current;
    const currentSession = sessionRef.current;
    if (client === null || currentSession === null) {
      setFriendsError("Connect to the game server to load your friends.");
      return;
    }

    setFriendsLoading(true);
    setFriendsError(null);
    const request = (async () => {
      try {
        const social = new MoonGamesSocialClient({
          client,
          session: currentSession,
        });
        // Load each relationship state independently. A failure in one state
        // must never hide accepted friends from the invite picker.
        const responses = await Promise.allSettled([
          social.listFriends(0),
          social.listFriends(1),
          social.listFriends(2),
        ]);
        const groups = responses.flatMap((result) =>
          result.status === "fulfilled" ? [result.value] : [],
        );
        if (groups.length === 0) {
          const rejected = responses.find(
            (result): result is PromiseRejectedResult =>
              result.status === "rejected",
          );
          throw rejected?.reason ?? new Error("Friend list unavailable.");
        }
        if (groups.length < responses.length) {
          console.warn("Some MoonGames friend states could not be loaded.");
        }
        const byId = new Map<string, SocialFriend>();
        for (const group of groups) {
          for (const friend of group) {
            byId.set(friend.userId, friend);
          }
        }
        const rank = (state: number) =>
          state === 0 ? 0 : state === 2 ? 1 : state === 1 ? 2 : 3;
        setFriends(
          [...byId.values()].sort(
            (left, right) =>
              rank(left.state) - rank(right.state) ||
              left.username.localeCompare(right.username, undefined, {
                sensitivity: "base",
              }),
          ),
        );
      } catch (cause) {
        setFriendsError(
          errorMessage(cause, "Could not load your MoonGames friends."),
        );
      } finally {
        setFriendsLoading(false);
        friendsPromiseRef.current = null;
      }
    })();
    friendsPromiseRef.current = request;
    await request;
  }, []);

  useEffect(() => {
    if (connection !== "connected") {
      return;
    }
    // Warm the cache as soon as the socket is ready, and refresh when the
    // player returns from another tab after accepting a request.
    void loadFriends();
    const refresh = () => {
      if (document.visibilityState === "visible") {
        void loadFriends();
      }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [connection, loadFriends]);

  const clearInviteFeedback = useCallback(() => {
    setInviteError(null);
    setInviteNotice(null);
  }, []);

  const inviteFriend = useCallback(
    async (input: FriendInviteInput): Promise<MoonGamesInvite> => {
      const targetMatchId = (input.matchId ?? matchIdRef.current ?? "").trim();
      if (targetMatchId.length === 0) {
        throw new Error("Create or join a private match first.");
      }

      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        throw new Error("Connect to the game server before inviting a friend.");
      }

      setInviteSendingId(input.userId);
      setInviteError(null);
      setInviteNotice(null);
      try {
        const social = new MoonGamesSocialClient({
          client,
          session: currentSession,
        });
        if (input.state === 1) {
          throw new Error(
            "That player still needs to accept your friend request. Once they do, they will appear here as a friend.",
          );
        }
        if (input.state === 2) {
          // Incoming requests can be accepted directly from the invite picker.
          await social.acceptFriend({ userId: input.userId });
        }
        const invite = await social.createInvite({
          gameId: "chess",
          mode: "private",
          matchId: targetMatchId,
          recipientId: input.userId,
          recipientUsername: input.username,
          metadata: {
            spectate: input.spectate === true,
            timeControl: input.timeControl ?? timeControl,
          },
        });
        setInviteNotice(`Invite sent to ${input.username}.`);
        return invite;
      } catch (cause) {
        setInviteError(
          errorMessage(cause, "Could not send that friend invitation."),
        );
        throw cause;
      } finally {
        setInviteSendingId(null);
      }
    },
    [timeControl],
  );

  const joinMatch = useCallback(
    async (rawMatchId: string, options: { spectator?: boolean } = {}) => {
      const nextMatchId = rawMatchId.trim();
      if (nextMatchId.length === 0) {
        throw new Error("Enter a match ID.");
      }

      const socket = await requireSocket();
      const currentMatchId = matchIdRef.current;
      if (currentMatchId === nextMatchId) {
        // Opening an invite for the room we are already in (common when the
        // owner taps the accepted-invite notification) must be idempotent.
        rememberMatchId(nextMatchId);
        rememberSpectating(options.spectator === true);
        setError(null);
        return;
      }
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
          window.clearTimeout(pending.timer);
          // Keep the pending matchmaker alive until the ticket is actually
          // removed. A pairing can land while removal is in flight, and that
          // match must not be silently discarded.
          const removal =
            pending.ticket === null
              ? Promise.resolve()
              : activeSocket.removeMatchmaker(pending.ticket).catch(() => {
                  // The ticket may already be gone or matched.
                });
          void removal.finally(() => {
            if (matchmakerRef.current !== pending) {
              return;
            }
            matchmakerRef.current = null;
            pending.resolve(null);
          });
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

      const openQuickRoom = async (excludeMatchId?: string) => {
        const result = await callRpc("chess_quick_match", {
          timeControl,
          ...(excludeMatchId === undefined ? {} : { excludeMatchId }),
        });
        if (run !== matchmakingRunRef.current) {
          return null;
        }
        if (!result.ok || !result.matchId) {
          throw new Error(
            result.error?.message ?? "Could not open a quick match.",
          );
        }
        return result.matchId;
      };

      const quickMatchId = await openQuickRoom();
      if (quickMatchId === null) {
        return;
      }
      try {
        await joinMatch(quickMatchId);
      } catch (cause) {
        // The open-table fallback can race with another player taking the
        // last seat. Ask the backend to ignore that room and try once more.
        if (!/full/i.test(errorMessage(cause, ""))) {
          throw cause;
        }
        const replacement = await openQuickRoom(quickMatchId);
        if (replacement === null) {
          return;
        }
        await joinMatch(replacement);
      }
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

  const createPrivateMatch = useCallback(async (): Promise<string | null> => {
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
      return result.matchId;
    } catch (cause) {
      setError(errorMessage(cause, "Could not create a private match."));
      return null;
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
    setInviteError(null);
    setInviteNotice(null);
    setInviteSendingId(null);
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

  const sendChat = useCallback(
    (text: string) => {
      if (serverState?.result != null) {
        return;
      }
      const normalized = Array.from(text.replace(/\s+/g, " ").trim())
        .slice(0, 240)
        .join("");
      if (normalized.length === 0) {
        return;
      }
      sendMatchState(ONLINE_OP.CHAT_SEND, { text: normalized });
    },
    [sendMatchState, serverState?.result],
  );

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
    account,
    authBusy,
    authError,
    authNotice,
    signIn,
    signUp,
    signOut,
    clearAuthFeedback,
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
    chatMessages: serverState?.chat ?? [],
    selected,
    legalTargets,
    checkSquare,
    pendingPromotion,
    error,
    canAct,
    matchmaking,
    matchmakingSeconds,
    friends,
    friendsLoading,
    friendsError,
    inviteSendingId,
    inviteError,
    inviteNotice,
    loadFriends,
    clearInviteFeedback,
    inviteFriend,
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
    sendChat,
    pgn,
  };
}
