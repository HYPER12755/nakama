import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";
import {
  MoonGamesSocialClient,
  signInWithMoonGames,
  signUpWithMoonGames,
} from "@moongames/social";
import {
  accountCreationAllowed,
  insecureConnectionRequested,
  matchStateBytes,
  readLauncherHandoff,
  sameOriginServerAddress,
  type GameHostConfig,
  type SocialFriend,
} from "@moongames/game-sdk";
import { LUDO_OP, type LudoColor, type LudoMove, type LudoState } from "@moongames/ludo-core";
import type {
  GameHistoryEntry,
  GameLeaderboardEntry,
  GameProfile,
  OnlineAuthAccount,
} from "@moongames/game-ui";

export { LUDO_OP };

export interface OnlineSeat {
  user_id: string;
  username: string;
  colour: LudoColor;
  connected: boolean;
}

export interface OnlineChat {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: number;
}

export interface OnlineResult {
  status: string;
  winnerColour?: LudoColor;
  winnerUserId?: string;
  reason?: string;
  endedAt?: number;
}

export interface OnlineState {
  game: LudoState | null;
  seats: OnlineSeat[];
  spectators: { user_id: string; username: string }[];
  chat: OnlineChat[];
  moves: {
    user_id: string;
    colour: LudoColor;
    token: number;
    from: number;
    to: number;
    captures: number;
    finished: number;
  }[];
  result: OnlineResult | null;
  turnDeadline: number | null;
  lastRoll: { user_id: string; colour: LudoColor; value: number; seat: number } | null;
  seatsCount: number;
}

export type OnlineConnection = "offline" | "connecting" | "connected" | "error";

const GAME_ID = __MOONGAMES_GAME_ID__;
const DEVICE_KEY = `moongames.${GAME_ID}.device`;
const SERVER_KEY = "defaultkey";

/**
 * A guest is one browser tab. Keeping the id in localStorage made two tabs on
 * the same device share one account, so the server could not seat both players
 * and the table waited forever.
 */
