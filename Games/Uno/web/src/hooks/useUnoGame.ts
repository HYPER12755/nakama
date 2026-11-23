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
  type SocialFriend,
} from "@moongames/game-sdk";
import type {
  GameHistoryEntry,
  GameLeaderboardEntry,
  GameProfile,
  OnlineAuthAccount,
} from "@moongames/game-ui";
import {
  UNO_CLIENT_OP,
  UNO_OP,
  applyAction,
  chooseAction,
  clearJumpWindow,
  createGame,
  type Action,
  type Color,
  type GameMode,
  type GameState,
  type PowerTower,
} from "@moongames/uno-core";
import {
  isJumpCandidate,
  normalizeFlipSide,
  normalizeJumpWindow,
  normalizeList,
  normalizePendingChallenge,
  normalizePendingHit,
  normalizePendingRoulette,
  normalizePendingStack,
  normalizeRulesMode,
  rulesModeLabel,
  viewFromCore,
  type BoardView,
  type JumpWindow,
} from "../lib/view";

const GAME_ID = __MOONGAMES_GAME_ID__;
const DEVICE_KEY = `moongames.${GAME_ID}.deviceId`;
const SERVER_KEY = "defaultkey";

function readJumpWindow(state: GameState | null): JumpWindow | null {
  return normalizeJumpWindow(state?.jumpWindow ?? null);
}

function deviceId(): string {
  try {
    const existing = window.sessionStorage.getItem(DEVICE_KEY);
    if (existing !== null && existing !== "") {
      return existing;
    }
    const created = crypto.randomUUID();
    window.sessionStorage.setItem(DEVICE_KEY, created);
    window.localStorage.removeItem(DEVICE_KEY);
    return created;
  } catch {
    return `${GAME_ID}-${Date.now()}`;
  }
}

function serverAddress(
  nakama?: { host?: string; port?: string; useSSL?: boolean; serverKey?: string },
) {
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
  if (typeof token !== "string" || token.length === 0) {
    return null;
  }
  try {
    return Session.restore(token, refresh ?? "");
  } catch {
    return null;
  }
}

function normalizeResult(value: unknown): BoardView["result"] {
  const source = value as Record<string, unknown> | null | undefined;
  if (source == null) {
    return null;
  }
  const winner = source.winnerUserId ?? source.winner_user_id ?? source.winner ?? null;
  return {
    status: String(source.status ?? "finished"),
    winnerUserId: winner == null ? null : String(winner),
    reason: source.reason == null ? undefined : String(source.reason),
  };
}

export function normalizeHistory(value: unknown): GameHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const record = item as Record<string, unknown>;
    const opponent = (record.opponent ?? {}) as Record<string, unknown>;
    const replay = (record.replay ?? {}) as Record<string, unknown>;
    const mode = record.mode === "private" || record.mode === "quick" ? record.mode : "quick";
    const rawOutcome = String(record.outcome ?? "");
    const outcome = (["win", "loss", "draw", "abandoned"].includes(rawOutcome)
      ? rawOutcome
      : "abandoned") as GameHistoryEntry["outcome"];
    const steps = Array.isArray(replay.steps)
      ? replay.steps.map(String)
      : Array.isArray(record.steps)
        ? record.steps.map(String)
        : [];
    return {
      matchId: String(record.matchId ?? record.match_id ?? ""),
      gameId: typeof record.gameId === "string" ? record.gameId : undefined,
      mode,
      rated: record.rated === true,
      outcome,
      status: String(record.status ?? "finished"),
      reason: String(record.reason ?? ""),
      opponent: {
        userId: String(
          opponent.userId ?? opponent.user_id ?? record.opponentId ?? record.opponent_id ?? "",
        ),
        username: String(
          opponent.username ?? record.opponentUsername ?? record.opponent_username ?? "Opponent",
        ),
      },
      ratingBefore: Number(record.ratingBefore ?? record.rating_before ?? 0),
      ratingAfter: Number(record.ratingAfter ?? record.rating_after ?? 0),
      ratingDelta: Number(record.ratingDelta ?? record.rating_delta ?? 0),
      endedAt: Number(record.endedAt ?? record.ended_at ?? 0),
      steps,
      ...(typeof record.summary === "string" ? { summary: record.summary } : {}),
      ...(typeof record.pgn === "string" ? { pgn: record.pgn } : {}),
      ...(typeof record.finalFen === "string" ? { finalFen: record.finalFen } : {}),
    };
  });
}

