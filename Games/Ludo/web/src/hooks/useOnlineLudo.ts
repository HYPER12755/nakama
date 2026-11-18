import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Session, type Socket } from "@heroiclabs/nakama-js";
import {
  accountCreationAllowed,
  insecureConnectionRequested,
  readLauncherHandoff,
  sameOriginServerAddress,
} from "@moongames/game-sdk";
import { LUDO_OP, type LudoColor, type LudoMove, type LudoState } from "@moongames/ludo-core";

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

function deviceId(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const created = `${GAME_ID}-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(DEVICE_KEY, created);
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
  myUserId: string | null;
  matchId: string | null;
  connect: () => Promise<void>;
  quickMatch: (seats: number, turnSeconds?: number) => Promise<void>;
  createPrivate: (seats: number, turnSeconds?: number) => Promise<void>;
  joinByCode: (code: string, spectator?: boolean) => Promise<void>;
  leave: () => Promise<void>;
  roll: () => void;
  move: (token: number) => void;
  chat: (text: string) => void;
  resign: () => void;
  clearNotice: () => void;
}

export function useOnlineLudo(enabled = true): OnlineLudoController {
  const [connection, setConnection] = useState<OnlineConnection>("offline");
  const [state, setState] = useState<OnlineState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [spectating, setSpectating] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const matchRef = useRef<string | null>(null);
  const connectingRef = useRef(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(async () => {
    if (connectingRef.current || socketRef.current) return;
    connectingRef.current = true;
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
      let session: Session;
      if (hostSession && !hostSession.isexpired(Date.now() / 1000)) {
        session = hostSession;
      } else if (hostSession && hostSession.refresh_token) {
        session = await client.sessionRefresh(hostSession);
      } else {
        session = await client.authenticateDevice(deviceId(), true);
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
        setSearching(false);
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
        fallbackRef.current = null;
        void socket.joinMatch(matched.match_id, matched.token).then(() => {
          matchRef.current = matched.match_id;
          setMatchId(matched.match_id);
        }).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Could not join the table.");
        });
      };
      socket.ondisconnect = () => {
        socketRef.current = null;
        setConnection("offline");
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
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void connect();
    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) void socket.disconnect(false);
    };
  }, [connect, enabled]);

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
    const socket = socketRef.current;
    const client = clientRef.current;
    const session = sessionRef.current;
    if (!socket || !client || !session) {
      await connect();
      return;
    }
    setSearching(true);
    setError(null);
    try {
      await socket.addMatchmaker(
        `+properties.game:ludo +properties.seats:${seats} +properties.turnSeconds:${turnSeconds}`,
        seats,
        seats,
        { game: GAME_ID, seats: String(seats), turnSeconds: String(turnSeconds) },
      );
      fallbackRef.current = setTimeout(() => {
        void (async () => {
          const response = await client.rpc(session, "ludo_quick_match", { seats, turnSeconds });
          const payload = response.payload as { ok?: boolean; matchId?: string };
          if (payload.ok === true && payload.matchId) {
            await joinMatch(payload.matchId);
            setSearching(false);
          }
        })().catch(() => undefined);
      }, 5000);
    } catch (cause) {
      setSearching(false);
      setError(cause instanceof Error ? cause.message : "The search could not start.");
    }
  }, [connect, joinMatch]);

  const createPrivate = useCallback(async (seats: number, turnSeconds = 0) => {
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
  }, [joinMatch]);

  const joinByCode = useCallback(async (code: string, spectator = false) => {
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
  }, [joinMatch]);

  const leave = useCallback(async () => {
    const socket = socketRef.current;
    const matchId = matchRef.current;
    if (socket && matchId) await socket.leaveMatch(matchId).catch(() => undefined);
    matchRef.current = null;
    setMatchId(null);
    setState(null);
    setRoomCode(null);
    setSpectating(false);
  }, []);

  const send = useCallback((op: number, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    const matchId = matchRef.current;
    if (!socket || !matchId) return;
    void socket.sendMatchState(matchId, op, JSON.stringify(payload)).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "The action could not be sent.");
    });
  }, []);

  return {
    connection,
    state,
    error,
    notice,
    searching,
    spectating,
    roomCode,
    accountName,
    myUserId,
    matchId,
    connect,
    quickMatch,
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
