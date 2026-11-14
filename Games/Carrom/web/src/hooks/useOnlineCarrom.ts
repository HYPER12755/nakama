import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";
import { MoonGamesSocialClient } from "@moongames/social";
import {
  CARROM_OP,
  simulateShot,
  type CarromAiDifficulty,
  type CarromPlayer,
  type CarromShotInput,
  type CarromShotResult,
  type CarromState,
  type GameVariant,
} from "@moongames/carrom-core";
import { readLauncherHandoff, type GameHostConfig } from "@moongames/game-sdk";
import type { SocialFriend } from "@moongames/game-sdk";
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
 * The wire protocol comes from the core so the client, the authoritative
 * server, and the tests all read the same opcodes.
 */
export { CARROM_OP };

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
  /** When the table finished, in epoch milliseconds. */
  endedAt?: number;
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
    /** The colour that shot, so a client can replay the shot exactly. */
    colour?: CarromPlayer;
    position: number;
    angle: number;
    power: number;
    /** The striker that was used. */
    striker?: string;
  } | null;
}

export type CarromConnection =
  | "offline"
  | "connecting"
  | "connected"
  | "error";

/**
 * The identifiers of this title come from the build, so the client never
 * carries a game id of its own.
 */
const GAME_ID = __MOONGAMES_GAME_ID__;
const DEVICE_KEY = `moongames.${GAME_ID}.device`;
const SERVER_KEY = "defaultkey";
const DEFAULT_PORT = 7350;

function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing !== null && existing.length > 0) {
      return existing;
    }
    const created = `${GAME_ID}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return `${GAME_ID}-${Date.now()}`;
  }
}

function serverAddress(fallback?: {
  host?: string;
  port?: string;
  useSSL?: boolean;
  serverKey?: string;
}): {
  host: string;
  port: string;
  useSSL: boolean;
  serverKey: string;
  label: string;
} {
  const params = new URLSearchParams(window.location.search);
  const host =
    fallback?.host ??
    params.get("nakamaHost") ??
    (typeof window !== "undefined" ? window.location.hostname : "127.0.0.1");
  const rawPort = fallback?.port ?? params.get("nakamaPort") ?? DEFAULT_PORT;
  const port = Number(rawPort);
  const useSSL =
    fallback?.useSSL ?? params.get("nakamaSSL") === "1";
  const resolvedHost = host.length > 0 ? host : "127.0.0.1";
  const resolvedPort = String(
    Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
  );
  return {
    host: resolvedHost,
    port: resolvedPort,
    useSSL,
    serverKey:
      fallback?.serverKey ??
      (import.meta.env.VITE_NAKAMA_SERVER_KEY as string | undefined) ??
      SERVER_KEY,
    // The launcher labels a server the same way, so both find the same stored
    // email session.
    label: `${useSSL ? "https" : "http"}://${resolvedHost}:${resolvedPort}`,
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

/**
 * The settings a table is created with. The server keeps them, so both
 * players play the same game type under the same clock.
 */
export interface CarromTableSettings {
  variant?: GameVariant;
  turnSeconds?: number;
}

/** A friend to invite to the table. */
export interface CarromFriendInviteInput {
  userId: string;
  username: string;
  /** The friendship state, so an accepted request can be taken at once. */
  state?: number;
  spectate?: boolean;
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
  friends: SocialFriend[];
  friendsLoading: boolean;
  friendsError: string | null;
  inviteSendingId: string | null;
  inviteError: string | null;
  inviteNotice: string | null;
  loadFriends: () => Promise<void>;
  inviteFriend: (input: CarromFriendInviteInput) => Promise<boolean>;
  clearInviteFeedback: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    username: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  connect: () => Promise<void>;
  quickMatch: (
    seats: number,
    options?: CarromTableSettings,
  ) => Promise<void>;
  createPrivateRoom: (
    seats: number,
    options?: CarromTableSettings,
  ) => Promise<void>;
  joinMatch: (matchId: string, options?: { spectator?: boolean }) => Promise<void>;
  /** Join a table by the short code the host read out. */
  joinByRoomCode: (code: string) => Promise<void>;
  /** The short code of the table this player is sitting at. */
  roomCode: string | null;
  /** How many players the table behind the code is for. */
  roomSeats: number | null;
  leaveMatch: () => Promise<void>;
  sendShot: (shot: CarromShotInput, striker?: string) => void;
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
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  // The short code a player reads out to their friend.
  const [roomCode, setRoomCode] = useState<string | null>(null);
  // How many players the table behind the code is for.
  const [roomSeats, setRoomSeats] = useState<number | null>(null);

