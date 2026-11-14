import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";
import {
  simulateShot,
  type CarromPlayer,
  type CarromShotInput,
  type CarromShotResult,
  type CarromState,
} from "@moongames/carrom-core";
import { readLauncherHandoff, type GameHostConfig } from "@moongames/game-sdk";
import {
  authErrorMessage,
  clearStoredEmailSession,
  readStoredEmailSession,
  storeEmailSession,
  validateEmail,
  validatePassword,
  validateUsername,
  type OnlineAuthAccount,
  type GameHistoryEntry,
  type GameLeaderboardEntry,
  type GameProfile,
} from "@moongames/game-ui";

/**
 * The Carrom wire protocol. It mirrors Carrom/server/carrom_protocol.lua so
 * the client and the authoritative server agree on every opcode.
 */
export const CARROM_OP = {
  STATE: 1,
  SHOT: 2,
  GAME_OVER: 3,
  ERROR: 4,
  PLAYER_JOINED: 5,
  PLAYER_LEFT: 6,
  MATCH_STARTED: 7,
  CHAT: 8,
  SPECTATOR_JOINED: 9,
  SPECTATOR_LEFT: 10,
  PONG: 15,
  SHOT_REQUEST: 101,
  REQUEST_STATE: 102,
  CHAT_SEND: 103,
  PING: 104,
} as const;

export interface CarromSeat {
  user_id: string;
  username: string;
  colour: CarromPlayer;
  connected: boolean;
}

export interface CarromSpectator {
  user_id: string;
  username: string;
}

export interface CarromChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: number;
}

/** One shot at the table, as the server recorded it. */
export interface CarromShotSummary {
  by: string;
  colour: CarromPlayer;
  position: number;
  power: number;
  pocketed_count: number;
}

export interface CarromMatchResult {
  status: string;
  winnerColour?: CarromPlayer;
  winnerUserId?: string;
  reason?: string;
}

export interface CarromServerState {
  game: CarromState | null;
  seats: CarromSeat[];
  spectators: CarromSpectator[];
  chat: CarromChatMessage[];
  result: CarromMatchResult | null;
  seatsCount: number;
  shotSerial: number;
  /** Every shot played at the table, oldest first. */
  shots: CarromShotSummary[];
  lastShot: {
    user_id: string;
    position: number;
    angle: number;
    power: number;
  } | null;
}

export type CarromConnection =
  | "offline"
  | "connecting"
  | "connected"
  | "error";

const DEVICE_KEY = "moongames.carrom.device";
const SERVER_KEY = "defaultkey";
const DEFAULT_PORT = 7350;