export function normalizeView(payload: Record<string, unknown>, myUserId: string | null): BoardView {
  const players = normalizeList(payload.players).map((value, index) => {
    const player = value as Record<string, unknown>;
    return {
      seat: Number(player.seat ?? index),
      userId: String(player.userId ?? player.user_id ?? ""),
      username: String(player.username ?? "Player"),
      connected: player.connected !== false,
      count: Number(player.count ?? 0),
      out: player.out === true || player.out === "true",
      hand: Array.isArray(player.hand) ? (player.hand as BoardView["players"][number]["hand"]) : undefined,
    };
  });
  const spectators = normalizeList(payload.spectators).map((value, index) => {
    const spectator = value as Record<string, unknown>;
    return {
      seat: index,
      userId: String(spectator.userId ?? spectator.user_id ?? ""),
      username: String(spectator.username ?? "Player"),
      connected: true,
      count: 0,
    };
  });
  const chat = normalizeList(payload.chat).map((value) => {
    const message = value as Record<string, unknown>;
    const at = Number(message.at ?? message.sentAt ?? message.sent_at ?? 0);
    return {
      id: String(message.id ?? ""),
      userId: String(message.userId ?? message.user_id ?? ""),
      username: String(message.username ?? "Player"),
      text: String(message.text ?? ""),
      at,
      sentAt: at,
    };
  });
  return {
    players,
    spectators,
    chat,
    topCard: (payload.topCard as BoardView["topCard"]) ?? null,
    currentColor: (payload.currentColor as Color | null) ?? null,
    flipSide: normalizeFlipSide(payload.flipSide ?? payload.flip_side),
    turn: Number(payload.turn ?? 0),
    direction: payload.direction === -1 ? -1 : 1,
    deckCount: Number(payload.deckCount ?? 0),
    pendingChallenge: normalizePendingChallenge(payload.pendingChallenge ?? payload.pending_challenge),
    pendingStack: normalizePendingStack(payload.pendingStack ?? payload.pending_stack),
    pendingHit: normalizePendingHit(payload.pendingHit ?? payload.pending_hit),
    pendingRoulette: normalizePendingRoulette(payload.pendingRoulette ?? payload.pending_roulette),
    jumpWindow: normalizeJumpWindow(payload.jumpWindow ?? payload.jump_window),
    speedLevel: Number(payload.speedLevel ?? payload.speed_level ?? 1),
    speedPlayed: Number(payload.speedPlayed ?? payload.speed_played ?? 0),
    speedTarget: Number(payload.speedTarget ?? payload.speed_target ?? 1),
    powerTowers: (payload.powerTowers ?? payload.power_towers ?? undefined) as
      Record<string, string | null> | undefined,
    legalCards: normalizeList(payload.legalCards).map(String),
    canDraw: payload.canDraw === true,
    result: normalizeResult(payload.result),
    myUserId,
    started: payload.started === true,
    mode: normalizeRulesMode(payload.rulesMode ?? payload.mode),
    rulesMode: normalizeRulesMode(payload.rulesMode ?? payload.mode),
  };
}

export function buildColourChoosePayload(color: Color): Record<string, unknown> {
  return { colour: color };
}

export interface PlayExtras {
  giveCardId?: string;
  tradeWithId?: string;
  showdownAmount?: number;
  towerId?: string;
  modColor?: Color;
}

export function buildPlayPayload(
  view: BoardView,
  cardId: string,
  chosenColor?: Color,
  targetId?: string,
  extras: PlayExtras = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = { cardId };
  if (chosenColor !== undefined) {
    payload.chosenColor = chosenColor;
  }
  if (targetId !== undefined) {
    payload.targetId = targetId;
  }
  if (extras.giveCardId !== undefined) {
    payload.giveCardId = extras.giveCardId;
  }
  if (extras.tradeWithId !== undefined) {
    payload.tradeWithId = extras.tradeWithId;
  }
  if (extras.showdownAmount !== undefined) {
    payload.showdownAmount = extras.showdownAmount;
  }
  if (extras.towerId !== undefined) {
    payload.towerId = extras.towerId;
  }
  if (extras.modColor !== undefined) {
    payload.modColor = extras.modColor;
  }
  if (isJumpCandidate(view, cardId)) {
    payload.jump = true;
  }
  return payload;
}