  const clientRef = useRef<Client | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const serverLabelRef = useRef("nakama-local");
  const matchIdRef = useRef<string | null>(null);
  const serialRef = useRef(0);
  const gameRef = useRef<CarromState | null>(null);
  const ticketRef = useRef<string | null>(null);
  const fallbackRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const refreshProfileRef = useRef<(() => Promise<void>) | null>(null);

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

  /**
   * Join a table by the short code the host read out. The server knows which
   * table the code names, so the client never has to know a match id.
   */
  const joinByRoomCode = useCallback(
    async (code: string): Promise<void> => {
      const client = clientRef.current;
      const session = sessionRef.current;
      if (client === null || session === null) {
        throw new Error("The realtime connection is not ready yet.");
      }
      const trimmed = code.trim();
      if (trimmed.length === 0) {
        throw new Error("Enter a room code.");
      }
      const response = await client.rpc(session, "moongames_room_code_resolve", {
        code: trimmed,
        gameId: GAME_ID,
      });
      const parsed = (response.payload ?? {}) as {
        ok?: boolean;
        matchId?: string;
        code?: string;
        seats?: number;
        error?: { message?: string };
      };
      if (parsed.ok !== true || typeof parsed.matchId !== "string") {
        throw new Error(
          parsed.error?.message ?? "That room code was not found.",
        );
      }
      await joinMatch(parsed.matchId);
      setRoomCode(parsed.code ?? trimmed.toUpperCase());
      // The server knows how many players the table is for, so the guest is
      // told what they are walking into.
      if (typeof parsed.seats === "number" && parsed.seats > 0) {
        setRoomSeats(parsed.seats);
      }
    },
    [joinMatch],
  );

