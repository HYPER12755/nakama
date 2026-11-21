import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Client,
  Session,
  type MatchData,
  type MatchmakerMatched,
  type Socket,
} from "@heroiclabs/nakama-js";
import { MoonGamesSocialClient } from "@moongames/social";
import {
  accountCreationAllowed,
  insecureConnectionRequested,
  inviteWantsSpectator,
  matchStateBytes,
  type GameHostConfig,
  type MoonGamesInvite,
  type SocialFriend,
  type SocialNotification,
} from "@moongames/game-sdk";
import {
  createChessEngine,
  type ChessState,
  type Color,
  type PromotionPiece,
  type Square,
} from "@moongames/chess-core";
import {
  authErrorDetail,
  authErrorMessage,
  AutoQueen,
  clearStoredEmailSession,
  consumeGuestIdentityLinked,
  INSECURE_ACCOUNT_MESSAGE,
  markGuestIdentityLinked,
  normalizeEmail,
  readStoredEmailSession,
  storeEmailSession,
  validateEmail,
  validatePassword,
  validateUsername,
  type OnlineAuthAccount,
} from "@moongames/game-ui";
import {
  ONLINE_OP,
  TIME_CONTROLS,  clockForColor,
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
import { playOpponentLeft } from "../lib/audio";
import { promotionPiece } from "../lib/promotion";
import { findKeyboardMove, readKeyboardMove } from "../lib/notation";
import {
  readExplorerResult,
  type ExplorerResult,
} from "../lib/openingExplorer";
import {
  readPuzzleAnswer,
  readPuzzleNext,
  readStormState,
  type PuzzleAnswer,
  type PuzzleNext,
  type StormState,
} from "../lib/puzzles";
import {
  readTournament,
  readTournamentList,
  type Tournament,
} from "../lib/tournaments";

/**
 * The identifiers of this title come from the build, so the client never
 * carries a game id of its own.
 */
const GAME_ID = __MOONGAMES_GAME_ID__;
const DEVICE_ID_KEY = `moongames.${GAME_ID}.deviceId`;
const SERVER_ADDRESS_KEY = `moongames.${GAME_ID}.serverAddress`;
const TIME_CONTROL_KEY = `moongames.${GAME_ID}.timeControl`;
const MATCH_ID_KEY = `moongames.${GAME_ID}.matchId`;
const SPECTATE_KEY = `moongames.${GAME_ID}.spectate`;
const MATCHMAKING_TIMEOUT_MS = 60000;

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
  /** The short code of the table this player is sitting at. */
  roomCode: string | null;
  /** Join a table by the short code the host read out. */
  joinByRoomCode: (code: string) => Promise<boolean>;
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
  incomingInvite: MoonGamesInvite | null;
  loadFriends: () => Promise<void>;
  clearInviteFeedback: () => void;
  inviteFriend: (input: FriendInviteInput) => Promise<MoonGamesInvite>;
  acceptIncomingInvite: () => Promise<void>;
  dismissIncomingInvite: () => void;
  profile: OnlineProfile | null;
  history: OnlineHistoryEntry[];
  leaderboard: OnlineLeaderboardEntry[];
  leaderboardTotal: number;
  myLeaderboard: OnlineLeaderboardEntry | null;
  profileLoading: boolean;
  profileError: string | null;
  refreshProfile: () => void;
  /** Add a game brought from somewhere else to the player's games. */
  importGame: (input: {
    steps: string[];
    result?: string;
    color?: Color;
    opponent?: string;
    timeControl?: { initialMs: number; incrementMs: number };
  }) => Promise<{ ok: boolean; message: string | null }>;
  /** The openings played from a place in the tree. */
  explorer: (path: string[]) => Promise<ExplorerResult>;
  /** A puzzle to solve, and the game to make more of them when needed. */
  puzzleNext: () => Promise<PuzzleNext>;
  /** The puzzles the engine found in a game. */
  puzzleSave: (input: {
    gameId: string;
    initialFen: string;
    steps: string[];
    puzzles: Array<{
      fen: string;
      solution: string;
      loss: number;
      cp: number;
      ply: number;
    }>;
  }) => Promise<{ ok: boolean; kept: number; message: string | null }>;
  /** The move a player made, and whether it was the answer. */
  puzzleAnswer: (
    id: string,
    move: string,
  ) => Promise<PuzzleAnswer>;
  /** Start a run of puzzles with a clock on them. */
  stormStart: () => Promise<{ seconds: number; total: number } | null>;
  /** The next puzzle of the run. */
  stormNext: () => Promise<StormState>;
  /** The move a player made in the run. */
  stormAnswer: (
    id: string,
    move: string,
  ) => Promise<{ solved: boolean; score: number; solutionSan: string }>;
  /** The tournaments there are. */
  tournamentList: () => Promise<Tournament[]>;
  /** A tournament and its standings. */
  tournamentGet: (id: string) => Promise<Tournament | null>;
  /** Make a tournament. */
  tournamentCreate: (input: {
    name: string;
    rounds: number;
    timeControl: { initialMs: number; incrementMs: number };
  }) => Promise<{ ok: boolean; tournament: Tournament | null; message: string | null }>;
  /** Take a seat in a tournament. */
  tournamentJoin: (id: string) => Promise<{ ok: boolean; message: string | null }>;
  /** Leave a tournament. */
  tournamentLeave: (id: string) => Promise<{ ok: boolean; message: string | null }>;
  /** Begin a tournament. */
  tournamentStart: (id: string) => Promise<{ ok: boolean; message: string | null }>;
  /** Stop a tournament. Only its host may do so. */
  tournamentCancel: (id: string) => Promise<{ ok: boolean; message: string | null }>;
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
  /** The name of the player who left the table, when it happened. */
  opponentLeft: string | null;
  dismissOpponentLeft: () => void;
  selectSquare: (square: Square) => void;
  /** Move a piece from one square to another, as a drag does. */
  movePiece: (from: Square, to: Square) => void;
  /** The move that is ready for the turn after this one. */
  premove: { from: Square; to: Square } | null;
  /** The squares the piece of the ready move may go to. */
  premoveTargets: Square[];
  /** Forget the move that is ready. */
  clearPremove: () => void;
  /** Play a move that was written with the keyboard. */
  moveBySan: (san: string) => boolean;
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

/**
 * A guest is one browser tab, not one browser profile. Two tabs on the same
 * device must be able to sit at the same table as two different players; a
 * device id kept in localStorage gave both tabs the same account, so the
 * server could only seat one of them and the match waited forever.
 */
function getDeviceId(): string {
  try {
    const existing = window.sessionStorage.getItem(DEVICE_ID_KEY);
    if (existing !== null && existing.length > 0) {
      return existing;
    }
  } catch {
    // Storage can be unavailable in private browsing or embedded webviews.
  }

  const created =
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.sessionStorage.setItem(DEVICE_ID_KEY, created);
    // Remove the old shared identifier so a returning player never falls back
    // to an account that another open tab is already using.
    window.localStorage.removeItem(DEVICE_ID_KEY);
  } catch {
    // Storage can be unavailable.
  }
  return created;
}