function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing !== null && existing.length > 0) {
      return existing;
    }
    const created = `carrom-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return `carrom-${Date.now()}`;
  }
}

function serverAddress(fallback?: {
  host?: string;
  port?: string;
  useSSL?: boolean;
  serverKey?: string;
}): { host: string; port: string; useSSL: boolean; serverKey: string } {
  const params = new URLSearchParams(window.location.search);
  const host =
    fallback?.host ??
    params.get("nakamaHost") ??
    (typeof window !== "undefined" ? window.location.hostname : "127.0.0.1");
  const rawPort = fallback?.port ?? params.get("nakamaPort") ?? DEFAULT_PORT;
  const port = Number(rawPort);
  const useSSL =
    fallback?.useSSL ?? params.get("nakamaSSL") === "1";
  return {
    host: host.length > 0 ? host : "127.0.0.1",
    port: String(Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT),
    useSSL,
    serverKey:
      fallback?.serverKey ??
      (import.meta.env.VITE_NAKAMA_SERVER_KEY as string | undefined) ??
      SERVER_KEY,
  };
}

function sessionFromConfig(config: GameHostConfig | null): Session | null {
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

function decodeMatchData(data: Uint8Array | string): unknown {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  return JSON.parse(new TextDecoder().decode(data));
}

export interface OnlineCarromOptions {
  /** Start searching for a table as soon as the client connects. */
  autoJoinMatchId?: string | null;
  autoSpectate?: boolean;
}

export interface OnlineCarromController {
  connection: CarromConnection;
  matchId: string | null;
  state: CarromServerState | null;
  game: CarromState | null;
  seats: CarromSeat[];
  spectators: CarromSpectator[];
  chat: CarromChatMessage[];
  result: CarromMatchResult | null;
  error: string | null;
  notice: string | null;
  searching: boolean;
  spectating: boolean;
  myColour: CarromPlayer | null;
  myUserId: string | null;
  animation: CarromShotResult | null;
  profile: GameProfile | null;
  history: GameHistoryEntry[];
  leaderboard: GameLeaderboardEntry[];
  myLeaderboard: GameLeaderboardEntry | null;
  profileLoading: boolean;
  profileError: string | null;
  account: OnlineAuthAccount | null;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
  refreshProfile: () => Promise<void>;
  opponentLeft: string | null;
  dismissOpponentLeft: () => void;
  clearAuthFeedback: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  connect: () => Promise<void>;
  quickMatch: (seats: number) => Promise<void>;
  createPrivateRoom: (seats: number) => Promise<void>;
  joinMatch: (matchId: string, options?: { spectator?: boolean }) => Promise<void>;
  leaveMatch: () => Promise<void>;
  sendShot: (shot: CarromShotInput) => void;
  sendChat: (text: string) => void;
  requestState: () => void;
  clearAnimation: () => void;
  setNotice: (message: string | null) => void;
}

export function useOnlineCarrom(
  options: OnlineCarromOptions = {},
): OnlineCarromController {
  const [connection, setConnection] = useState<CarromConnection>("offline");
  const [matchId, setMatchId] = useState<string | null>(null);
  const [state, setState] = useState<CarromServerState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [animation, setAnimation] = useState<CarromShotResult | null>(null);
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<GameLeaderboardEntry[]>([]);
  const [myLeaderboard, setMyLeaderboard] =
    useState<GameLeaderboardEntry | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [account, setAccount] = useState<OnlineAuthAccount | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [opponentLeft, setOpponentLeft] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const serverLabelRef = useRef("nakama-local");
  const matchIdRef = useRef<string | null>(null);
  const serialRef = useRef(0);
  const gameRef = useRef<CarromState | null>(null);
  const ticketRef = useRef<string | null>(null);
  const fallbackRef = useRef<number | null>(null);

  const requireSocket = useCallback(async (): Promise<Socket> => {
    const socket = socketRef.current;
    if (socket !== null) {
      return socket;
    }
    throw new Error("The realtime connection is not ready yet.");
  }, []);

  const joinMatch = useCallback(
    async (rawMatchId: string, joinOptions: { spectator?: boolean } = {}) => {
      const socket = await requireSocket();
      const nextMatchId = rawMatchId.trim();
      if (nextMatchId.length === 0) {
        throw new Error("Enter a match ID.");
      }
      if (matchIdRef.current !== null && matchIdRef.current !== nextMatchId) {
        try {
          await socket.leaveMatch(matchIdRef.current);
        } catch {
          // The previous match may already be gone.
        }
      }
      await socket.joinMatch(
        nextMatchId,
        undefined,
        joinOptions.spectator ? { spectate: "1" } : undefined,
      );
      matchIdRef.current = nextMatchId;
      setMatchId(nextMatchId);
      setSpectating(joinOptions.spectator === true);
      setError(null);
    },
    [requireSocket],
  );

  const applyServerState = useCallback((payload: CarromServerState) => {
    const serial = payload.shotSerial ?? 0;
    const previous = gameRef.current;
    const shot = payload.lastShot;
    const isNewShot = serial > serialRef.current;

    if (isNewShot && previous !== null && shot !== null) {
      // The server owns the result. The client replays the same deterministic
      // shot locally so the table animates exactly as it was resolved.
      try {
        const result = simulateShot(previous, {
          position: shot.position,
          angle: shot.angle,
          power: shot.power,
        });
        setAnimation(result);
      } catch {
        setAnimation(null);
      }
    }
    serialRef.current = Math.max(serialRef.current, serial);
    gameRef.current = payload.game;
    // Nakama encodes an empty Lua table as an object, so normalise the lists.
    setState({
      ...payload,
      chat: Array.isArray(payload.chat) ? payload.chat : [],
      spectators: Array.isArray(payload.spectators) ? payload.spectators : [],
      shots: Array.isArray(payload.shots) ? payload.shots : [],
      game: payload.game ?? null,
      seats: Array.isArray(payload.seats) ? payload.seats : [],
    });
  }, []);

  const connect = useCallback(async (): Promise<void> => {
    if (socketRef.current !== null) {
      return;
    }
    setConnection("connecting");
    setError(null);
    try {
      const handoff = readLauncherHandoff("carrom");
      const hostSession = sessionFromConfig(handoff);
      // The launcher owns the account and the server. A verified launch uses
      // the shared session and the launcher's Nakama address; a direct launch
      // falls back to a guest device identity on the same server.
      const address = serverAddress(handoff?.nakama);
      serverLabelRef.current = address.host;
      const client = new Client(
        address.serverKey,
        address.host,
        address.port,
        address.useSSL,
      );
      let session: Session;
      if (hostSession !== null) {
        session = hostSession;
        if (session.isexpired(Date.now() / 1000) && session.refresh_token.length > 0) {
          session = await client.sessionRefresh(hostSession);
        }
      } else {
        session = await client.authenticateDevice(deviceId(), true);
      }
      const socket = client.createSocket(address.useSSL, false);
      // The socket has to be connected before anything can be sent: the
      // matchmaker, the room join, and the shot requests all travel on it.
      await socket.connect(session, true);

      socket.onmatchdata = (matchData: {
        match_id: string;
        op_code: number;
        data: Uint8Array;
      }) => {
        let parsed: unknown;
        try {
          parsed = decodeMatchData(matchData.data);
        } catch {
          return;
        }
        if (typeof parsed !== "object" || parsed === null) {
          return;
        }
        const message = parsed as Record<string, unknown>;
        if (matchData.op_code === CARROM_OP.STATE) {
          applyServerState(message as unknown as CarromServerState);
          return;
        }
        if (matchData.op_code === CARROM_OP.ERROR) {
          setError(typeof message.message === "string" ? message.message : "The server refused that request.");
          return;
        }
        if (matchData.op_code === CARROM_OP.CHAT) {
          const entry = message as {
            id?: string;
            user_id?: string;
            username?: string;
            text?: string;
            at?: number;
          };
          setState((current) => {
            if (current === null) {
              return current;
            }
            return {
              ...current,
              chat: [
                ...current.chat,
                {
                  id: entry.id ?? `${entry.at ?? 0}`,
                  userId: entry.user_id ?? "",
                  username: entry.username ?? "Player",
                  text: entry.text ?? "",
                  sentAt: entry.at ?? Date.now(),
                },
              ],
            };
          });
          return;
        }
        if (matchData.op_code === CARROM_OP.PLAYER_LEFT) {
          const left = message as { username?: string; userId?: string };
          if (left.userId !== undefined && left.userId !== sessionRef.current?.user_id) {
            setOpponentLeft(left.username ?? "Your opponent");
          }
          return;
        }
        if (matchData.op_code === CARROM_OP.MATCH_STARTED) {
          setNotice("The table is set. First shot away.");
          return;
        }
        if (matchData.op_code === CARROM_OP.GAME_OVER) {
          setNotice("The board is finished.");
          return;
        }
      };

      socket.onmatchmakermatched = (matched: { match_id: string; token?: string }) => {
        setSearching(false);
        if (fallbackRef.current !== null) {
          window.clearTimeout(fallbackRef.current);
          fallbackRef.current = null;
        }
        ticketRef.current = null;
        void (async () => {
          try {
            await socket.joinMatch(matched.match_id, matched.token);
            matchIdRef.current = matched.match_id;
            setMatchId(matched.match_id);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "The table could not be joined.");
          }
        })();
      };
      socket.onerror = () => {
        setError("The realtime connection reported an error.");
      };
      socket.ondisconnect = () => {
        socketRef.current = null;
        setConnection("offline");
      };

      clientRef.current = client;
      socketRef.current = socket;
      sessionRef.current = session;
      setConnection("connected");

      if (options.autoJoinMatchId) {
        await socket.joinMatch(
          options.autoJoinMatchId,
          undefined,
          options.autoSpectate ? { spectate: "1" } : undefined,
        );
        matchIdRef.current = options.autoJoinMatchId;
        setMatchId(options.autoJoinMatchId);
        setSpectating(options.autoSpectate === true);
      }
    } catch (cause) {
      setConnection("error");
      setError(cause instanceof Error ? cause.message : "The realtime connection failed.");
    }
  }, [applyServerState, options.autoJoinMatchId, options.autoSpectate]);

  const quickMatch = useCallback(
    async (seats: number): Promise<void> => {
      let socket = socketRef.current;
      if (socket === null) {
        await connect();
        socket = socketRef.current;
      }
      if (socket === null) {
        setError("The realtime connection is not ready yet.");
        return;
      }
      setError(null);
      setSearching(true);
      try {
        // The matchmaker query is scoped to the properties, so only players
        // who asked for the same game and table size are paired.
        const ticket = await socket.addMatchmaker(
          `+properties.game:carrom +properties.seats:${seats}`,
          seats,
          seats,
          {
            game: "carrom",
            seats: String(seats),
          },
        );
        ticketRef.current = ticket.ticket;
        // The atomic matchmaker pairs players who asked for the same size.
        // A table that is already open is used when nobody pairs in time.
        fallbackRef.current = window.setTimeout(() => {
          void (async () => {
            try {
              const client = clientRef.current;
              const session = sessionRef.current;
              if (client === null || session === null) {
                return;
              }
              const response = await client.rpc(session, "carrom_quick_match", {
                seats,
              });
              const parsed = (response.payload ?? {}) as {
                ok?: boolean;
                matchId?: string;
              };
              if (parsed.ok !== true || typeof parsed.matchId !== "string") {
                return;
              }
              await joinMatch(parsed.matchId);
            } catch {
              // The matchmaker may still pair the two players.
            }
          })();
        }, 5000);
      } catch (cause) {
        setSearching(false);
        setError(
          cause instanceof Error ? cause.message : "The search could not start.",
        );
      }
    },
    [connect, joinMatch],
  );

  const createPrivateRoom = useCallback(
    async (seats: number): Promise<void> => {
      const client = clientRef.current;
      const session = sessionRef.current;
      if (client === null || session === null) {
        setError("The realtime connection is not ready yet.");
        return;
      }
      setError(null);
      try {
        const response = await client.rpc(
          session,
          "carrom_create_private_match",
          { seats },
        );
        const parsed = (response.payload ?? {}) as {
          ok?: boolean;
          matchId?: string;
        };
        if (parsed.ok !== true || typeof parsed.matchId !== "string") {
          throw new Error("The private room could not be created.");
        }
        await joinMatch(parsed.matchId);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The private room could not be created.",
        );
      }
    },
    [joinMatch],
  );

  const leaveMatch = useCallback(async (): Promise<void> => {
    const socket = socketRef.current;
    const current = matchIdRef.current;
    if (socket !== null && current !== null) {
      try {
        await socket.leaveMatch(current);
      } catch {
        // The match may already be gone.
      }
    }
    matchIdRef.current = null;
    setMatchId(null);
    setState(null);
    setSpectating(false);
    gameRef.current = null;
  }, []);

  const sendShot = useCallback((shot: CarromShotInput): void => {
    const socket = socketRef.current;
    const current = matchIdRef.current;
    if (socket === null || current === null) {
      return;
    }
    void socket
      .sendMatchState(
        current,
        CARROM_OP.SHOT_REQUEST,
        JSON.stringify({
          position: shot.position,
          angle: shot.angle,
          power: shot.power,
        }),
      )
      .catch(() => {
        setError("The shot could not be sent.");
      });
  }, []);

  const sendChat = useCallback((text: string): void => {
    const socket = socketRef.current;
    const current = matchIdRef.current;
    if (socket === null || current === null) {
      return;
    }
    void socket
      .sendMatchState(current, CARROM_OP.CHAT_SEND, JSON.stringify({ text }))
      .catch(() => {
        setError("The message could not be sent.");
      });
  }, []);

  const requestState = useCallback((): void => {
    const socket = socketRef.current;
    const current = matchIdRef.current;
    if (socket === null || current === null) {
      return;
    }
    void socket
      .sendMatchState(current, CARROM_OP.REQUEST_STATE, "{}")
      .catch(() => {
        setError("The table state could not be requested.");
      });
  }, []);

  const clearAnimation = useCallback((): void => {
    setAnimation(null);
  }, []);

  useEffect(() => {
    return () => {
      const socket = socketRef.current;
      if (socket !== null) {
        try {
          socket.disconnect(false);
        } catch {
          // The socket may already be closed.
        }
      }
    };
  }, []);

  const myUserId = sessionRef.current?.user_id ?? null;

  const refreshProfile = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const profileResponse = await client.rpc(session, "carrom_get_profile", {});
      const profilePayload = (profileResponse.payload ?? {}) as {
        ok?: boolean;
        profile?: GameProfile;
        history?: GameHistoryEntry[];
        error?: { message?: string };
      };
      if (profilePayload.ok !== true) {
        setProfileError(
          profilePayload.error?.message ?? "The profile could not be loaded.",
        );
        return;
      }
      setProfile(profilePayload.profile ?? null);
      setHistory(profilePayload.history ?? []);

      const leaderboardResponse = await client.rpc(
        session,
        "carrom_get_leaderboard",
        { limit: 10 },
      );
      const leaderboardPayload = (leaderboardResponse.payload ?? {}) as {
        ok?: boolean;
        entries?: GameLeaderboardEntry[];
        me?: GameLeaderboardEntry | null;
      };
      setLeaderboard(leaderboardPayload.entries ?? []);
      setMyLeaderboard(leaderboardPayload.me ?? null);
    } catch (cause) {
      setProfileError(
        cause instanceof Error ? cause.message : "The profile could not be loaded.",
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const clearAuthFeedback = useCallback((): void => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const dismissOpponentLeft = useCallback((): void => {
    setOpponentLeft(null);
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      const client = clientRef.current;
      if (client === null) {
        setAuthError("The realtime connection is not ready yet.");
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
      setAuthBusy(true);
      setAuthError(null);
      try {
        const session = await client.authenticateEmail(email, password, false);
        sessionRef.current = session;
        storeEmailSession({
          server: serverLabelRef.current,
          email,
          token: session.token,
          refreshToken: session.refresh_token,
        });
        setAccount({
          kind: "email",
          username: email,
          email,
          userId: session.user_id ?? email,
        });
        setAuthNotice("Signed in. Your shared account is ready.");
        await refreshProfile();
      } catch (cause) {
        setAuthError(await authErrorMessage(cause, "sign-in"));
      } finally {
        setAuthBusy(false);
      }
    },
    [refreshProfile],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      username: string,
    ): Promise<void> => {
      const client = clientRef.current;
      if (client === null) {
        setAuthError("The realtime connection is not ready yet.");
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
      const usernameError = validateUsername(username);
      if (usernameError !== null) {
        setAuthError(usernameError);
        return;
      }
      setAuthBusy(true);
      setAuthError(null);
      try {
        const session = await client.authenticateEmail(
          email,
          password,
          true,
          username,
        );
        sessionRef.current = session;
        storeEmailSession({
          server: serverLabelRef.current,
          email,
          token: session.token,
          refreshToken: session.refresh_token,
        });
        setAccount({
          kind: "email",
          username,
          email,
          userId: session.user_id ?? username,
        });
        setAuthNotice("Account created. Your shared account is ready.");
        await refreshProfile();
      } catch (cause) {
        setAuthError(await authErrorMessage(cause, "sign-up"));
      } finally {
        setAuthBusy(false);
      }
    },
    [refreshProfile],
  );

  const signOut = useCallback(async (): Promise<void> => {
    setAuthBusy(true);
    try {
      clearStoredEmailSession();
      setAccount(null);
      setAuthNotice("Signed out. This device is a guest again.");
    } finally {
      setAuthBusy(false);
    }
  }, []);
  const myColour =
    state?.seats.find((seat) => seat.user_id === myUserId)?.colour ?? null;

  return {
    connection,
    matchId,
    state,
    game: state?.game ?? null,
    seats: state?.seats ?? [],
    spectators: state?.spectators ?? [],
    chat: state?.chat ?? [],
    result: state?.result ?? null,
    error,
    notice,
    searching,
    spectating,
    myColour,
    myUserId,
    animation,
    profile,
    history,
    leaderboard,
    myLeaderboard,
    profileLoading,
    profileError,
    account,
    authBusy,
    authError,
    authNotice,
    refreshProfile,
    opponentLeft,
    dismissOpponentLeft,
    clearAuthFeedback,
    signIn,
    signUp,
    signOut,
    connect,
    quickMatch,
    createPrivateRoom,
    joinMatch,
    leaveMatch,
    sendShot,
    sendChat,
    requestState,
    clearAnimation,
    setNotice,
  };
}