  const applyServerState = useCallback((payload: CarromServerState) => {
    const serial = payload.shotSerial ?? 0;
    const previous = gameRef.current;
    const shot = payload.lastShot;
    const isNewShot = serial > serialRef.current;

    if (isNewShot && previous !== null && shot !== null) {
      // The server owns the result. The client replays the same deterministic
      // shot locally so the table animates exactly as it was resolved. The
      // striker travels with the shot, because it changes the power.
      try {
        const board =
          shot.colour !== undefined && shot.striker !== undefined
            ? {
                ...previous,
                strikers: {
                  ...previous.strikers,
                  [shot.colour]: shot.striker,
                },
              }
            : previous;
        const result = simulateShot(board, {
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
    if (socketRef.current !== null || connectingRef.current) {
      return;
    }
    connectingRef.current = true;
    setConnection("connecting");
    setError(null);
    try {
      const handoff = readLauncherHandoff(GAME_ID);
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
      let accountKind: OnlineAuthAccount["kind"] = "guest";
      let accountEmail: string | null = null;
      const storedEmail = readStoredEmailSession(address.label);
      if (hostSession !== null) {
        session = hostSession;
        accountKind = "host";
        if (session.isexpired(Date.now() / 1000) && session.refresh_token.length > 0) {
          session = await client.sessionRefresh(hostSession);
        }
      } else if (storedEmail !== null) {
        // The shared account the launcher signed in with.
        try {
          session = Session.restore(storedEmail.token, storedEmail.refreshToken);
          if (session.isexpired(Date.now() / 1000) && session.refresh_token.length > 0) {
            session = await client.sessionRefresh(session);
          }
          accountKind = "email";
          accountEmail = storedEmail.email;
        } catch {
          session = await client.authenticateDevice(deviceId(), true);
        }
      } else {
        session = await client.authenticateDevice(deviceId(), true);
      }
      const socket = client.createSocket(address.useSSL, false);
      // The socket has to be connected before anything can be sent: the
      // matchmaker, the room join, and the shot requests all travel on it.
      await socket.connect(session, true);

      // Show the identity the table is really using: the shared account, the
      // signed-in email account, or a guest profile.
      const accountInfo = (await client.getAccount(session).catch(() => null)) as
        | { user?: { id?: string; username?: string } }
        | null;
      // A guest device account is born with a name like "Player-1a2b3c". That
      // name is what the other player sees, so it is given a friendly one.
      if (
        accountKind === "guest" &&
        typeof accountInfo?.user?.username === "string" &&
        accountInfo.user.username.startsWith("Player-")
      ) {
        const friendly = `Guest${Math.random().toString(36).slice(2, 6)}`;
        await client
          .updateAccount(session, { username: friendly })
          .catch(() => undefined);
        accountInfo.user.username = friendly;
      }
      setAccount({
        kind: accountKind,
        username:
          accountInfo?.user?.username ?? session.username ?? "Guest",
        userId: accountInfo?.user?.id ?? session.user_id ?? "",
        email: accountEmail,
      });
      if (accountKind === "email" && accountEmail !== null) {
        storeEmailSession({
          server: address.label,
          email: accountEmail,
          token: session.token,
          refreshToken: session.refresh_token,
        });
      }

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
        if (matchData.op_code === CARROM_OP.SHOT) {
          // The server sends this when the shot clock runs out.
          const notice = message as { message?: string };
          if (typeof notice.message === "string") {
            setNotice(notice.message);
          }
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
        if (matchData.op_code === CARROM_OP.PLAYER_JOINED) {
          const joined = message as { username?: string };
          setNotice(`${joined.username ?? "A player"} joined the table.`);
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
      // The rating, the history, and the leaderboard are loaded with the
      // connection, so a player never has to ask for their own profile.
      void refreshProfileRef.current?.();

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
    } finally {
      connectingRef.current = false;
    }
  }, [applyServerState, options.autoJoinMatchId, options.autoSpectate]);

  const quickMatch = useCallback(
    async (
      seats: number,
      settings: CarromTableSettings = {},
    ): Promise<void> => {
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
        // who asked for the same game, table size, and game type are paired.
        const variant = settings.variant ?? "classic";
        const ticket = await socket.addMatchmaker(
          `+properties.game:carrom +properties.seats:${seats} +properties.variant:${variant}`,
          seats,
          seats,
          {
            game: GAME_ID,
            seats: String(seats),
            variant,
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
                variant: settings.variant,
                turnSeconds: settings.turnSeconds,
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
    async (
      seats: number,
      settings: CarromTableSettings = {},
    ): Promise<void> => {
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
          {
            seats,
            variant: settings.variant,
            turnSeconds: settings.turnSeconds,
          },
        );
        const parsed = (response.payload ?? {}) as {
          ok?: boolean;
          matchId?: string;
          roomCode?: string | null;
        };
        if (parsed.ok !== true || typeof parsed.matchId !== "string") {
          throw new Error("The private room could not be created.");
        }
        setRoomCode(parsed.roomCode ?? null);
        setRoomSeats(seats);
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
    setRoomCode(null);
    setRoomSeats(null);
    gameRef.current = null;
  }, []);

  const sendShot = useCallback(
    (shot: CarromShotInput, striker?: string): void => {
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
            striker,
          }),
        )
        .catch(() => {
          setError("The shot could not be sent.");
        });
    },
    [],
  );

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

  /**
   * The table connects by itself. A player should never have to press a
   * button to get into the game, so the connection is opened as soon as the
   * client loads and the account is picked up from the shared session.
   */
  useEffect(() => {
    void connect();
  }, [connect]);

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
      // Nakama encodes an empty Lua table as an object, so a player with no
      // finished games sends back `{}` instead of a list. Reading it as a
      // list would break the profile panel.
      setHistory(
        Array.isArray(profilePayload.history) ? profilePayload.history : [],
      );

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
      setLeaderboard(
        Array.isArray(leaderboardPayload.entries) ? leaderboardPayload.entries : [],
      );
      setMyLeaderboard(leaderboardPayload.me ?? null);
    } catch (cause) {
      setProfileError(
        cause instanceof Error ? cause.message : "The profile could not be loaded.",
      );
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfileRef.current = refreshProfile;
  }, [refreshProfile]);

  const clearAuthFeedback = useCallback((): void => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);
  const dismissOpponentLeft = useCallback((): void => {
    setOpponentLeft(null);
  }, []);

  /**
   * The friend list for the invite picker. Each relationship state is loaded
   * on its own, so a failure in one of them never hides the friends a player
   * already has.
   */
  const loadFriends = useCallback(async (): Promise<void> => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      setFriendsError("Connect to MoonGames before inviting a friend.");
      return;
    }
    setFriendsLoading(true);
    setFriendsError(null);
    try {
      const social = new MoonGamesSocialClient({ client, session });
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
        throw rejected?.reason ?? new Error("The friend list is unavailable.");
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
        cause instanceof Error
          ? cause.message
          : "The friend list could not be loaded.",
      );
    } finally {
      setFriendsLoading(false);
    }
  }, []);

