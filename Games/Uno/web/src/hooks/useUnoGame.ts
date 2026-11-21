import { useCallback, useEffect, useRef, useState } from "react";
import { Client, Session, Socket } from "@heroiclabs/nakama-js";
import {
  accountCreationAllowed,
  insecureConnectionRequested,
  matchStateBytes,
  readLauncherHandoff,
  sameOriginServerAddress,
} from "@moongames/game-sdk";
import {
  UNO_OP,
  applyAction,
  chooseAction,
  createGame,
  type Action,
  type Color,
  type GameState,
} from "@moongames/uno-core";
import { normalizeList, viewFromCore, type BoardView } from "../lib/view";

const GAME_ID = __MOONGAMES_GAME_ID__;
const DEVICE_KEY = `moongames.${GAME_ID}.deviceId`;

function deviceId(): string {
  try {
    const existing = sessionStorage.getItem(DEVICE_KEY);
    if (existing !== null && existing !== "") {
      return existing;
    }
    const created = crypto.randomUUID();
    sessionStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return "uno-device";
  }
}

function serverAddress() {
  const config = readLauncherHandoff(GAME_ID);
  if (config?.nakama) {
    return config.nakama;
  }
  return sameOriginServerAddress(window.location);
}

function normalizeView(payload: Record<string, unknown>, myUserId: string | null): BoardView {
  const players = normalizeList(payload.players).map((value, index) => {
    const player = value as Record<string, unknown>;
    return {
      seat: Number(player.seat ?? index),
      userId: String(player.userId ?? ""),
      username: String(player.username ?? "Player"),
      connected: player.connected !== false,
      count: Number(player.count ?? 0),
      hand: Array.isArray(player.hand) ? (player.hand as BoardView["players"][number]["hand"]) : undefined,
    };
  });
  const spectators = normalizeList(payload.spectators).map((value, index) => {
    const spectator = value as Record<string, unknown>;
    return {
      seat: index,
      userId: String(spectator.userId ?? ""),
      username: String(spectator.username ?? "Player"),
      connected: true,
      count: 0,
    };
  });
  const chat = normalizeList(payload.chat).map((value) => {
    const message = value as Record<string, unknown>;
    return {
      id: String(message.id ?? ""),
      userId: String(message.userId ?? ""),
      username: String(message.username ?? "Player"),
      text: String(message.text ?? ""),
      at: Number(message.at ?? 0),
      sentAt: Number(message.at ?? 0),
    };
  });
  const resultValue = payload.result as Record<string, unknown> | null | undefined;
  return {
    players,
    spectators,
    chat,
    topCard: (payload.topCard as BoardView["topCard"]) ?? null,
    currentColor: (payload.currentColor as Color | null) ?? null,
    turn: Number(payload.turn ?? 0),
    direction: payload.direction === -1 ? -1 : 1,
    deckCount: Number(payload.deckCount ?? 0),
    pendingChallenge: (payload.pendingChallenge as BoardView["pendingChallenge"]) ?? null,
    legalCards: normalizeList(payload.legalCards).map(String),
    canDraw: payload.canDraw === true,
    result: resultValue == null ? null : {
      status: String(resultValue.status ?? "finished"),
      winnerUserId: resultValue.winnerUserId == null ? null : String(resultValue.winnerUserId),
      reason: resultValue.reason == null ? undefined : String(resultValue.reason),
    },
    myUserId,
    started: payload.started === true,
  };
}

function emptyView(myUserId: string | null): BoardView {
  return {
    players: [], spectators: [], chat: [], topCard: null, currentColor: null,
    turn: 0, direction: 1, deckCount: 0, pendingChallenge: null,
    legalCards: [], canDraw: false, result: null, myUserId, started: false,
  };
}

export interface UnoController {
  cardSet: "classic" | "neon";
  setCardSet: (set: "classic" | "neon") => void;
  dealKey: number;
  mode: "local" | "online";
  setMode: (mode: "local" | "online") => void;
  seats: number;
  setSeats: (seats: number) => void;
  connection: string;
  searching: boolean;
  searchSeconds: number;
  error: string | null;
  notice: string | null;
  roomCode: string | null;
  myUserId: string | null;
  view: BoardView;
  profile: Record<string, unknown> | null;
  profileLoading: boolean;
  profileError: string | null;
  history: unknown[];
  leaderboard: unknown[];
  leaderboardTotal: number;
  myLeaderboard: Record<string, unknown> | null;
  matchId: string | null;
  spectating: boolean;
  account: Record<string, unknown> | null;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
  quickMatch: (seats: number) => Promise<void>;
  cancelQuickMatch: () => void;
  createPrivate: (seats: number) => Promise<void>;
  joinByCode: (code: string) => Promise<void>;
  leave: () => Promise<void>;
  play: (cardId: string, chosenColor?: Color) => void;
  draw: () => void;
  challenge: (accept: boolean) => void;
  sendChat: (text: string) => void;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthFeedback: () => void;
  resign: () => void;
  chat: (text: string) => void;
  newGame: () => void;
  rematch: () => Promise<void>;
}