function deviceId(): string {
  try {
    const existing = window.sessionStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = `${GAME_ID}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.sessionStorage.setItem(DEVICE_KEY, created);
    window.localStorage.removeItem(DEVICE_KEY);
    return created;
  } catch {
    return `${GAME_ID}-${Date.now()}`;
  }
}

function serverAddress(nakama?: { host?: string; port?: string; useSSL?: boolean; serverKey?: string }) {
  const params = new URLSearchParams(window.location.search);
  const origin = sameOriginServerAddress();
  const host = nakama?.host ?? params.get("nakamaHost") ?? origin.host;
  const port = Number(nakama?.port ?? params.get("nakamaPort") ?? origin.port);
  const useSSL = nakama?.useSSL ?? (params.get("nakamaSSL") === "1" ? true : origin.useSSL);
  return {
    host: host || "127.0.0.1",
    port: String(Number.isFinite(port) && port > 0 ? port : origin.port),
    useSSL,
    serverKey: nakama?.serverKey ?? SERVER_KEY,
  };
}

function sessionFromConfig(token?: string, refresh?: string): Session | null {
  if (typeof token !== "string" || token.length === 0) return null;
  try {
    return Session.restore(token, refresh ?? "");
  } catch {
    return null;
  }
}

/** An empty Lua table is encoded as `{}`; the client must still see arrays. */
export function normalizeState(message: Record<string, unknown>): OnlineState {
  const state = message as unknown as OnlineState;
  const game = state.game;
  return {
    ...state,
    game: game == null ? null : {
      ...game,
      events: Array.isArray(game.events) ? game.events : [],
      ranking: Array.isArray(game.ranking) ? game.ranking : [],
      players: Array.isArray(game.players) ? game.players : [],
    },
    seats: Array.isArray(state.seats) ? state.seats : [],
    spectators: Array.isArray(state.spectators) ? state.spectators : [],
    chat: Array.isArray(state.chat) ? state.chat : [],
    moves: Array.isArray(state.moves) ? state.moves : [],
  };
}

function decode(data: Uint8Array | string): Record<string, unknown> {
  const text = typeof data === "string" ? data : new TextDecoder().decode(data);
  const parsed = JSON.parse(text);
  return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : {};
}

export interface OnlineLudoController {
  connection: OnlineConnection;
  state: OnlineState | null;
  error: string | null;
  notice: string | null;
  searching: boolean;
  spectating: boolean;
  roomCode: string | null;
  accountName: string | null;
  account: OnlineAuthAccount | null;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthFeedback: () => void;
  myUserId: string | null;
  myColour: LudoColor | null;
  matchId: string | null;
  profile: GameProfile | null;
  history: GameHistoryEntry[];
  leaderboard: GameLeaderboardEntry[];
  profileLoading: boolean;
  profileError: string | null;
  friends: SocialFriend[];
  friendsLoading: boolean;
  friendsError: string | null;
  inviteSendingId: string | null;
  inviteError: string | null;
  inviteNotice: string | null;
  loadFriends: () => Promise<void>;
  inviteFriend: (input: {
    userId: string;
    username: string;
    state: number;
    matchId: string;
    spectate: boolean;
  }) => Promise<void>;
  refreshProfile: () => Promise<void>;
  connect: () => Promise<void>;
  quickMatch: (seats: number, turnSeconds?: number) => Promise<void>;
  cancelQuickMatch: () => void;
  createPrivate: (seats: number, turnSeconds?: number) => Promise<string>;
  joinByCode: (code: string, spectator?: boolean) => Promise<void>;
  leave: () => Promise<void>;
  roll: () => void;
  move: (token: number) => void;
  chat: (text: string) => void;
  resign: () => void;
  clearNotice: () => void;
}

export function useOnlineLudo(
  enabled = true,
  hostConfig: GameHostConfig | null = null,
): OnlineLudoController {
  const [connection, setConnection] = useState<OnlineConnection>("offline");
  const [state, setState] = useState<OnlineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [account, setAccount] = useState<OnlineAuthAccount | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<GameLeaderboardEntry[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const matchRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRunRef = useRef(0);
  const ticketRef = useRef<string | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socialRef = useRef<MoonGamesSocialClient | null>(null);
  const friendsPromiseRef = useRef<Promise<void> | null>(null);
  const pendingAuthRef = useRef<{
    mode: "sign-in" | "sign-up";
    email: string;
    password: string;
    username?: string;
  } | null>(null);

  const clearSearchTimer = useCallback(() => {
    if (searchTimerRef.current !== null) {
      clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
  }, []);

  const cancelSearch = useCallback(() => {
    searchRunRef.current += 1;
    clearSearchTimer();
    const ticket = ticketRef.current;
    ticketRef.current = null;
    setSearching(false);
    if (ticket !== null && socketRef.current !== null) {
      void socketRef.current.removeMatchmaker(ticket).catch(() => {
        // The ticket may already be paired or gone.
      });
    }
  }, [clearSearchTimer]);

  const connect = useCallback(async () => {
    if (connectingRef.current || socketRef.current) return;
    connectingRef.current = true;
    // Never reuse a social client bound to an old session/token.
    socialRef.current = null;
    friendsPromiseRef.current = null;
    setConnection("connecting");
    try {
      const config = readLauncherHandoff(GAME_ID);
      const address = serverAddress(config?.nakama);
      if (sessionFromConfig(config?.session?.token, config?.session?.refreshToken) === null
        && !accountCreationAllowed({
          host: address.host,
          useSSL: address.useSSL,
          allowInsecure:
            config?.nakama?.allowInsecure === true
            || insecureConnectionRequested(window.location.search),
        })) {
        throw new Error("A secure connection is required before an account can be created.");
      }
      const client = new Client(address.serverKey, address.host, address.port, address.useSSL);
      const hostSession = sessionFromConfig(config?.session?.token, config?.session?.refreshToken);
      const pendingAuth = pendingAuthRef.current;
      let session: Session;
      if (pendingAuth !== null) {
        session = pendingAuth.mode === "sign-in"
          ? await signInWithMoonGames({ client, email: pendingAuth.email, password: pendingAuth.password })
          : await signUpWithMoonGames({
            client,
            email: pendingAuth.email,
            password: pendingAuth.password,
            username: pendingAuth.username,
          });
        setAccount({
          kind: "email",
          userId: session.user_id ?? "",
          username: session.username ?? pendingAuth.username ?? pendingAuth.email,
          email: pendingAuth.email,
        });
        pendingAuthRef.current = null;
      } else if (hostSession && !hostSession.isexpired(Date.now() / 1000)) {
        session = hostSession;
        setAccount({
          kind: "host",
          userId: session.user_id ?? "",
          username: session.username ?? "MoonGames player",
          email: null,
        });
      } else if (hostSession && hostSession.refresh_token) {
        session = await client.sessionRefresh(hostSession);
        setAccount({
          kind: "host",
          userId: session.user_id ?? "",
          username: session.username ?? "MoonGames player",
          email: null,
        });
      } else {
        session = await client.authenticateDevice(deviceId(), true);
        setAccount({
          kind: "guest",
          userId: session.user_id ?? "",
          username: session.username ?? "Player",
          email: null,
        });
      }
      const socket = client.createSocket(address.useSSL, false);
      await socket.connect(session, true);

      socket.onmatchdata = (data) => {
        let message: Record<string, unknown>;
        try {
          message = decode(data.data);
        } catch {
          return;
        }
        if (data.op_code === LUDO_OP.STATE) {
          setState(normalizeState(message));
          setError(null);
          return;
        }
        if (data.op_code === LUDO_OP.CHAT) {
          setState((current) => current ? {
            ...current,
            chat: [...current.chat, {
              id: String(message.id ?? Date.now()),
              userId: String(message.user_id ?? ""),
              username: String(message.username ?? "Player"),
              text: String(message.text ?? ""),
              sentAt: Number(message.at ?? Date.now()),
            }],
          } : current);
          return;
        }
        if (data.op_code === LUDO_OP.PLAYER_JOINED) {
          setNotice(`${String(message.username ?? "A player")} joined the table.`);
          return;
        }
        if (data.op_code === LUDO_OP.PLAYER_LEFT) {
          setNotice(`${String(message.username ?? "A player")} left the table.`);
          return;
        }
        if (data.op_code === LUDO_OP.GAME_OVER) {
          setNotice("The race is finished.");
          return;
        }
        if (data.op_code === LUDO_OP.ERROR) {
          setError(String(message.message ?? "The server refused that request."));
        }
      };
      socket.onmatchmakermatched = (matched) => {
        cancelSearch();
        void socket.joinMatch(matched.match_id, matched.token).then(() => {
          matchRef.current = matched.match_id;
          setMatchId(matched.match_id);
        }).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Could not join the table.");
        });
      };
      socket.ondisconnect = () => {
        cancelSearch();
        socketRef.current = null;
        setConnection("offline");
        const joined = matchRef.current;
        if (joined === null) {
          return;
        }
        reconnectRef.current = setTimeout(() => {
          reconnectRef.current = null;
          if (socketRef.current !== null || matchRef.current === null) {
            return;
          }
          void connect().then(() => {
            const live = socketRef.current;
            const current = matchRef.current;
            if (live === null || current === null) {
              return;
            }
            void live.joinMatch(current).catch(() => {
              setNotice("The table could not be rejoined. Open a new one.");
              matchRef.current = null;
              setMatchId(null);
              setState(null);
            });
          });
        }, 1200);
      };
      socket.onerror = () => setError("The realtime connection reported an error.");

      clientRef.current = client;
      socketRef.current = socket;
      sessionRef.current = session;
      setConnection("connected");
      const account = await client.getAccount(session).catch(() => null) as
        | { user?: { username?: string } }
        | null;
      setAccountName(account?.user?.username ?? session.username ?? "Guest");
      setMyUserId(session.user_id ?? null);
    } catch (cause) {
      setConnection("error");
      setError(cause instanceof Error ? cause.message : "The realtime connection failed.");
    } finally {
      connectingRef.current = false;
    }
  }, [cancelSearch]);

  const refreshProfile = useCallback(async () => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (!client || !session) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const [profileResponse, leaderboardResponse] = await Promise.all([
        client.rpc(session, "ludo_get_profile", {}),
        client.rpc(session, "ludo_get_leaderboard", { limit: 10 }),
      ]);
      const profilePayload = profileResponse.payload as {
        ok?: boolean;
        profile?: GameProfile;
        history?: GameHistoryEntry[];
        error?: { message?: string };
      };
      const leaderboardPayload = leaderboardResponse.payload as {
        ok?: boolean;
        entries?: GameLeaderboardEntry[];
      };
      if (profilePayload.ok !== true) {
        setProfileError(profilePayload.error?.message ?? "The profile could not be loaded.");
        return;
      }
      setProfile(profilePayload.profile ?? null);
      setHistory(Array.isArray(profilePayload.history) ? profilePayload.history : []);
      setLeaderboard(Array.isArray(leaderboardPayload.entries) ? leaderboardPayload.entries : []);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "The profile could not be loaded.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void connect();
    return () => {
      clearSearchTimer();
      if (reconnectRef.current !== null) {
        clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) void socket.disconnect(false);
    };
  }, [clearSearchTimer, connect, enabled]);

  useEffect(() => {
    if (enabled && connection === "connected") void refreshProfile();
  }, [enabled, connection, refreshProfile]);

  const joinMatch = useCallback(async (matchId: string, spectator = false) => {
    const socket = socketRef.current;
    if (!socket) throw new Error("The realtime connection is not ready yet.");
    if (matchRef.current && matchRef.current !== matchId) {
      await socket.leaveMatch(matchRef.current).catch(() => undefined);
    }
    await socket.joinMatch(matchId, undefined, spectator ? { spectate: "1" } : undefined);
    matchRef.current = matchId;
    setMatchId(matchId);
    setSpectating(spectator);
    setError(null);
  }, []);

  const quickMatch = useCallback(async (seats: number, turnSeconds = 0) => {
    if (searchTimerRef.current !== null) {
      setError("A quick match search is already running.");
      return;
    }
    if (matchRef.current !== null) {
      setError("Leave the current table before starting a quick match.");
      return;
    }
    let socket = socketRef.current;
    if (socket === null) {
      await connect();
      socket = socketRef.current;
    }
    if (socket === null) {
      setError("The realtime connection is not ready yet.");
      return;
    }
    const run = searchRunRef.current + 1;
    searchRunRef.current = run;
    setError(null);
    setSearching(true);
    try {
      const ticket = await socket.addMatchmaker(
        `+properties.game:ludo +properties.seats:${seats} +properties.turnSeconds:${turnSeconds}`,
        seats,
        seats,
        { game: GAME_ID, seats: String(seats), turnSeconds: String(turnSeconds) },
      );
      if (run !== searchRunRef.current) {
        try {
          await socket.removeMatchmaker(ticket.ticket);
        } catch {
          // The ticket may already be gone.
        }
        return;
      }
      ticketRef.current = ticket.ticket;
      searchTimerRef.current = setTimeout(() => {
        if (run !== searchRunRef.current) {
          return;
        }
        const active = socketRef.current;
        const current = ticketRef.current;
        if (active !== null && current !== null) {
          void active.removeMatchmaker(current).catch(() => {
            // The ticket may already be paired or gone.
          });
        }
        ticketRef.current = null;
        searchTimerRef.current = null;
        setSearching(false);
        setError("No opponent found. Try again.");
      }, 60000);
    } catch (cause) {
      if (run === searchRunRef.current) {
        setSearching(false);
        setError(cause instanceof Error ? cause.message : "The search could not start.");
      }
    }
  }, [connect]);

  const cancelQuickMatch = useCallback(() => {
    if (searchTimerRef.current === null) {
      return;
    }
    cancelSearch();
  }, [cancelSearch]);

  const createPrivate = useCallback(async (seats: number, turnSeconds = 0) => {
    cancelSearch();
    const client = clientRef.current;
    const session = sessionRef.current;
    if (!client || !session) throw new Error("The realtime connection is not ready yet.");
    const response = await client.rpc(session, "ludo_create_private_match", { seats, turnSeconds });
    const payload = response.payload as { ok?: boolean; matchId?: string; roomCode?: string };
    if (payload.ok !== true || !payload.matchId) {
      throw new Error("The private room could not be created.");
    }
    await joinMatch(payload.matchId);
    setRoomCode(payload.roomCode ?? null);
    return payload.matchId;
  }, [cancelSearch, joinMatch]);

  const joinByCode = useCallback(async (code: string, spectator = false) => {
    cancelSearch();
    const client = clientRef.current;
    const session = sessionRef.current;
    if (!client || !session) throw new Error("The realtime connection is not ready yet.");
    const response = await client.rpc(session, "moongames_room_code_resolve", {
      code: code.trim(),
      gameId: GAME_ID,
    });
    const payload = response.payload as {
      ok?: boolean; matchId?: string; code?: string; error?: { message?: string };
    };
    if (payload.ok !== true || !payload.matchId) {
      throw new Error(payload.error?.message ?? "That room code was not found.");
    }
    await joinMatch(payload.matchId, spectator);
    setRoomCode(payload.code ?? code.trim().toUpperCase());
  }, [cancelSearch, joinMatch]);

  const leave = useCallback(async () => {
    cancelSearch();
    const socket = socketRef.current;
    const matchId = matchRef.current;
    if (socket && matchId) await socket.leaveMatch(matchId).catch(() => undefined);
    socialRef.current = null;
    friendsPromiseRef.current = null;
    matchRef.current = null;
    setMatchId(null);
    setState(null);
    setRoomCode(null);
    setSpectating(false);
    setSearching(false);
  }, [cancelSearch]);

  const send = useCallback((op: number, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    const matchId = matchRef.current;
    if (!socket || !matchId) return;
    void socket.sendMatchState(matchId, op, matchStateBytes(payload)).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "The action could not be sent.");
    });
  }, []);

  const loadFriends = useCallback(async (): Promise<void> => {
    if (friendsPromiseRef.current !== null) return friendsPromiseRef.current;
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      setFriendsError("Connect to the game server to load your friends.");
      return;
    }
    setFriendsLoading(true);
    setFriendsError(null);
    const request = (async () => {
      try {
        const social = socialRef.current ?? new MoonGamesSocialClient({
          client,
          session,
          socket: socketRef.current,
          selfUserId: session.user_id,
        });
        socialRef.current = social;
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
            (result): result is PromiseRejectedResult => result.status === "rejected",
          );
          throw rejected?.reason ?? new Error("Friend list unavailable.");
        }
        const byId = new Map<string, SocialFriend>();
        for (const group of groups) {
          for (const friend of group) byId.set(friend.userId, friend);
        }
        const rank = (friendState: number) =>
          friendState === 0 ? 0 : friendState === 2 ? 1 : friendState === 1 ? 2 : 3;
        setFriends([...byId.values()].sort((left, right) =>
          rank(left.state) - rank(right.state) ||
          left.username.localeCompare(right.username, undefined, { sensitivity: "base" }),
        ));
      } catch (cause) {
        setFriendsError(cause instanceof Error ? cause.message : "Could not load your MoonGames friends.");
      } finally {
        setFriendsLoading(false);
        friendsPromiseRef.current = null;
      }
    })();
    friendsPromiseRef.current = request;
    await request;
  }, []);

  const inviteFriend = useCallback(async (input: {
    userId: string;
    username: string;
    state: number;
    matchId: string;
    spectate: boolean;
  }): Promise<void> => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      throw new Error("Connect to the game server first.");
    }
    setInviteSendingId(input.userId);
    setInviteError(null);
    setInviteNotice(null);
    try {
      const social = socialRef.current ?? new MoonGamesSocialClient({
        client,
        session,
        socket: socketRef.current,
        selfUserId: session.user_id,
      });
      socialRef.current = social;
      if (input.state === 1) {
        throw new Error("That player must accept your friend request first.");
      }
      if (input.state === 2) await social.acceptFriend({ userId: input.userId });
      const invite = await social.createInvite({
        gameId: GAME_ID,
        mode: "private",
        matchId: input.matchId,
        recipientId: input.userId,
        recipientUsername: input.username,
        metadata: { spectate: input.spectate },
      });
      let chatCardSent = false;
      if (socketRef.current !== null) {
        try {
          await social.sendInviteMessage(input.userId, invite);
          chatCardSent = true;
        } catch {
          // The persistent notification remains authoritative.
        }
      }
      setInviteNotice(chatCardSent
        ? `Invite sent to ${input.username}.`
        : `Invite sent to ${input.username}. The chat card could not be delivered, but the invite is waiting in MoonGames.`);
    } catch (cause) {
      setInviteError(cause instanceof Error ? cause.message : "Could not send that friend invitation.");
      throw cause;
    } finally {
      setInviteSendingId(null);
    }
  }, []);

  const disconnect = useCallback(async () => {
    cancelSearch();
    if (reconnectRef.current !== null) {
      clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    const socket = socketRef.current;
    if (socket !== null) {
      try { (socket as unknown as { close?: () => void }).close?.(); } catch { /* already closed */ }
    }
    socketRef.current = null;
    sessionRef.current = null;
    matchRef.current = null;
    socialRef.current = null;
    friendsPromiseRef.current = null;
    setMatchId(null);
    setState(null);
    setRoomCode(null);
    setSpectating(false);
    setSearching(false);
    setConnection("offline");
  }, [cancelSearch]);

  const clearAuthFeedback = useCallback(() => {
    setAuthError(null);
    setAuthNotice(null);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      pendingAuthRef.current = { mode: "sign-in", email, password };
      await disconnect();
      await connect();
      setAuthNotice("Signed in. Your rating and history are now synced.");
    } catch (cause) {
      pendingAuthRef.current = null;
      setAuthError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setAuthBusy(false);
    }
  }, [connect, disconnect]);

  const signUp = useCallback(async (email: string, password: string, username?: string) => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      pendingAuthRef.current = { mode: "sign-up", email, password, username };
      await disconnect();
      await connect();
      setAuthNotice("Account created. Welcome to MoonGames.");
    } catch (cause) {
      pendingAuthRef.current = null;
      setAuthError(cause instanceof Error ? cause.message : "Sign-up failed.");
    } finally {
      setAuthBusy(false);
    }
  }, [connect, disconnect]);

  const signOut = useCallback(async () => {
    setAuthBusy(true);
    setAuthError(null);
    setAuthNotice(null);
    try {
      pendingAuthRef.current = null;
      await disconnect();
      await connect();
      setAuthNotice("Signed out. You are playing as a guest.");
    } catch (cause) {
      setAuthError(cause instanceof Error ? cause.message : "Sign-out failed.");
    } finally {
      setAuthBusy(false);
    }
  }, [connect, disconnect]);

  const myColour = state?.seats.find((seat) => seat.user_id === myUserId)?.colour ?? null;

  return {
    connection,
    state,
    error,
    notice,
    searching,
    spectating,
    roomCode,
    accountName,
    account,
    authBusy,
    authError,
    authNotice,
    signIn,
    signUp,
    signOut,
    clearAuthFeedback,
    myUserId,
    myColour,
    matchId,
    profile,
    history,
    leaderboard,
    profileLoading,
    profileError,
    friends,
    friendsLoading,
    friendsError,
    inviteSendingId,
    inviteError,
    inviteNotice,
    loadFriends,
    inviteFriend,
    refreshProfile,
    connect,
    quickMatch,
    cancelQuickMatch,
    createPrivate,
    joinByCode,
    leave,
    roll: () => send(LUDO_OP.ROLL_REQUEST, {}),
    move: (token: number) => send(LUDO_OP.MOVE_REQUEST, { token }),
    chat: (text: string) => send(LUDO_OP.CHAT_SEND, { text }),
    resign: () => send(LUDO_OP.RESIGN, {}),
    clearNotice: () => setNotice(null),
  };
}