  const clearInviteFeedback = useCallback((): void => {
    setInviteError(null);
    setInviteNotice(null);
  }, []);

  /** Invite a friend to the table the player is sitting at. */
  const inviteFriend = useCallback(
    async (input: CarromFriendInviteInput): Promise<boolean> => {
      const client = clientRef.current;
      const session = sessionRef.current;
      const targetMatchId = (matchIdRef.current ?? "").trim();
      if (client === null || session === null) {
        setInviteError("Connect to MoonGames before inviting a friend.");
        return false;
      }
      if (targetMatchId.length === 0) {
        setInviteError("Open a private table before inviting a friend.");
        return false;
      }
      setInviteSendingId(input.userId);
      setInviteError(null);
      setInviteNotice(null);
      try {
        const socket = socketRef.current;
        const social = new MoonGamesSocialClient({
          client,
          session,
          socket,
          selfUserId: session.user_id,
        });
        if (input.state === 1) {
          throw new Error(
            "That player still needs to accept your friend request. Once they do, they will appear here as a friend.",
          );
        }
        if (input.state === 2) {
          // An incoming request can be accepted from the picker.
          await social.acceptFriend({ userId: input.userId });
        }
        const invite = await social.createInvite({
          gameId: GAME_ID,
          mode: "private",
          matchId: targetMatchId,
          recipientId: input.userId,
          recipientUsername: input.username,
          metadata: { spectate: input.spectate === true },
        });
        if (socket !== null) {
          try {
            await social.sendInviteMessage(input.userId, invite);
          } catch {
            // The notification is still delivered even without the chat card.
          }
        }
        setInviteNotice(`Invite sent to ${input.username}.`);
        return true;
      } catch (cause) {
        setInviteError(
          cause instanceof Error
            ? cause.message
            : "The invitation could not be sent.",
        );
        return false;
      } finally {
        setInviteSendingId(null);
      }
    },
    [],
  );

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
        // The player is known by the name on the account, not by the email
        // they signed in with.
        const info = (await client.getAccount(session).catch(() => null)) as
          | { user?: { id?: string; username?: string } }
          | null;
        setAccount({
          kind: "email",
          username: info?.user?.username ?? email,
          email,
          userId: info?.user?.id ?? session.user_id ?? email,
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
    // Nakama sends an empty list as an empty object, so every list is only
    // used when it really is a list.
    seats: Array.isArray(state?.seats) ? state.seats : [],
    spectators: Array.isArray(state?.spectators) ? state.spectators : [],
    chat: Array.isArray(state?.chat) ? state.chat : [],
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
    friends,
    friendsLoading,
    friendsError,
    inviteSendingId,
    inviteError,
    inviteNotice,
    loadFriends,
    inviteFriend,
    clearInviteFeedback,
    signIn,
    signUp,
    signOut,
    connect,
    quickMatch,
    createPrivateRoom,
    joinMatch,
    joinByRoomCode,
    roomCode,
    roomSeats,
    leaveMatch,
    sendShot,
    sendChat,
    requestState,
    clearAnimation,
    setNotice,
  };
}