function emptyView(myUserId: string | null): BoardView {
  return {
    players: [], spectators: [], chat: [], topCard: null, currentColor: null,
    flipSide: "light", turn: 0, direction: 1, deckCount: 0, pendingChallenge: null,
    pendingStack: null, pendingHit: null, pendingRoulette: null, jumpWindow: null,
    speedLevel: 1, speedPlayed: 0, speedTarget: 1,
    powerTowers: { U: null, N: null, O: null, "!": null },
    legalCards: [], canDraw: false, result: null,
    myUserId, started: false, mode: "classic", rulesMode: "classic",
  };
}

export interface UnoController {
  cardSet: "classic" | "neon";
  setCardSet: (set: "classic" | "neon") => void;
  dealKey: number;
  mode: "local" | "online";
  setMode: (mode: "local" | "online") => void;
  rulesMode: GameMode;
  setRulesMode: (mode: GameMode) => void;
  rulesModeLabel: string;
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
  profile: GameProfile | null;
  profileLoading: boolean;
  profileError: string | null;
  history: GameHistoryEntry[];
  leaderboard: GameLeaderboardEntry[];
  leaderboardTotal: number;
  myLeaderboard: GameLeaderboardEntry | null;
  matchId: string | null;
  spectating: boolean;
  account: OnlineAuthAccount | null;
  accountName: string | null;
  authBusy: boolean;
  authError: string | null;
  authNotice: string | null;
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
  quickMatch: (seats: number) => Promise<void>;
  cancelQuickMatch: () => void;
  createPrivate: (seats: number) => Promise<string>;
  joinMatch: (matchId: string, token?: string, spectator?: boolean) => Promise<void>;
  joinByCode: (code: string, spectator?: boolean) => Promise<void>;
  leave: () => Promise<void>;
  play: (cardId: string, chosenColor?: Color, targetId?: string, extras?: PlayExtras) => void;
  chooseColour: (color: Color) => void;
  draw: () => void;
  challenge: (accept: boolean) => void;
  sendChat: (text: string) => void;
  refreshProfile: () => Promise<void>;
  connect: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username?: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearAuthFeedback: () => void;
  resign: () => void;
  chat: (text: string) => void;
  newGame: () => void;
  rematch: () => Promise<void>;
}