export function useUnoGame(): UnoController {
  const [cardSet, setCardSetState] = useState<"classic" | "neon">((): "classic" | "neon" => {
    try {
      return localStorage.getItem("moongames.uno.cardSet") === "neon" ? "neon" : "classic";
    } catch {
      return "classic";
    }
  });
  const [dealKey, setDealKey] = useState(0);
  const [mode, setModeState] = useState<"local" | "online">("local");
  const [seats, setSeats] = useState(2);
  const [localGame, setLocalGame] = useState<GameState | null>(null);
  const [onlineView, setOnlineView] = useState<BoardView>(emptyView(null));
  const [connection, setConnection] = useState("offline");
  const [searching, setSearching] = useState(false);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [history, setHistory] = useState<unknown[]>([]);
  const [leaderboard, setLeaderboard] = useState<unknown[]>([]);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [myLeaderboard, setMyLeaderboard] = useState<Record<string, unknown> | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [spectating] = useState(false);
  const [account] = useState<Record<string, unknown> | null>(null);
  const [authBusy] = useState(false);
  const [authError] = useState<string | null>(null);
  const [authNotice] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const ticketRef = useRef<string | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const searchRunRef = useRef(0);
  const reconnectRef = useRef<number | null>(null);
  const connectingRef = useRef(false);

  const setCardSet = useCallback((set: "classic" | "neon") => {
    setCardSetState(set);
    try {
      localStorage.setItem("moongames.uno.cardSet", set);
    } catch {
      return;
    }
  }, []);

  const clearSearch = useCallback(() => {
    searchRunRef.current += 1;
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    const ticket = ticketRef.current;
    ticketRef.current = null;
    setSearching(false);
    setSearchSeconds(0);
    if (ticket !== null && socketRef.current !== null) {
      void socketRef.current.removeMatchmaker(ticket).catch(() => undefined);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      return;
    }
    setProfileLoading(true);
    setProfileError(null);
    try {
      const [profileResponse, leaderboardResponse] = await Promise.all([
        client.rpc(session, "uno_get_profile", {}),
        client.rpc(session, "uno_get_leaderboard", { limit: 10 }),
      ]);
      const profilePayload = profileResponse.payload as Record<string, unknown>;
      const leaderboardPayload = leaderboardResponse.payload as Record<string, unknown>;
      if (profilePayload?.ok === true) {
        setProfile((profilePayload.profile as Record<string, unknown>) ?? null);
        setHistory(Array.isArray(profilePayload.history) ? profilePayload.history : []);
      }
      if (leaderboardPayload?.ok === true) {
        setLeaderboard(Array.isArray(leaderboardPayload.entries) ? leaderboardPayload.entries : []);
        setLeaderboardTotal(Number(leaderboardPayload.total ?? 0));
        setMyLeaderboard((leaderboardPayload.me as Record<string, unknown>) ?? null);
      }
    } catch {
      setProfileError("Could not load your profile.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current || socketRef.current !== null) {
      return;
    }
    connectingRef.current = true;
    setConnection("connecting");
    try {
      const address = serverAddress();
      if (
        !address.useSSL &&
        !accountCreationAllowed({
          host: address.host,
          useSSL: address.useSSL,
          allowInsecure: insecureConnectionRequested(window.location.search),
        })
      ) {
        throw new Error("Use HTTPS for a remote server.");
      }
      const client = new Client(address.serverKey, address.host, address.port, address.useSSL);
      const session = await client.authenticateDevice(deviceId(), true);
      const socket = client.createSocket(address.useSSL, false);
      await socket.connect(session, true);

      socket.onmatchdata = (data) => {
        let payload: Record<string, unknown> = {};
        try {
          payload = JSON.parse(new TextDecoder().decode(data.data)) as Record<string, unknown>;
        } catch {
          return;
        }
        if (data.op_code === UNO_OP.STATE) {
          setOnlineView(normalizeView(payload, session.user_id ?? null));
          setError(null);
        } else if (data.op_code === UNO_OP.CHAT) {
          setOnlineView((current) => ({
            ...current,
            chat: [...current.chat, {
              id: String(payload.id ?? Date.now()),
              userId: String(payload.userId ?? ""),
              username: String(payload.username ?? "Player"),
              text: String(payload.text ?? ""),
              at: Number(payload.at ?? Date.now()),
              sentAt: Number(payload.at ?? Date.now()),
            }],
          }));
        } else if (data.op_code === UNO_OP.GAME_OVER) {
          setNotice("The hand is finished.");
        } else if (data.op_code === UNO_OP.ERROR) {
          setError(String(payload.message ?? "The server refused that move."));
        }
      };

      socket.onmatchmakermatched = (matched) => {
        clearSearch();
        void (async () => {
          await socket.joinMatch(matched.match_id, matched.token ?? undefined);
          matchIdRef.current = matched.match_id;
          setMatchId(matched.match_id);
          setDealKey((value) => value + 1);
          setRoomCode(null);
        })().catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "Could not join the table.");
        });
      };

      socket.ondisconnect = () => {
        clearSearch();
        socketRef.current = null;
        setConnection("offline");
        const joined = matchIdRef.current;
        if (joined === null) {
          return;
        }
        reconnectRef.current = window.setTimeout(() => {
          reconnectRef.current = null;
          if (socketRef.current !== null || matchIdRef.current === null) {
            return;
          }
          void connect().then(() => {
            const live = socketRef.current;
            const current = matchIdRef.current;
            if (live !== null && current !== null) {
              void live.joinMatch(current).catch(() => undefined);
            }
          });
        }, 1200);
      };

      socket.onerror = () => setError("The realtime connection reported an error.");

      clientRef.current = client;
      sessionRef.current = session;
      socketRef.current = socket;
      setMyUserId(session.user_id ?? null);
      setConnection("connected");
      await refreshProfile();
    } catch (cause) {
      setConnection("error");
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      connectingRef.current = false;
    }
  }, [clearSearch, refreshProfile]);

  useEffect(() => {
    return () => {
      clearSearch();
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
      }
      socketRef.current?.disconnect(false);
    };
  }, [clearSearch]);

  useEffect(() => {
    if (searching) {
      const timer = window.setInterval(() => setSearchSeconds((value) => value + 1), 1000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [searching]);

  const startLocal = useCallback((count: number) => {
    const ids = ["local", "ai1", "ai2", "ai3"].slice(0, count);
    setLocalGame(createGame(Date.now() >>> 0, ids.map((id) => ({ id, name: id === "local" ? "You" : "Computer" }))));
    setDealKey((value) => value + 1);
    setModeState("local");
    setMyUserId("local");
    setError(null);
  }, []);

  useEffect(() => {
    if (mode !== "local" || localGame === null || localGame.finished) {
      return;
    }
    const actor = localGame.players[localGame.turn];
    if (actor.id === "local") {
      return;
    }
    const timer = window.setTimeout(() => {
      const action = chooseAction(localGame, actor.id);
      if (action === null) {
        return;
      }
      const result = applyAction(localGame, action);
      if (result.ok) {
        setLocalGame(result.state);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [localGame, mode]);

  const setMode = useCallback((next: "local" | "online") => {
    if (next === "local") {
      clearSearch();
      setModeState("local");
      startLocal(seats);
      return;
    }
    setModeState("online");
    void connect();
  }, [clearSearch, connect, seats, startLocal]);

  const joinMatch = useCallback(async (matchId: string, token?: string) => {
    const socket = socketRef.current;
    if (socket === null) {
      throw new Error("The realtime connection is not ready yet.");
    }
    await socket.joinMatch(matchId, token);
    matchIdRef.current = matchId;
    setMatchId(matchId);
    setDealKey((value) => value + 1);
    setError(null);
  }, []);

  const quickMatch = useCallback(async (count: number) => {
    clearSearch();
    if (socketRef.current === null) {
      await connect();
    }
    const socket = socketRef.current;
    if (socket === null) {
      return;
    }
    const run = searchRunRef.current + 1;
    searchRunRef.current = run;
    setSearching(true);
    setError(null);
    try {
      const ticket = await socket.addMatchmaker(
        `+properties.game:uno +properties.seats:${count}`,
        count,
        count,
        { game: GAME_ID, seats: String(count) },
      );
      if (run !== searchRunRef.current) {
        await socket.removeMatchmaker(ticket.ticket).catch(() => undefined);
        return;
      }
      ticketRef.current = ticket.ticket;
      searchTimerRef.current = window.setTimeout(() => {
        if (run !== searchRunRef.current) {
          return;
        }
        clearSearch();
        setError("No opponent found. Try again.");
      }, 60000);
    } catch (cause) {
      setSearching(false);
      setError(cause instanceof Error ? cause.message : "The search could not start.");
    }
  }, [clearSearch, connect]);

  const createPrivate = useCallback(async (count: number) => {
    clearSearch();
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      await connect();
    }
    const liveClient = clientRef.current;
    const liveSession = sessionRef.current;
    if (liveClient === null || liveSession === null) {
      return;
    }
    try {
      const response = await liveClient.rpc(liveSession, "uno_create_private_match", { seats: count });
      const payload = response.payload as Record<string, unknown>;
      if (payload?.ok !== true || typeof payload.matchId !== "string") {
        throw new Error("The private room could not be created.");
      }
      setRoomCode(typeof payload.roomCode === "string" ? payload.roomCode : null);
      await joinMatch(payload.matchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The private room could not be created.");
    }
  }, [clearSearch, connect, joinMatch]);

  const joinByCode = useCallback(async (code: string) => {
    clearSearch();
    const client = clientRef.current;
    const session = sessionRef.current;
    if (client === null || session === null) {
      await connect();
    }
    const liveClient = clientRef.current;
    const liveSession = sessionRef.current;
    if (liveClient === null || liveSession === null || code.trim() === "") {
      return;
    }
    try {
      const response = await liveClient.rpc(liveSession, "moongames_room_code_resolve", {
        code: code.trim(),
        gameId: GAME_ID,
      });
      const payload = response.payload as Record<string, unknown>;
      if (payload?.ok !== true || typeof payload.matchId !== "string") {
        throw new Error("That room code was not found.");
      }
      setRoomCode(String(payload.code ?? code.trim().toUpperCase()));
      await joinMatch(payload.matchId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join that room.");
    }
  }, [clearSearch, connect, joinMatch]);

  const leave = useCallback(async () => {
    clearSearch();
    const socket = socketRef.current;
    const joined = matchIdRef.current;
    if (socket !== null && joined !== null) {
      await socket.leaveMatch(joined).catch(() => undefined);
    }
    matchIdRef.current = null;
    setMatchId(null);
    setRoomCode(null);
    setOnlineView(emptyView(myUserId));
  }, [clearSearch, myUserId]);

  const send = useCallback((op: number, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    const joined = matchIdRef.current;
    if (socket === null || joined === null) {
      return;
    }
    void socket.sendMatchState(joined, op, matchStateBytes(payload)).catch(() => undefined);
  }, []);

  const play = useCallback((cardId: string, chosenColor?: Color) => {
    if (mode === "local") {
      if (localGame === null) {
        return;
      }
      const action: Action = { type: "play", playerId: "local", cardId, chosenColor };
      const result = applyAction(localGame, action);
      if (result.ok) {
        setLocalGame(result.state);
      } else {
        setError("That card cannot be played.");
      }
      return;
    }
    send(UNO_OP.PLAY_REQUEST, { cardId, chosenColor });
  }, [localGame, mode, send]);

  const draw = useCallback(() => {
    if (mode === "local") {
      if (localGame === null) {
        return;
      }
      const result = applyAction(localGame, { type: "draw", playerId: "local" });
      if (result.ok) {
        setLocalGame(result.state);
      }
      return;
    }
    send(UNO_OP.DRAW_REQUEST, {});
  }, [localGame, mode, send]);

  const challenge = useCallback((accept: boolean) => {
    if (mode === "local") {
      if (localGame === null || localGame.pendingChallenge === null) {
        return;
      }
      const result = applyAction(localGame, {
        type: "challenge",
        playerId: "local",
        accept,
      });
      if (result.ok) {
        setLocalGame(result.state);
      }
      return;
    }
    send(UNO_OP.CHALLENGE_REQUEST, { accept });
  }, [localGame, mode, send]);

  const sendChat = useCallback((text: string) => {
    if (mode === "local") {
      setNotice("Chat is available in online games.");
      return;
    }
    send(UNO_OP.CHAT_SEND, { text });
  }, [mode, send]);

  const rematch = useCallback(async () => {
    await leave();
    await createPrivate(seats);
  }, [createPrivate, leave, seats]);

  const resign = useCallback(() => {
    send(UNO_OP.RESIGN, {});
  }, [send]);

  const signInStub = useCallback(async () => {
    setNotice("Email sign-in is handled by the launcher account panel.");
  }, []);
  const clearAuthFeedback = useCallback(() => undefined, []);

  const view = mode === "online" ? onlineView : viewFromCore(localGame, "local");

  return {
    cardSet,
    setCardSet,
    dealKey,
    mode,
    setMode,
    seats,
    setSeats,
    connection,
    searching,
    searchSeconds,
    error,
    notice,
    roomCode,
    myUserId,
    view,
    profile,
    profileLoading,
    profileError,
    history,
    leaderboard,
    leaderboardTotal,
    myLeaderboard,
    matchId,
    spectating,
    account,
    authBusy,
    authError,
    authNotice,
    quickMatch,
    cancelQuickMatch: clearSearch,
    createPrivate,
    joinByCode,
    leave,
    play,
    draw,
    challenge,
    sendChat,
    refreshProfile,
    signIn: signInStub,
    signUp: signInStub,
    signOut: signInStub,
    clearAuthFeedback,
    resign,
    chat: sendChat,
    newGame: () => startLocal(seats),
    rematch,
  };
}