function rotateGuestDeviceId(): void {
  try {
    window.sessionStorage.removeItem(DEVICE_ID_KEY);
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

/** A FEN with the chosen side to move, for looking at premove targets. */
function fenForColor(fen: string, color: Color): string {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 2) {
    return fen;
  }
  parts[1] = color;
  // The en-passant target belongs to the side that just moved. With the turn
  // flipped, chess.js rejects a target that the new side cannot legally use.
  if (parts.length > 3) {
    parts[3] = "-";
  }
  return parts.join(" ");
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
}

export function useOnlineChess(
  hostConfig?: GameHostConfig | null,
  options: { autoQueen?: AutoQueen } = {},
): OnlineChessController {
  const autoQueen = options.autoQueen ?? AutoQueen.Never;
  const [connection, setConnection] =
    useState<OnlineConnectionStatus>("offline");
  const [session, setSession] = useState<OnlineSessionInfo | null>(null);
  const [opponentLeft, setOpponentLeft] = useState<string | null>(null);
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
  // The short code a player reads out to their friend.
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [serverState, setServerState] =
    useState<OnlineStatePayload | null>(null);
  const [drawOffer, setDrawOffer] = useState<OnlineDrawOffer | null>(null);
  const [selected, setSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] =
    useState<PendingOnlinePromotion | null>(null);
  /** The move that is ready for the turn after this one. */
  const [premove, setPremove] = useState<{
    from: Square;
    to: Square;
  } | null>(null);
  /** The piece whose moves are being chosen for the next turn. */
  const [premoveFrom, setPremoveFrom] = useState<Square | null>(null);
  const [premoveTargets, setPremoveTargets] = useState<Square[]>([]);
  // True while a move is on its way to the server. The table waits for the
  // answer, so the player cannot send a second move on top of the first.
  const [pendingMove, setPendingMove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchmaking, setMatchmaking] = useState(false);
  const [matchmakingSeconds, setMatchmakingSeconds] = useState(0);
  const [friends, setFriends] = useState<SocialFriend[]>([]);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [inviteSendingId, setInviteSendingId] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [incomingInvite, setIncomingInvite] = useState<MoonGamesInvite | null>(
    null,
  );
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [profile, setProfile] = useState<OnlineProfile | null>(null);
  const [history, setHistory] = useState<OnlineHistoryEntry[]>([]);
  const [leaderboard, setLeaderboard] = useState<OnlineLeaderboardEntry[]>([]);
  const [leaderboardTotal, setLeaderboardTotal] = useState(0);
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
  // The move that is on its way to the server. It is sent again when the
  // connection comes back, so a broken line never loses a move.
  const pendingMoveRef = useRef<{
    from: Square;
    to: Square;
    promotion?: PromotionPiece;
  } | null>(null);
  // The last state the server sent, so a refused move can be taken back.
  const lastServerStateRef = useRef<OnlineStatePayload | null>(null);
  const matchmakingActiveRef = useRef(false);
  const matchmakingRunRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const friendsPromiseRef = useRef<Promise<void> | null>(null);
  const socialRef = useRef<MoonGamesSocialClient | null>(null);
  const loadFriendsRef = useRef<(() => Promise<void>) | null>(null);
  // The refs keep a piece choice through harmless state broadcasts. Without
  // them, a spectator arriving or another player's clock update can wipe the
  // selected square and its move dots while the player is choosing a move.
  const selectedRef = useRef<Square | null>(null);
  const promotionRef = useRef<PendingOnlinePromotion | null>(null);

  const clearSelection = useCallback(() => {
    selectedRef.current = null;
    setSelected(null);
  }, []);

  const clearPromotion = useCallback(() => {
    promotionRef.current = null;
    setPendingPromotion(null);
  }, []);

  const toggleSelected = useCallback((square: Square) => {
    const next = selectedRef.current === square ? null : square;
    selectedRef.current = next;
    setSelected(next);
  }, []);

  const choosePromotionTarget = useCallback(
    (promotion: PendingOnlinePromotion) => {
      promotionRef.current = promotion;
      setPendingPromotion(promotion);
    },
    [],
  );

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
    const previous = lastServerStateRef.current;
    const normalized = normalizedOnlineState(payload);
    setServerState(normalized);
    lastServerStateRef.current = normalized;
    setDrawOffer(normalized.drawOffer ?? null);
    setError(null);
    // The server has answered, so the move is no longer on its way.
    pendingMoveRef.current = null;
    setPendingMove(false);

    const matchChanged =
      previous !== null && previous.match.id !== normalized.match.id;
    const myColor =
      normalized.players.find(
        (player) => player.userId === sessionRef.current?.user_id,
      )?.color ?? null;
    const selection = selectedRef.current;
    const selectionStillValid =
      selection !== null &&
      normalized.result === null &&
      myColor !== null &&
      normalized.state.turn === myColor &&
      normalized.state.board.some(
        (piece) => piece.square === selection && piece.color === myColor,
      );
    if (matchChanged || normalized.result !== null || !selectionStillValid) {
      clearSelection();
    }

    const promotion = promotionRef.current;
    const promotionStillValid =
      promotion !== null &&
      normalized.result === null &&
      normalized.state.turn === promotion.color &&
      normalized.state.board.some(
        (piece) =>
          piece.square === promotion.from && piece.color === promotion.color,
      );
    if (matchChanged || !promotionStillValid) {
      clearPromotion();
    }

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
  }, [clearPromotion, clearSelection]);

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
          // The move was refused, so the table goes back to what the server
          // last said. The board is not left showing a move that never
          // happened.
          if (pendingMoveRef.current !== null) {
            pendingMoveRef.current = null;
            setPendingMove(false);
            const last = lastServerStateRef.current;
            if (last !== null) {
              setServerState(last);
            }
          }
          break;
        }
        case ONLINE_OP.PLAYER_JOINED: {
          setError(null);
          break;
        }
        case ONLINE_OP.PLAYER_LEFT: {
          // The other player left: say so plainly and offer the way out.
          const left = payload as { userId?: string; username?: string };
          if (
            left.userId !== undefined &&
            left.userId !== sessionRef.current?.user_id
          ) {
            setOpponentLeft(left.username ?? "Your opponent");
            playOpponentLeft();
          }
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
    matchmakerRef.current = null;
    pending.reject(new Error(message));
  }, []);

  const handleSocialNotification = useCallback(
    (notification: SocialNotification) => {
      const invite = notification.invite;
      setIncomingInvite((current) => {
        if (invite === null) {
          return current;
        }
        if (
          notification.kind === "invite" &&
          invite.status === "pending" &&
          invite.expiresAt > Date.now() &&
          invite.sender.userId !== sessionRef.current?.user_id
        ) {
          return invite;
        }
        return current?.inviteId === invite.inviteId ? null : current;
      });
      if (notification.kind.startsWith("friend-")) {
        void loadFriendsRef.current?.();
      }
    },
    [],
  );

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
    socialRef.current = null;
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
    clearSelection();
    clearPromotion();
    setFriends([]);
    setFriendsError(null);
    setFriendsLoading(false);
    setInviteError(null);
    setInviteNotice(null);
    setInviteSendingId(null);
    setIncomingInvite(null);
    friendsPromiseRef.current = null;
    matchmakingActiveRef.current = false;
    setMatchmaking(false);
    setError(null);
    setProfile(null);
    setHistory([]);
    setLeaderboard([]);
    setLeaderboardTotal(0);
    setMyLeaderboard(null);
    setProfileError(null);
    setProfileLoading(false);
  }, [clearPromotion, clearSelection, failPendingMatchmaker]);

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

        // A guest account is an account too, and the session that comes back
        // is a secret. It must not cross a public plain connection.
        if (
          restoredHost === null &&
          !accountCreationAllowed({
            host: address.host,
            useSSL: address.useSSL,
            allowInsecure:
              activeHost?.nakama?.allowInsecure === true ||
              insecureConnectionRequested(window.location.search),
          })
        ) {
          throw new Error(INSECURE_ACCOUNT_MESSAGE);
        }

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
        const social = new MoonGamesSocialClient({
          client,
          session: sessionResult,
          socket,
          selfUserId: sessionResult.user_id,
        });

        socket.onmatchdata = handleMatchData;
        socket.onmatchmakermatched = (matched) => {
          const pending = matchmakerRef.current;
          if (pending === null) {
            return;
          }
          window.clearTimeout(pending.timer);
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
          socialRef.current = null;
          setConnection("connecting");
          setProfileLoading(false);
          setFriendsError(null);
          setFriendsLoading(false);
          setInviteError(null);
          setInviteNotice(null);
          setInviteSendingId(null);
          setIncomingInvite(null);
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
            // The first try is quick, because a dropped line on a phone is
            // usually a moment. Later tries wait longer.
            const delay =
              attempt === 0 ? 250 : Math.min(15000, 1000 * 2 ** attempt);
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
        socialRef.current = social;
        social.onNotification(handleSocialNotification);
        for (const notification of social.drainPendingNotifications()) {
          handleSocialNotification(notification);
        }
        void social
          .replayInvites()
          .then((pending) => {
            if (socialRef.current !== social) {
              return;
            }
            for (const notification of pending) {
              handleSocialNotification(notification);
            }
          })
          .catch(() => {
            // Persistent notifications are retried by the launcher and on the
            // next connection; live socket delivery is already active.
          });

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
          token: sessionResult.token,
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
            // A move that was on its way when the line dropped is sent
            // again, so a broken connection never loses a move.
            const waiting = pendingMoveRef.current;
            if (waiting !== null) {
              pendingMoveRef.current = null;
              socket.sendMatchState(
                currentMatchId,
                ONLINE_OP.MOVE_REQUEST,
                matchStateBytes({
                  from: waiting.from,
                  to: waiting.to,
                  promotion: waiting.promotion,
                }),
              );
            }
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
        socialRef.current = null;
        setIncomingInvite(null);
        setConnection("error");
        setError(errorMessage(cause, "Could not connect to the game server."));
        throw cause;
      }
    })();

    connectPromiseRef.current = promise.finally(() => {
      connectPromiseRef.current = null;
    });
    return connectPromiseRef.current;
  }, [
    failPendingMatchmaker,
    handleMatchData,
    handleSocialNotification,
    serverAddress,
  ]);

  useEffect(() => {
    return () => {
      socialRef.current = null;
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

  const dismissOpponentLeft = useCallback((): void => {
    setOpponentLeft(null);
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
      if (!accountCreationAllowed(address)) {
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
      if (!accountCreationAllowed(address)) {
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
        client.rpc(currentSession, "chess_get_leaderboard", { limit: 10 }),
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
          setLeaderboardTotal(payload.total ?? 0);
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

  /**
   * Add a game the player brought from somewhere else to their games.
   *
   * The server plays the moves out again with its own rules, so a game
   * that cannot be played is not kept.
   */
  const importGame = useCallback(
    async (input: {
      steps: string[];
      result?: string;
      color?: Color;
      opponent?: string;
      timeControl?: { initialMs: number; incrementMs: number };
    }): Promise<{ ok: boolean; message: string | null }> => {
      try {
        await connect();
      } catch {
        return {
          ok: false,
          message: "The game server could not be reached.",
        };
      }

      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return {
          ok: false,
          message: "Connect to the game server to add a game.",
        };
      }

      try {
        const response = await client.rpc(
          currentSession,
          "chess_import_game",
          input,
        );
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            message:
              payload.error?.message ?? "That game could not be added.",
          };
        }
        refreshProfile();
        return { ok: true, message: null };
      } catch (cause) {
        return {
          ok: false,
          message:
            cause instanceof Error
              ? cause.message
              : "That game could not be added.",
        };
      }
    },
    [connect, refreshProfile],
  );

  /**
   * The openings played from a place in the tree.
   *
   * The tree itself is made on the server from the games on this platform,
   * so the answer is the same for everybody.
   */
  const explorer = useCallback(
    async (path: string[]): Promise<ExplorerResult> => {
      const unavailable = (message: string): ExplorerResult => ({
        ok: false,
        path,
        total: 0,
        moves: [],
        games: [],
        error: { code: "unavailable", message },
      });

      try {
        await connect();
      } catch {
        return unavailable("The game server could not be reached.");
      }

      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return unavailable("Connect to the game server to see the openings.");
      }

      try {
        const response = await client.rpc(currentSession, "chess_opening_explorer", {
          path,
        });
        return readExplorerResult(response.payload, path);
      } catch (cause) {
        return unavailable(
          cause instanceof Error
            ? cause.message
            : "The openings could not be read.",
        );
      }
    },
    [connect],
  );

  /** A puzzle to solve, and the game to make more of them when needed. */
  const puzzleNext = useCallback(async (): Promise<PuzzleNext> => {
    const empty: PuzzleNext = {
      puzzle: null,
      game: null,
      streak: 0,
      best: 0,
      solved: 0,
      remaining: 0,
    };

    try {
      await connect();
    } catch {
      return empty;
    }

    const client = clientRef.current;
    const currentSession = sessionRef.current;
    if (client === null || currentSession === null) {
      return empty;
    }

    try {
      const response = await client.rpc(currentSession, "chess_puzzle_next", {});
      return readPuzzleNext(response.payload);
    } catch {
      return empty;
    }
  }, [connect]);

  /** The puzzles the engine found in a game. */
  const puzzleSave = useCallback(
    async (input: {
      gameId: string;
      initialFen: string;
      steps: string[];
      puzzles: Array<{
        fen: string;
        solution: string;
        loss: number;
        cp: number;
        ply: number;
      }>;
    }): Promise<{ ok: boolean; kept: number; message: string | null }> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return {
          ok: false,
          kept: 0,
          message: "Connect to the game server to keep the puzzles.",
        };
      }

      try {
        const response = await client.rpc(
          currentSession,
          "chess_puzzle_save",
          input,
        );
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          kept?: number;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            kept: 0,
            message:
              payload.error?.message ?? "The puzzles could not be kept.",
          };
        }
        return { ok: true, kept: payload.kept ?? 0, message: null };
      } catch (cause) {
        return {
          ok: false,
          kept: 0,
          message:
            cause instanceof Error
              ? cause.message
              : "The puzzles could not be kept.",
        };
      }
    },
    [],
  );

  /** The move a player made, and whether it was the answer. */
  const puzzleAnswer = useCallback(
    async (id: string, move: string): Promise<PuzzleAnswer> => {
      const empty: PuzzleAnswer = {
        solved: false,
        streak: 0,
        best: 0,
        played: 0,
        solutionSan: "",
        solution: "",
      };

      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return empty;
      }

      try {
        const response = await client.rpc(currentSession, "chess_puzzle_answer", {
          id,
          move,
        });
        return readPuzzleAnswer(response.payload);
      } catch {
        return empty;
      }
    },
    [],
  );

  /** Start a run of puzzles with a clock on them. */
  const stormStart = useCallback(async (): Promise<{
    seconds: number;
    total: number;
  } | null> => {
    try {
      await connect();
    } catch {
      return null;
    }

    const client = clientRef.current;
    const currentSession = sessionRef.current;
    if (client === null || currentSession === null) {
      return null;
    }

    try {
      const response = await client.rpc(currentSession, "chess_storm_start", {});
      const payload = (response.payload ?? {}) as {
        ok?: boolean;
        seconds?: number;
        total?: number;
      };
      if (payload.ok !== true) {
        return null;
      }
      return {
        seconds: payload.seconds ?? 180,
        total: payload.total ?? 0,
      };
    } catch {
      return null;
    }
  }, [connect]);

  /** The next puzzle of the run. */
  const stormNext = useCallback(async (): Promise<StormState> => {
    const empty: StormState = {
      puzzle: null,
      score: 0,
      index: 0,
      total: 0,
      seconds: 0,
      finished: false,
    };

    const client = clientRef.current;
    const currentSession = sessionRef.current;
    if (client === null || currentSession === null) {
      return empty;
    }

    try {
      const response = await client.rpc(currentSession, "chess_storm_next", {});
      return readStormState(response.payload);
    } catch {
      return empty;
    }
  }, []);

  /** The move a player made in the run. */
  const stormAnswer = useCallback(
    async (
      id: string,
      move: string,
    ): Promise<{ solved: boolean; score: number; solutionSan: string }> => {
      const empty = { solved: false, score: 0, solutionSan: "" };

      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return empty;
      }

      try {
        const response = await client.rpc(currentSession, "chess_storm_answer", {
          id,
          move,
        });
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          solved?: boolean;
          score?: number;
          solutionSan?: string;
        };
        if (payload.ok !== true) {
          return empty;
        }
        return {
          solved: payload.solved === true,
          score: payload.score ?? 0,
          solutionSan: payload.solutionSan ?? "",
        };
      } catch {
        return empty;
      }
    },
    [],
  );

  /** The tournaments there are. */
  const tournamentList = useCallback(async (): Promise<Tournament[]> => {
    const client = clientRef.current;
    const currentSession = sessionRef.current;
    if (client === null || currentSession === null) {
      return [];
    }

    try {
      const response = await client.rpc(
        currentSession,
        "chess_tournament_list",
        {},
      );
      return readTournamentList(response.payload);
    } catch {
      return [];
    }
  }, []);

  /** A tournament and its standings. */
  const tournamentGet = useCallback(
    async (id: string): Promise<Tournament | null> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return null;
      }

      try {
        const response = await client.rpc(currentSession, "chess_tournament_get", {
          id,
        });
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          tournament?: unknown;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return null;
        }
        return readTournament(payload.tournament);
      } catch {
        return null;
      }
    },
    [],
  );

  /** Make a tournament. */
  const tournamentCreate = useCallback(
    async (input: {
      name: string;
      rounds: number;
      timeControl: { initialMs: number; incrementMs: number };
    }): Promise<{
      ok: boolean;
      tournament: Tournament | null;
      message: string | null;
    }> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return {
          ok: false,
          tournament: null,
          message: "Connect to the game server to make a tournament.",
        };
      }

      try {
        const response = await client.rpc(
          currentSession,
          "chess_tournament_create",
          input,
        );
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          tournament?: unknown;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            tournament: null,
            message:
              payload.error?.message ?? "The tournament could not be made.",
          };
        }
        return { ok: true, tournament: readTournament(payload.tournament), message: null };
      } catch (cause) {
        return {
          ok: false,
          tournament: null,
          message:
            cause instanceof Error
              ? cause.message
              : "The tournament could not be made.",
        };
      }
    },
    [],
  );

  /** Take a seat in a tournament. */
  const tournamentJoin = useCallback(
    async (id: string): Promise<{ ok: boolean; message: string | null }> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return {
          ok: false,
          message: "Connect to the game server to join a tournament.",
        };
      }

      try {
        const response = await client.rpc(currentSession, "chess_tournament_join", {
          id,
        });
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            message:
              payload.error?.message ?? "The tournament could not be joined.",
          };
        }
        return { ok: true, message: null };
      } catch (cause) {
        return {
          ok: false,
          message:
            cause instanceof Error
              ? cause.message
              : "The tournament could not be joined.",
        };
      }
    },
    [],
  );

  /** Leave a tournament. */
  const tournamentLeave = useCallback(
    async (id: string): Promise<{ ok: boolean; message: string | null }> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return { ok: false, message: "Connect to the game server to leave." };
      }

      try {
        const response = await client.rpc(
          currentSession,
          "chess_tournament_leave",
          { id },
        );
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            message:
              payload.error?.message ?? "The tournament could not be left.",
          };
        }
        return { ok: true, message: null };
      } catch (cause) {
        return {
          ok: false,
          message:
            cause instanceof Error
              ? cause.message
              : "The tournament could not be left.",
        };
      }
    },
    [],
  );

  /** Begin a tournament. */
  const tournamentStart = useCallback(
    async (id: string): Promise<{ ok: boolean; message: string | null }> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return {
          ok: false,
          message: "Connect to the game server to begin the tournament.",
        };
      }

      try {
        const response = await client.rpc(currentSession, "chess_tournament_start", {
          id,
        });
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            message:
              payload.error?.message ?? "The tournament could not be begun.",
          };
        }
        return { ok: true, message: null };
      } catch (cause) {
        return {
          ok: false,
          message:
            cause instanceof Error
              ? cause.message
              : "The tournament could not be begun.",
        };
      }
    },
    [],
  );

  /** Stop a tournament. Only its host may do so. */
  const tournamentCancel = useCallback(
    async (id: string): Promise<{ ok: boolean; message: string | null }> => {
      const client = clientRef.current;
      const currentSession = sessionRef.current;
      if (client === null || currentSession === null) {
        return {
          ok: false,
          message: "Connect to the game server to stop the tournament.",
        };
      }

      try {
        const response = await client.rpc(currentSession, "chess_tournament_cancel", {
          id,
        });
        const payload = (response.payload ?? {}) as {
          ok?: boolean;
          error?: { message?: string };
        };
        if (payload.ok !== true) {
          return {
            ok: false,
            message:
              payload.error?.message ?? "The tournament could not be stopped.",
          };
        }
        return { ok: true, message: null };
      } catch (cause) {
        return {
          ok: false,
          message:
            cause instanceof Error
              ? cause.message
              : "The tournament could not be stopped.",
        };
      }
    },
    [],
  );

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
      id: "chess_create_private_match" | "moongames_room_code_resolve",
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
    loadFriendsRef.current = loadFriends;
    return () => {
      if (loadFriendsRef.current === loadFriends) {
        loadFriendsRef.current = null;
      }
    };
  }, [loadFriends]);

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
        const socket = socketRef.current;
        const social =
          socialRef.current ??
          new MoonGamesSocialClient({
            client,
            session: currentSession,
            socket,
            selfUserId: currentSession.user_id,
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
          gameId: GAME_ID,
          mode: "private",
          matchId: targetMatchId,
          recipientId: input.userId,
          recipientUsername: input.username,
          metadata: {
            spectate: input.spectate === true,
            timeControl: input.timeControl ?? timeControl,
          },
        });
        let chatCardSent = false;
        if (socket !== null) {
          try {
            await social.sendInviteMessage(input.userId, invite);
            chatCardSent = true;
          } catch {
            // The persistent notification is still the authoritative delivery
            // path; surface the chat-card failure without losing the invite.
          }
        }
        setInviteNotice(
          chatCardSent
            ? `Invite sent to ${input.username}.`
            : `Invite sent to ${input.username}. The chat card could not be delivered, but the invite is waiting in MoonGames.`,
        );
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

  const dismissIncomingInvite = useCallback(() => {
    setIncomingInvite(null);
  }, []);

  const acceptIncomingInvite = useCallback(async (): Promise<void> => {
    const invite = incomingInvite;
    if (invite === null) {
      return;
    }
    const social = socialRef.current;
    if (social === null) {
      setError("Connect to the game server before accepting an invite.");
      return;
    }
    try {
      const accepted = await social.acceptInvite({
        inviteId: invite.inviteId,
      });
      setIncomingInvite(null);
      if (accepted.matchId === null) {
        setError("That invite no longer has a playable room.");
        return;
      }
      const currentMatchId = matchIdRef.current;
      if (
        currentMatchId !== null &&
        currentMatchId !== accepted.matchId &&
        !window.confirm("Leave the current match and join this invite?")
      ) {
        return;
      }
      await joinMatch(accepted.matchId, {
        spectator: inviteWantsSpectator(accepted),
      });
    } catch (cause) {
      setError(errorMessage(cause, "Could not accept that invite."));
    }
  }, [incomingInvite, joinMatch]);

  const quickMatch = useCallback(async () => {
    if (matchmakingActiveRef.current) {
      setError("A quick match search is already running.");
      return;
    }
    if (matchIdRef.current !== null) {
      setError("Leave the current table before starting a quick match.");
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
      };
      pending.timer = window.setTimeout(() => {
        if (matchmakerRef.current !== pending) {
          return;
        }
        matchmakerRef.current = null;
        if (pending.ticket !== null) {
          void activeSocket.removeMatchmaker(pending.ticket).catch(() => {
            // The ticket may already be gone.
          });
        }
        pending.reject(new Error("No opponent found. Try again."));
      }, MATCHMAKING_TIMEOUT_MS);
      matchmakerRef.current = pending;

      const ticket = await activeSocket.addMatchmaker(query, 2, 2, {
        game: GAME_ID,
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

      throw new Error("No opponent found. Try again.");
    } catch (cause) {
      if (run !== matchmakingRunRef.current) {
        return;
      }
      const pending = matchmakerRef.current;
      if (pending !== null) {
        window.clearTimeout(pending.timer);
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
  }, [requireSocket, timeControl]);

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
      // The room code is what the player reads out to their friend.
      setRoomCode(typeof result.roomCode === "string" ? result.roomCode : null);
      await joinMatch(result.matchId);
      return result.matchId;
    } catch (cause) {
      setError(errorMessage(cause, "Could not create a private match."));
      return null;
    }
  }, [callRpc, joinMatch, requireSocket, timeControl]);

  /**
   * Join a table by the short code the host read out. The server knows which
   * table the code names, so the client never has to know a match id.
   */
  const joinByRoomCode = useCallback(
    async (code: string): Promise<boolean> => {
      const trimmed = code.trim();
      if (trimmed.length === 0) {
        setError("Enter a room code.");
        return false;
      }
      try {
        await requireSocket();
        setError(null);
        const result = await callRpc("moongames_room_code_resolve", {
          code: trimmed,
          gameId: GAME_ID,
        });
        if (!result.ok || !result.matchId) {
          throw new Error(
            result.error?.message ?? "That room code was not found.",
          );
        }
        setRoomCode(typeof result.code === "string" ? result.code : trimmed.toUpperCase());
        await joinMatch(result.matchId);
        return true;
      } catch (cause) {
        setError(errorMessage(cause, "Could not join that room."));
        return false;
      }
    },
    [callRpc, joinMatch, requireSocket],
  );

  const leaveMatch = useCallback(async () => {
    const pending = matchmakerRef.current;
    if (pending !== null) {
      matchmakingRunRef.current += 1;
      matchmakingActiveRef.current = false;
      setMatchmaking(false);
      window.clearTimeout(pending.timer);
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
    setRoomCode(null);
    setServerState(null);
    rememberMatchId(null);
    rememberSpectating(false);
    setDrawOffer(null);
    clearSelection();
    clearPromotion();
    setInviteError(null);
    setInviteNotice(null);
    setInviteSendingId(null);
    setError(null);
  }, [clearPromotion, clearSelection]);

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
        .sendMatchState(currentMatchId, opCode, matchStateBytes(payload))
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
    serverState.state.turn === myColor &&
    // A move that is still on its way holds the table. Without this a
    // second move is sent on top of the first, and the server refuses it
    // because it is not the player's turn yet.
    !pendingMove;

  const sendMove = useCallback(
    (from: Square, to: Square, promotion?: PromotionPiece) => {
      // The board answers at once. The move is put on the table straight
      // away and the server has the last word, so a slow or broken
      // connection never leaves the player waiting for their own move.
      const current = serverState?.state ?? null;
      if (current !== null) {
        try {
          const engine = createChessEngine(current.fen);
          engine.move({ from, to, promotion });
          const optimistic = engine.getState();
          setServerState((previous) =>
            previous === null
              ? previous
              : { ...previous, state: optimistic },
          );
        } catch {
          // An illegal move is refused by the server, which says so.
        }
      }
      // The move is kept until the server has answered, so a connection that
      // drops in the middle of a move does not lose it.
      pendingMoveRef.current = { from, to, promotion };
      setPendingMove(true);
      sendMatchState(ONLINE_OP.MOVE_REQUEST, {
        from,
        to,
        promotion,
      });
      clearSelection();
      clearPromotion();
      setError(null);
    },
    [clearPromotion, clearSelection, sendMatchState, serverState],
  );

  const selectSquare = useCallback(
    (square: Square) => {
      if (serverState === null || myColor === null) {
        return;
      }

      if (pendingPromotion !== null) {
        // The picker is open. A second click on the same square is a quick
        // way to make the pawn a queen.
        if (
          autoQueen === AutoQueen.OnPromotion &&
          square === pendingPromotion.to
        ) {
          sendMove(pendingPromotion.from, pendingPromotion.to, "q");
        }
        return;
      }
      // A move that is still on its way holds the table. Without this a
      // second move is sent on top of the first, and the server refuses it
      // because it is not the player's turn yet.
      if (pendingMove) {
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

      // While the other player is thinking, the move is chosen for the turn
      // after this one.
      if (state.turn !== myColor) {
        choosePremove(square);
        return;
      }

      if (selected !== null) {
        const candidates = (state.legalMoves[selected] ?? []).filter(
          (move) => move.to === square,
        );

        if (candidates.length > 0) {
          if (candidates.some((move) => move.promotion !== undefined)) {
            const queen = promotionPiece(autoQueen, true);
            if (queen !== null) {
              sendMove(selected, square, queen);
              return;
            }
            choosePromotionTarget({
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
        toggleSelected(square);
        setError(null);
        return;
      }

      clearSelection();
    },
    [
      autoQueen,
      choosePromotionTarget,
      clearSelection,
      myColor,
      pendingPromotion,
      sendMove,
      selected,
      serverState,
      toggleSelected,
    ],
  );

  /**
   * Move a piece from one square to another, as a drag does.
   *
   * The move is checked against the table, so a drag that is not a legal
   * move is refused the same way a click is.
   */
  const movePiece = useCallback(
    (from: Square, to: Square) => {
      if (serverState === null || myColor === null || pendingMove) {
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
      if (state.turn !== myColor) {
        return;
      }

      const candidates = (state.legalMoves[from] ?? []).filter(
        (move) => move.to === to,
      );
      if (candidates.length === 0) {
        return;
      }

      if (candidates.some((move) => move.promotion !== undefined)) {
        const queen = promotionPiece(autoQueen, true);
        if (queen !== null) {
          sendMove(from, to, queen);
          return;
        }
        choosePromotionTarget({
          from,
          to,
          color: myColor,
        });
        setError(null);
        return;
      }

      sendMove(from, to);
    },
    [autoQueen, choosePromotionTarget, myColor, pendingMove, sendMove, serverState],
  );

  /**
   * Choose the move that is ready for the turn after this one.
   *
   * The first square is the piece, the second is where it goes.
   */
  const choosePremove = useCallback(
    (square: Square) => {
      if (serverState === null || myColor === null) {
        return;
      }

      // The square the piece of the ready move may go to.
      if (premoveFrom !== null && premoveTargets.includes(square)) {
        setPremove({ from: premoveFrom, to: square });
        setPremoveFrom(null);
        setPremoveTargets([]);
        return;
      }

      const piece = serverState.state.board.find(
        (candidate) => candidate.square === square,
      );
      if (piece?.color !== myColor) {
        setPremoveFrom(null);
        setPremoveTargets([]);
        return;
      }

      try {
        // chess.js only lists moves for the side to move. Looking at a premove
        // happens while the opponent is still on the clock, so the side in the
        // FEN has to be changed first or every own piece looks immobile.
        const engine = createChessEngine(
          fenForColor(serverState.state.fen, myColor),
        );
        const moves = engine.movesFrom(square);
        setPremoveFrom(square);
        setPremoveTargets([...new Set(moves.map((move) => move.to))]);
      } catch {
        setPremoveFrom(null);
        setPremoveTargets([]);
      }
    },
    [myColor, premoveFrom, premoveTargets, serverState],
  );

  /** Forget the move that is ready for the next turn. */
  const clearPremove = useCallback(() => {
    setPremove(null);
    setPremoveFrom(null);
    setPremoveTargets([]);
  }, []);

  // A half-chosen premove belongs to the opponent's turn only. Once the turn
  // comes back, stale targets would replace the real move dots and make the
  // board look unplayable, so they are cleared unless a full move was armed.
  useEffect(() => {
    if (serverState === null || myColor === null || premove !== null) {
      return;
    }
    if (serverState.state.turn !== myColor) {
      return;
    }
    if (premoveFrom === null && premoveTargets.length === 0) {
      return;
    }
    setPremoveFrom(null);
    setPremoveTargets([]);
  }, [myColor, premove, premoveFrom, premoveTargets.length, serverState]);

  // The move that is ready is played as soon as it is the player's turn.
  useEffect(() => {
    if (premove === null || serverState === null || myColor === null) {
      return;
    }
    if (serverState.state.turn !== myColor || pendingMove) {
      return;
    }
    const ready = premove;
    clearPremove();
    sendMove(ready.from, ready.to);
  }, [
    clearPremove,
    myColor,
    pendingMove,
    premove,
    sendMove,
    serverState,
  ]);

  /**
   * Play a move that was written with the keyboard.
   *
   * The move is looked for among the moves that are legal, so a move
   * written by hand is checked the same way a move made by clicking is.
   */
  const moveBySan = useCallback(
    (san: string): boolean => {
      if (serverState === null || myColor === null) {
        return false;
      }
      const moves = Object.values(serverState.state.legalMoves).flat();
      const found = findKeyboardMove(moves, readKeyboardMove(san));
      if (found === null) {
        return false;
      }
      if (found.promotion !== undefined) {
        choosePromotionTarget({
          from: found.from,
          to: found.to,
          color: myColor,
        });
        setError(null);
        return true;
      }
      sendMove(found.from, found.to);
      return true;
    },
    [choosePromotionTarget, myColor, sendMove, serverState],
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
    clearPromotion();
    clearSelection();
  }, [clearPromotion, clearSelection]);

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
    // A premove is only shown while it is still the opponent's turn. On the
    // player's own turn the dots must follow the selected piece, not a stale
    // choice from a moment earlier.
    const choosingPremove =
      premoveFrom !== null &&
      serverState !== null &&
      myColor !== null &&
      serverState.state.turn !== myColor;
    if (choosingPremove) {
      return premoveTargets;
    }

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
  }, [myColor, premoveFrom, premoveTargets, selected, serverState]);

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
    roomCode,
    joinByRoomCode,
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
    incomingInvite,
    loadFriends,
    clearInviteFeedback,
    inviteFriend,
    acceptIncomingInvite,
    dismissIncomingInvite,
    profile,
    history,
    leaderboard,
    leaderboardTotal,
    myLeaderboard,
    profileLoading,
    profileError,
    refreshProfile,
    importGame,
    explorer,
    puzzleNext,
    puzzleSave,
    puzzleAnswer,
    stormStart,
    stormNext,
    stormAnswer,
    tournamentList,
    tournamentGet,
    tournamentCreate,
    tournamentJoin,
    tournamentLeave,
    tournamentStart,
    tournamentCancel,
    connect,
    disconnect,
    quickMatch,
    cancelQuickMatch,
    createPrivateMatch,
    joinMatch,
    leaveMatch,
    opponentLeft,
    dismissOpponentLeft,
    selectSquare,
    movePiece,
    premove,
    premoveTargets,
    clearPremove,
    moveBySan,
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