export function useUnoGame(enabled = true): UnoController {
  const [cardSet, setCardSetState] = useState<"classic" | "neon">((): "classic" | "neon" => {
    try {
      return localStorage.getItem("moongames.uno.cardSet") === "neon" ? "neon" : "classic";
    } catch {
      return "classic";
    }
  });
  const [dealKey, setDealKey] = useState(0);
  const [mode, setModeState] = useState<"local" | "online">("local");
  const [rulesMode, setRulesModeState] = useState<GameMode>("classic");
  const [seats, setSeatsState] = useState(2);
  const [localGame, setLocalGame] = useState<GameState | null>(null);
  const [onlineView, setOnlineView] = useState<BoardView>(emptyView(null));
  const [connection, setConnection] = useState("offline");
  const [searching, setSearching] = useState(false);
  const [searchSeconds, setSearchSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<GameProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<GameLeaderboardEntry[]>([]);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
  const [myLeaderboard, setMyLeaderboard] = useState<GameLeaderboardEntry | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [spectating, setSpectating] = useState(false);
  const [account, setAccount] = useState<OnlineAuthAccount | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  const clientRef = useRef<Client | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const spectatingRef = useRef(false);
  const ticketRef = useRef<string | null>(null);
  const searchTimerRef = useRef<number | null>(null);
  const searchRunRef = useRef(0);
  const reconnectRef = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const socialRef = useRef<MoonGamesSocialClient | null>(null);
  const friendsPromiseRef = useRef<Promise<void> | null>(null);
  const pendingAuthRef = useRef<{
    mode: "sign-in" | "sign-up";
    email: string;
    password: string;
    username?: string;
  } | null>(null);

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
      const profilePayload = profileResponse.payload as {
        ok?: boolean;
        profile?: GameProfile;
        history?: unknown;
        error?: { message?: string };
      };
      const leaderboardPayload = leaderboardResponse.payload as {
        ok?: boolean;
        entries?: GameLeaderboardEntry[];
        me?: GameLeaderboardEntry | null;
        total?: number;
        error?: { message?: string };
      };
      if (profilePayload?.ok !== true) {
        setProfileError(profilePayload?.error?.message ?? "The profile could not be loaded.");
        return;
      }
      if (leaderboardPayload?.ok !== true) {
        setProfileError(
          leaderboardPayload?.error?.message ?? "The rating leaderboard could not be loaded.",
        );
        return;
      }
      setProfile(profilePayload.profile ?? null);
      setHistory(normalizeHistory(profilePayload.history));
      setLeaderboard(Array.isArray(leaderboardPayload.entries) ? leaderboardPayload.entries : []);
      setLeaderboardTotal(Number(leaderboardPayload.total ?? 0));
      setMyLeaderboard(leaderboardPayload.me ?? null);
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : "Could not load your profile.");
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const connect = useCallback(async () => {
    if (connectingRef.current || socketRef.current !== null) {
      return;
    }
    connectingRef.current = true;
    socialRef.current = null;
    friendsPromiseRef.current = null;
    setConnection("connecting");
    try {
      const config = readLauncherHandoff(GAME_ID);
      const address = serverAddress(config?.nakama);
      if (
        sessionFromConfig(config?.session?.token, config?.session?.refreshToken) === null
        && !accountCreationAllowed({
          host: address.host,
          useSSL: address.useSSL,
          allowInsecure:
            config?.nakama?.allowInsecure === true
            || insecureConnectionRequested(window.location.search),
        })
      ) {
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
              userId: String(payload.userId ?? payload.user_id ?? ""),
              username: String(payload.username ?? "Player"),
              text: String(payload.text ?? ""),
              at: Number(payload.at ?? Date.now()),
              sentAt: Number(payload.at ?? Date.now()),
            }],
          }));
        } else if (data.op_code === UNO_OP.GAME_OVER) {
          setOnlineView((current) => ({
            ...current,
            started: true,
            result: normalizeResult(payload),
          }));
          void refreshProfile();
          setNotice("The hand is finished.");
        } else if (data.op_code === UNO_OP.ERROR) {
          setError(String(payload.message ?? "The server refused that move."));
        }
      };

      socket.onmatchmakermatched = (matched) => {
        clearSearch();
        void socket.joinMatch(matched.match_id, matched.token ?? undefined).then(() => {
          matchIdRef.current = matched.match_id;
          setMatchId(matched.match_id);
          setDealKey((value) => value + 1);
          setRoomCode(null);
        }).catch((cause: unknown) => {
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
          const wasSpectating = spectatingRef.current;
          void connect().then(() => {
            const live = socketRef.current;
            const current = matchIdRef.current;
            if (live === null || current === null) {
              return;
            }
            void live.joinMatch(current, undefined, wasSpectating ? { spectate: "1" } : undefined)
              .catch(() => {
                setNotice("The table could not be rejoined. Open a new one.");
                matchIdRef.current = null;
                spectatingRef.current = false;
                setMatchId(null);
                setSpectating(false);
                setOnlineView(emptyView(session.user_id ?? null));
              });
          });
        }, 1200);
      };

      socket.onerror = () => setError("The realtime connection reported an error.");

      clientRef.current = client;
      sessionRef.current = session;
      socketRef.current = socket;
      setMyUserId(session.user_id ?? null);
      setConnection("connected");
      const accountInfo = await client.getAccount(session).catch(() => null) as
        | { user?: { username?: string } }
        | null;
      setAccountName(accountInfo?.user?.username ?? session.username ?? "Guest");
    } catch (cause) {
      setConnection("error");
      setError(cause instanceof Error ? cause.message : "Could not connect.");
    } finally {
      connectingRef.current = false;
    }
  }, [clearSearch, refreshProfile]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    void connect();
    return () => {
      clearSearch();
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket !== null) {
        void socket.disconnect(false);
      }
    };
  }, [clearSearch, connect, enabled]);

  useEffect(() => {
    if (enabled && connection === "connected") {
      void refreshProfile();
    }
  }, [connection, enabled, refreshProfile]);

  useEffect(() => {
    if (searching) {
      const timer = window.setInterval(() => setSearchSeconds((value) => value + 1), 1000);
      return () => window.clearInterval(timer);
    }
    return undefined;
  }, [searching]);

  const startLocal = useCallback((count: number, gameMode: GameMode = rulesMode) => {
    const ids = ["local", "ai1", "ai2", "ai3"].slice(0, count);
    setLocalGame(createGame(
      Date.now() >>> 0,
      ids.map((id) => ({ id, name: id === "local" ? "You" : "Computer" })),
      Date.now(),
      gameMode,
    ));
    setDealKey((value) => value + 1);
    setModeState("local");
    setMyUserId("local");
    setError(null);
  }, [rulesMode]);

  useEffect(() => {
    if (mode !== "local" || localGame === null || localGame.finished) {
      return;
    }
    const jumpWindow = readJumpWindow(localGame);
    if (jumpWindow !== null) {
      const jumpers = localGame.players.filter((player) =>
        player.id !== "local" && player.id !== jumpWindow.ownerId);
      const jumpNow = Date.now();
      const hasJumper = jumpers.some((player) => {
        const action = chooseAction(localGame, player.id, jumpNow);
        return action !== null && action.type === "play" && action.jump === true;
      });
      if (!hasJumper) {
        return;
      }
      const timer = window.setTimeout(() => {
        setLocalGame((current) => {
          if (current === null || current.finished) {
            return current;
          }
          const open = readJumpWindow(current);
          if (open === null || open.cardId !== jumpWindow.cardId || open.ownerId !== jumpWindow.ownerId) {
            return current;
          }
          const now = Date.now();
          for (const player of current.players) {
            if (player.id === "local" || player.id === open.ownerId) {
              continue;
            }
            const action = chooseAction(current, player.id, now);
            if (action === null || action.type !== "play" || action.jump !== true) {
              continue;
            }
            const result = applyAction(current, action, now);
            if (result.ok) {
              return result.state;
            }
          }
          return current;
        });
      }, 900);
      return () => window.clearTimeout(timer);
    }
    const actorId = localGame.pendingHit?.targetId
      ?? localGame.pendingChallenge?.targetId
      ?? localGame.pendingRoulette?.chooserId
      ?? localGame.players[localGame.turn].id;
    const actor = localGame.players.find((player) => player.id === actorId);
    if (actor === undefined || actor.id === "local") {
      return;
    }
    const timer = window.setTimeout(() => {
      const now = Date.now();
      const action = chooseAction(localGame, actorId, now);
      if (action === null) {
        return;
      }
      const result = applyAction(localGame, action, now);
      if (result.ok) {
        setLocalGame(result.state);
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [localGame, mode]);

  useEffect(() => {
    if (mode !== "local" || localGame === null || localGame.finished) {
      return;
    }
    const jumpWindow = readJumpWindow(localGame);
    if (jumpWindow === null) {
      return;
    }
    const delay = Math.min(30000, Math.max(0, jumpWindow.expiresAt - Date.now()));
    const timer = window.setTimeout(() => {
      setLocalGame((current) => {
        if (current === null) {
          return current;
        }
        const open = readJumpWindow(current);
        if (open === null || open.cardId !== jumpWindow.cardId || open.ownerId !== jumpWindow.ownerId) {
          return current;
        }
        return clearJumpWindow(current, Date.now());
      });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [localGame, mode]);

  const leave = useCallback(async () => {
    clearSearch();
    const socket = socketRef.current;
    const joined = matchIdRef.current;
    if (socket !== null && joined !== null) {
      await socket.leaveMatch(joined).catch(() => undefined);
    }
    socialRef.current = null;
    friendsPromiseRef.current = null;
    matchIdRef.current = null;
    spectatingRef.current = false;
    setMatchId(null);
    setRoomCode(null);
    setSpectating(false);
    setOnlineView(emptyView(myUserId));
  }, [clearSearch, myUserId]);

  const setMode = useCallback((next: "local" | "online") => {
    if (next === "local") {
      if (matchIdRef.current !== null) {
        void leave();
      }
      clearSearch();
      setModeState("local");
      startLocal(seats);
      return;
    }
    setModeState("online");
    void connect();
  }, [clearSearch, connect, leave, seats, startLocal]);

  const setRulesMode = useCallback((next: GameMode) => {
    if (next === rulesMode) {
      return;
    }
    if (mode === "online" && (matchIdRef.current !== null || onlineView.started)) {
      setNotice("Leave the online table before changing the rules mode.");
      return;
    }
    clearSearch();
    setRulesModeState(next);
    if (mode === "local") {
      startLocal(seats, next);
    }
  }, [clearSearch, mode, onlineView.started, rulesMode, seats, startLocal]);

  const joinMatch = useCallback(async (matchId: string, token?: string, spectator = false) => {
    const socket = socketRef.current;
    if (socket === null) {
      throw new Error("The realtime connection is not ready yet.");
    }
    if (matchIdRef.current !== null && matchIdRef.current !== matchId) {
      await socket.leaveMatch(matchIdRef.current).catch(() => undefined);
    }
    await socket.joinMatch(matchId, token, spectator ? { spectate: "1" } : undefined);
    matchIdRef.current = matchId;
    spectatingRef.current = spectator;
    setMatchId(matchId);
    setSpectating(spectator);
    setDealKey((value) => value + 1);
    setError(null);
  }, []);

  const quickMatch = useCallback(async (count: number) => {
    if (searchTimerRef.current !== null) {
      setError("A quick match search is already running.");
      return;
    }
    if (matchIdRef.current !== null) {
      setError("Leave the current table before starting a quick match.");
      return;
    }
    clearSearch();
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
    setSearching(true);
    setError(null);
    try {
      const ticket = await socket.addMatchmaker(
        `+properties.game:uno +properties.seats:${count} +properties.rulesMode:${rulesMode}`,
        count,
        count,
        { game: GAME_ID, seats: String(count), rulesMode },
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
      if (run === searchRunRef.current) {
        setSearching(false);
        setError(cause instanceof Error ? cause.message : "The search could not start.");
      }
    }
  }, [clearSearch, connect, rulesMode]);

  const createPrivate = useCallback(async (count: number): Promise<string> => {
    clearSearch();
    let client = clientRef.current;
    let session = sessionRef.current;
    if (client === null || session === null) {
      await connect();
      client = clientRef.current;
      session = sessionRef.current;
    }
    if (client === null || session === null) {
      throw new Error("The realtime connection is not ready yet.");
    }
    const response = await client.rpc(session, "uno_create_private_match", { seats: count, rulesMode });
    const payload = response.payload as Record<string, unknown>;
    if (payload?.ok !== true || typeof payload.matchId !== "string") {
      throw new Error("The private room could not be created.");
    }
    setRoomCode(typeof payload.roomCode === "string" ? payload.roomCode : null);
    await joinMatch(payload.matchId);
    return payload.matchId;
  }, [clearSearch, connect, joinMatch, rulesMode]);

  const joinByCode = useCallback(async (code: string, spectator = false) => {
    clearSearch();
    let client = clientRef.current;
    let session = sessionRef.current;
    if (client === null || session === null) {
      await connect();
      client = clientRef.current;
      session = sessionRef.current;
    }
    if (client === null || session === null || code.trim() === "") {
      throw new Error("The realtime connection is not ready yet.");
    }
    const response = await client.rpc(session, "moongames_room_code_resolve", {
      code: code.trim(),
      gameId: GAME_ID,
    });
    const payload = response.payload as {
      ok?: boolean; matchId?: string; code?: string; error?: { message?: string };
    };
    if (payload?.ok !== true || typeof payload.matchId !== "string") {
      throw new Error(payload.error?.message ?? "That room code was not found.");
    }
    setRoomCode(String(payload.code ?? code.trim().toUpperCase()));
    await joinMatch(payload.matchId, undefined, spectator);
  }, [clearSearch, connect, joinMatch]);

  const loadFriends = useCallback(async (): Promise<void> => {
    if (friendsPromiseRef.current !== null) {
      return friendsPromiseRef.current;
    }
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
          for (const friend of group) {
            byId.set(friend.userId, friend);
          }
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
      if (input.state === 2) {
        await social.acceptFriend({ userId: input.userId });
      }
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
          chatCardSent = false;
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
    clearSearch();
    if (reconnectRef.current !== null) {
      window.clearTimeout(reconnectRef.current);
      reconnectRef.current = null;
    }
    const socket = socketRef.current;
    if (socket !== null) {
      try {
        (socket as unknown as { close?: () => void }).close?.();
      } catch {}
    }
    socketRef.current = null;
    sessionRef.current = null;
    matchIdRef.current = null;
    spectatingRef.current = false;
    socialRef.current = null;
    friendsPromiseRef.current = null;
    setMatchId(null);
    setSpectating(false);
    setOnlineView(emptyView(null));
    setRoomCode(null);
    setSearching(false);
    setConnection("offline");
  }, [clearSearch]);

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

  const view = mode === "online" ? onlineView : viewFromCore(localGame, "local");

  const send = useCallback((op: number, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    const joined = matchIdRef.current;
    if (socket === null || joined === null) {
      return;
    }
    void socket.sendMatchState(joined, op, matchStateBytes(payload)).catch(() => undefined);
  }, []);

  const play = useCallback((cardId: string, chosenColor?: Color, targetId?: string, extras: PlayExtras = {}) => {
    if (mode === "local") {
      if (localGame === null) {
        return;
      }
      const jump = isJumpCandidate(view, cardId);
      const action: Action = {
        type: "play", playerId: "local", cardId, chosenColor, targetId,
        ...(extras.giveCardId !== undefined ? { giveCardId: extras.giveCardId } : {}),
        ...(extras.tradeWithId !== undefined ? { tradeWithId: extras.tradeWithId } : {}),
        ...(extras.showdownAmount !== undefined ? { showdownAmount: extras.showdownAmount } : {}),
        ...(extras.towerId !== undefined ? { towerId: extras.towerId as PowerTower } : {}),
        ...(extras.modColor !== undefined ? { modColor: extras.modColor } : {}),
        ...(jump ? { jump: true } : {}),
      };
      const result = applyAction(localGame, action, Date.now());
      if (result.ok) {
        setLocalGame(result.state);
      } else {
        setError("That card cannot be played.");
      }
      return;
    }
    send(UNO_OP.PLAY_REQUEST, buildPlayPayload(view, cardId, chosenColor, targetId, extras));
  }, [localGame, mode, send, view]);

  const chooseColour = useCallback((color: Color) => {
    if (mode === "local") {
      if (localGame === null || localGame.pendingRoulette === null) {
        return;
      }
      const result = applyAction(localGame, {
        type: "chooseColour",
        playerId: "local",
        color,
      }, Date.now());
      if (result.ok) {
        setLocalGame(result.state);
      } else {
        setError("That colour cannot be chosen.");
      }
      return;
    }
    send(UNO_CLIENT_OP.COLOR_CHOOSE, buildColourChoosePayload(color));
  }, [localGame, mode, send]);

  const draw = useCallback(() => {
    if (mode === "local") {
      if (localGame === null) {
        return;
      }
      const result = applyAction(localGame, { type: "draw", playerId: "local" }, Date.now());
      if (result.ok) {
        setLocalGame(result.state);
      } else {
        setError("That card cannot be drawn.");
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
      }, Date.now());
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

  const setSeats = useCallback((count: number) => {
    setSeatsState(count);
    if (mode === "local") {
      startLocal(count);
    }
  }, [mode, startLocal]);

  const rematch = useCallback(async () => {
    await leave();
    await createPrivate(seats);
  }, [createPrivate, leave, seats]);

  const resign = useCallback(() => {
    send(UNO_OP.RESIGN, {});
  }, [send]);

  return {
    cardSet,
    setCardSet,
    dealKey,
    mode,
    setMode,
    rulesMode,
    setRulesMode,
    rulesModeLabel: rulesModeLabel(rulesMode),
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
    accountName,
    authBusy,
    authError,
    authNotice,
    friends,
    friendsLoading,
    friendsError,
    inviteSendingId,
    inviteError,
    inviteNotice,
    loadFriends,
    inviteFriend,
    quickMatch,
    cancelQuickMatch: clearSearch,
    createPrivate,
    joinMatch,
    joinByCode,
    leave,
    play,
    chooseColour,
    draw,
    challenge,
    sendChat,
    refreshProfile,
    connect,
    signIn,
    signUp,
    signOut,
    clearAuthFeedback,
    resign,
    chat: sendChat,
    newGame: () => startLocal(seats),
    rematch,
  };
}
